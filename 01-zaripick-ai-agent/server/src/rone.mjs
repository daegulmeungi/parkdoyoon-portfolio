/* ============================================================
 *  한국부동산원 R-ONE 연동 — 상업용부동산 임대동향조사
 *
 *  왜 필요한가
 *    서울 밖에서 마지막까지 없던 축이 '임대료'였다. 임대료가 없으면
 *    예산적합도도, 초기비용도, 자금 계획도 만들 수 없다.
 *    R-ONE 이 전국 276개 상권의 임대료·공실률과 시도×업종 권리금을 준다.
 *
 *  호출 방식
 *    GET /SttsApiTblData.do?KEY=&STATBL_ID=&DTACYCLE_CD=&Type=json&pIndex=&pSize=
 *    통계표 하나가 수천 행뿐이라 적재하지 않고 통째로 받아 캐시한다.
 *
 *  지역 해상도
 *    R-ONE 의 단위는 행정구역이 아니라 자체 '상권'이다('광주>금남로/충장로').
 *    시군구와 1:1로 맞지 않으므로 두 단계로 준다.
 *      1) 시군구 이름이 상권명에 들어 있으면 그 상권들의 평균  (230곳 중 90곳)
 *      2) 아니면 그 시도의 대표값                              (나머지 전부)
 *    어느 쪽을 썼는지 항상 '기준'에 적어 보낸다 — 정밀도를 숨기지 않는다.
 * ============================================================ */
import { config, roneEnabled } from './config.mjs';

const R = config.rone;

/* 통계표 ID.
   R-ONE 이 표를 다시 낼 때 ID 가 바뀔 수 있어, 비면 이름으로 다시 찾는다(아래 resolve). */
const TABLE = {
  rent:     { id: 'T248223134698125', cycle: 'QY', name: '임대동향 지역별 임대료(2024년3분기~)_소규모 상가' },
  vacancy:  { id: 'T241833134686576', cycle: 'QY', name: '임대동향 지역별 공실률(2024년3분기~)_소규모 상가' },
  keyMoney: { id: 'A_2024_00445',     cycle: 'YY', name: '시도별/업종별 상가권리금(2022년~)' },
};

/* 자리픽 8업종 → R-ONE 권리금 업종 분류.
   R-ONE 쪽 분류가 대분류뿐이라 정확히 겹치지 않는다. 교육은 항목 자체가 없어 전체값을 쓴다. */
const KEYMONEY_CLS = {
  cafe:    '숙박 및 음식점업',
  bakery:  '숙박 및 음식점업',
  korean:  '숙박 및 음식점업',
  pub:     '숙박 및 음식점업',
  conv:    '도매 및 소매',
  beauty:  '협회 및 단체,수리 및  기타 개인 서비스업',
  fitness: '예술,스포츠 및, 여가 관련 서비스업',
  academy: null,     // 교육 서비스업 분류가 없다 → 전체
};

/* 시도 표기: 우리는 '서울특별시', R-ONE 은 '서울' */
const SIDO_SHORT = [
  ['서울', /서울/], ['부산', /부산/], ['대구', /대구/], ['인천', /인천/],
  ['광주', /광주/], ['대전', /대전/], ['울산', /울산/], ['세종', /세종/],
  ['경기', /경기/], ['강원', /강원/],
  ['충북', /충청북|충북/], ['충남', /충청남|충남/],
  ['전북', /전(라)?북/], ['전남', /전(라)?남/],
  ['경북', /경상북|경북/], ['경남', /경상남|경남/], ['제주', /제주/],
];
/* '전남광주통합특별시'는 광주·전남 어느 쪽으로도 읽힌다. 앞머리 표기를 우선한다. */
const shortOf = s => {
  const t = String(s || '');
  const head = SIDO_SHORT.find(([, re]) => new RegExp('^(?:' + re.source + ')').test(t));
  return (head || SIDO_SHORT.find(([, re]) => re.test(t)) || [])[0] || null;
};

const squash = s => String(s || '').replace(/[\s()·.\/]/g, '');
/** 천원/㎡ → 만원/평 (1평 = 3.3058㎡) */
export const toManPerPyeong = v => Math.round(v * 3.3058 / 10 * 10) / 10;

const cache = new Map();
const ttl = () => R.cacheMin * 60_000;

async function getJson(path, params) {
  const url = `${R.baseUrl}/${path}?${new URLSearchParams({ KEY: R.apiKey, Type: 'json', ...params })}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), R.timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    /* content-type 이 text/html 로 오지만 본문은 JSON 이다 */
    return JSON.parse(await res.text());
  } catch { return null; } finally { clearTimeout(timer); }
}

/** 통계표 한 장을 전부 받는다 (페이지 1,000행) */
async function fetchTable(id, cycle) {
  const rows = [];
  for (let p = 1; p <= 30; p++) {
    const j = await getJson('SttsApiTblData.do', {
      STATBL_ID: id, DTACYCLE_CD: cycle, pIndex: p, pSize: 1000,
    });
    const got = j?.SttsApiTblData?.[1]?.row;
    if (!Array.isArray(got)) break;
    rows.push(...got);
    if (got.length < 1000) break;
  }
  return rows;
}

/* 표 ID 가 바뀌면 이름으로 다시 찾는다. 하드코딩한 ID 하나 때문에
   임대료 축이 통째로 사라지는 일을 막는다. */
let tableList = null;
async function resolveId(key) {
  const t = TABLE[key];
  if (!tableList) {
    tableList = [];
    for (let p = 1; p <= 10; p++) {
      const j = await getJson('SttsApiTbl.do', { pIndex: p, pSize: 100 });
      const got = j?.SttsApiTbl?.[1]?.row;
      if (!Array.isArray(got)) break;
      tableList.push(...got);
      if (got.length < 100) break;
    }
  }
  const hit = tableList.find(x => x.STATBL_NM === t.name)
           || tableList.find(x => x.STATBL_NM?.includes(t.name.split('_').pop()));
  return hit?.STATBL_ID || null;
}

/** 통계표의 '가장 최근 시점' 행만 남겨 캐시한다 */
async function latest(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl()) return hit.v;
  if (!roneEnabled()) return null;

  const t = TABLE[key];
  let rows = await fetchTable(t.id, t.cycle);
  if (!rows.length) {
    const alt = await resolveId(key);
    if (alt && alt !== t.id) rows = await fetchTable(alt, t.cycle);
  }
  if (!rows.length) return null;

  const when = [...new Set(rows.map(r => r.WRTTIME_IDTFR_ID))].sort().pop();
  const v = { when, desc: rows.find(r => r.WRTTIME_IDTFR_ID === when)?.WRTTIME_DESC || when,
              rows: rows.filter(r => r.WRTTIME_IDTFR_ID === when) };
  cache.set(key, { t: Date.now(), v });
  return v;
}

const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/* CLS_FULLNM 이 '서울>명동' 이면 상권, '서울' 이면 시도 대표값이다 */
const isZone = r => String(r.CLS_FULLNM || '').includes('>');
const sidoOf = r => String(r.CLS_FULLNM || r.CLS_NM).split('>')[0];

/**
 * 지역의 임대료·공실률.
 * @param regionName 시군구 전체 이름 (예: '부산광역시 해운대구')
 */
export async function getRent(regionName) {
  const [rent, vac] = await Promise.all([latest('rent'), latest('vacancy')]);
  if (!rent) return null;

  const short = shortOf(regionName);
  if (!short) return null;

  /* 시군구명에서 접미사를 뗀 알맹이로 상권명을 훑는다.
     '해운대구' → '해운대' 가 '해운대' 상권과 맞는다.

     SGIS 는 이름을 '부산광역시해운대구' 처럼 붙여서 준다. 공백으로만 자르면
     시도까지 통째로 남아 상권 매칭이 조용히 빗나가고 늘 시도 평균으로 떨어진다. */
  let sgg = squash(regionName).replace(/^.*?(특별자치시|특별자치도|통합특별시|특별시|광역시)/, '');
  if (sgg === squash(regionName)) {
    sgg = sgg.replace(/^(충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|경기도|강원도|제주도)/, '')
             .replace(/^(강원|전북|제주)특별자치도/, '');
  }
  const key = sgg.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/, '');

  const pickZones = rows => (key.length >= 2)
    ? rows.filter(r => isZone(r) && sidoOf(r) === short && squash(r.CLS_NM).includes(key))
    : [];
  const pickSido = rows => rows.filter(r => !isZone(r) && r.CLS_NM === short);

  const zones = pickZones(rent.rows);
  const use = zones.length ? zones : pickSido(rent.rows);
  if (!use.length) return null;

  const 천원제곱m = avg(use.map(r => r.DTA_VAL));
  const vacRows = vac ? (zones.length ? pickZones(vac.rows) : pickSido(vac.rows)) : [];

  return {
    지역: regionName,
    임대료_만원_평: toManPerPyeong(천원제곱m),
    임대료_천원_제곱m: Math.round(천원제곱m * 10) / 10,
    공실률_퍼센트: vacRows.length ? Math.round(avg(vacRows.map(r => r.DTA_VAL)) * 10) / 10 : null,
    기준: zones.length ? `${short} 지역 상권 ${zones.length}곳 평균` : `${short} 시도 평균`,
    해상도: zones.length ? '상권' : '시도',
    상권: zones.length ? zones.map(r => r.CLS_NM) : null,
    시점: rent.desc,
    유형: '소규모 상가',
    출처: '한국부동산원 상업용부동산 임대동향조사',
  };
}

/** 시도·업종별 권리금 */
export async function getKeyMoney(regionName, industry) {
  const km = await latest('keyMoney');
  if (!km) return null;

  const short = shortOf(regionName) || '전국';
  const cls = KEYMONEY_CLS[industry] ?? null;

  const pick = (grp, clsNm) => km.rows.filter(r =>
    r.GRP_NM === grp && String(r.CLS_NM).trim() === String(clsNm).trim());

  /* 시도×업종 → 시도 전체 → 전국 순으로 물러난다 */
  let rows = cls ? pick(short, cls) : [];
  let 기준 = `${short} · ${cls}`;
  if (!rows.length) { rows = pick(short, '전체'); 기준 = `${short} · 전체 업종`; }
  if (!rows.length) { rows = pick('전국', cls || '전체'); 기준 = `전국 · ${cls || '전체 업종'}`; }
  if (!rows.length) return null;

  const val = nm => rows.find(r => r.ITM_NM === nm)?.DTA_VAL ?? null;
  const r1 = Math.round;
  return {
    권리금_있는_비율_퍼센트: val('권리금 유 비율') != null ? r1(val('권리금 유 비율') * 10) / 10 : null,
    권리금_평균_만원: val('권리금 수준_평균') != null ? r1(val('권리금 수준_평균')) : null,
    권리금_중위_만원: val('권리금 수준_중위수') != null ? r1(val('권리금 수준_중위수')) : null,
    권리금_제곱m당_만원: val('권리금 수준_㎡당 평균') != null ? r1(val('권리금 수준_㎡당 평균') * 10) / 10 : null,
    기준,
    시점: km.desc,
    주의: '권리금은 시도·업종 대분류 평균이다. 개별 점포의 권리금은 입지·시설에 따라 크게 다르다.',
    출처: '한국부동산원 상가건물 임대차 실태조사',
  };
}

/** 면적(평)에 대한 권리금 추정 — 중위수를 기준으로 삼는다 */
export function estimateKeyMoney(km, areaPyeong) {
  if (!km) return null;
  /* ㎡당 평균이 있으면 면적에 비례시키고, 없으면 중위수를 그대로 쓴다.
     평균은 소수의 고액 사례에 끌려가므로 중위수를 우선한다. */
  if (km.권리금_제곱m당_만원 != null && areaPyeong > 0) {
    return Math.round(km.권리금_제곱m당_만원 * areaPyeong * 3.3058);
  }
  return km.권리금_중위_만원 ?? km.권리금_평균_만원 ?? null;
}

export const roneStatus = () => ({ enabled: roneEnabled() });
