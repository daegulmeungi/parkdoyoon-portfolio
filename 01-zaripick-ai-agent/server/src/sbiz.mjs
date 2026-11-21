/* ============================================================
 *  소상공인365(소상공인시장진흥공단 빅데이터 플랫폼) 연동
 *
 *  얻는 것
 *    전국 행정동 × 업종의 '점포당 월평균 매출'. 자리픽에 없던 축이다.
 *    유동인구·소득·소비·직장인구·주거인구·세대수·점포수도 같은 계열로 온다.
 *
 *  주의: certKey 는 데이터 키가 아니다
 *    발급받은 11개 인증키는 POST /pub/api/apics/checkApiCertVl 이 검증하고
 *    라우트명('simple', 'slsIdex' …)만 돌려준다. 즉 분석 '화면' 접근 권한이다.
 *    데이터는 그 화면이 쓰는 /gis/api/* 에서 오고, 이쪽은 인증을 요구하지 않는다.
 *    그래서 데이터는 gis 에서 받고, certKey 는 screenUrl() 딥링크에만 쓴다.
 *
 *  지역 코드는 이 서비스 것을 쓴다
 *    SGIS 는 중구를 11020, 여기는 1114 로 센다. 섞으면 필터가 통째로 빗나간다.
 *    그래서 시도·시군구·행정동 목록을 이 서비스에서 직접 받아 쓴다.
 *    시군구는 4자리(강남구 1168), 행정동은 8자리(명동 11140550)다.
 * ============================================================ */
import { config, sbizEnabled } from './config.mjs';
import { SBIZ_REGIONS, byCtyCd, byDongCd } from './sbiz-regions.mjs';

const S = config.sbiz;

/* ── 업종 매핑 ────────────────────────────────────────────────
   upjongCd 는 소분류(6자리) 하나만 받는다. 중분류·복수코드는 0건이 온다(실측).
   그래서 자리픽 업종 하나가 여러 코드면 각각 부르고 점포수 가중으로 합친다. */
export const SBIZ_INDUSTRY = {
  cafe:    { name: '카페·디저트',   codes: ['I21201', 'I21008'] },              // 카페, 아이스크림/빙수
  bakery:  { name: '베이커리',      codes: ['I21001', 'I21002'] },              // 빵/도넛, 떡/한과
  korean:  { name: '한식·분식',     codes: ['I20101', 'I20102', 'I21007'] },    // 백반/한정식, 국탕찌개, 김밥/분식
  pub:     { name: '주점·호프',     codes: ['I21103', 'I21101', 'I21104'] },    // 생맥주, 일반유흥, 요리주점
  beauty:  { name: '미용·뷰티',     codes: ['S20701', 'S20702', 'S20703'] },    // 미용실, 피부관리, 네일
  fitness: { name: '헬스·필라테스', codes: ['R10307', 'P10603'] },              // 헬스장, 요가/필라테스
  academy: { name: '학원·교육',     codes: ['P10501', 'P10615'] },              // 입시·교과, 외국어
  conv:    { name: '편의점·무인',   codes: ['G20405'] },                        // 편의점
};

/* ── 지표 엔드포인트 ──────────────────────────────────────────
   Rads 계열이 행정구역 단위다(bzznType=1). Bizon 계열은 주요상권 단위. */
const METRIC = {
  sale:   { ep: 'getMapRadsSaleAmt.json',      field: 'saleAmt',      byIndustry: true },
  store:  { ep: 'getMapRadsStorCnt.json',      field: 'storeCnt',     byIndustry: true },
  flow:   { ep: 'getMapRadsPopCnt.json',       field: 'popCnt' },
  income: { ep: 'getMapRadsWholEarnAmt.json',  field: 'wholEarnAmt' },
  spend:  { ep: 'getMapRadsWholCnsmpAmt.json', field: 'wholCnsmpAmt' },
  house:  { ep: 'getMapRadsHhCnt.json',        field: 'hhCnt' },
  worker: { ep: 'getMapRadsWrcpplCnt.json',    field: 'wrcpplCnt' },
  reside: { ep: 'getMapRadsWholPpltnCnt.json', field: 'wholPpltnCnt' },
};

const cache = new Map();
const ttl = () => S.cacheMin * 60_000;

/* 원자료에 점포당 월매출이 비상식적으로 큰 칸이 섞여 있다.
   실측: 강남구 개포2동 편의점 17곳에 277,157만원(월 27.7억/점포).
   같은 동의 카페·한식·미용은 정상이라 동 전체가 아니라 (동 × 업종) 칸의 결함이다.
   소상공인 점포 한 곳의 월매출로 가능한 범위를 넘으면 집계에서 뺀다.
   중앙값 배수로 거르는 방법은 못 쓴다 — 강남 편의점처럼 결함 칸이 여럿이면
   중앙값 자체가 오염된다. 그래서 절대 상한을 둔다. */
const MAX_SALE_MAN = 30_000;   // 월 3억원/점포

const num = v => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 몰아서 부르면 서버가 연결을 끊는다(ECONNRESET 실측).
   연결 오류일 때만 잠깐 쉬었다 다시 부른다. 500 은 파라미터 문제라 재시도하지 않는다. */
async function get(path, params, tries = 3) {
  const url = `${S.baseUrl}${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl()) return hit.v;

  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), S.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) return null;
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { return null; }
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return null; } }
      cache.set(url, { t: Date.now(), v: data });
      return data;
    } catch {
      if (i === tries - 1) return null;
      await sleep(800 * (i + 1));
    } finally { clearTimeout(timer); }
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/* ── 지역 인덱스 ─────────────────────────────────────────────
   시군구 목록과 각 시군구의 bbox 는 scripts/build-sbiz-regions.mjs 가
   미리 만들어 둔다. 요청 때마다 만들면 시군구 하나에 수십 회 호출이 들고,
   실제로 그렇게 돌렸다가 서버가 연결을 끊었다. */

export const regionIndex = () => SBIZ_REGIONS;

/* 같은 동을 SGIS 는 '종로1·2·3·4가동', 소상공인365 는 '종로1.2.3.4가동' 으로 쓴다.
   가운뎃점·마침표·괄호·공백을 모두 떼야 맞는다. */
const squash = s => String(s || '').replace(/[\s()·.,‧・]/g, '');

/* 시도 표기가 서로 다르다. SGIS·질의는 '광주광역시', 여기는 '전남광주통합특별시'.
   핵심 지명만 뽑아 느슨하게 맞춘다. */
const SIDO_HINT = [
  ['서울', /서울/], ['부산', /부산/], ['대구', /대구/], ['인천', /인천/],
  ['광주', /광주/], ['대전', /대전/], ['울산', /울산/], ['세종', /세종/],
  ['경기', /경기/], ['강원', /강원/],
  ['충북', /충청북|충북/], ['충남', /충청남|충남/],
  ['전북', /전(라)?북/], ['전남', /전(라)?남/],
  ['경북', /경상북|경북/], ['경남', /경상남|경남/], ['제주', /제주/],
];
/* 데이터 쪽 시도명은 힌트를 '여러 개' 가질 수 있다.
   '전남광주통합특별시' 하나가 옛 광주광역시와 전라남도를 모두 품고 있어서,
   먼저 걸린 하나만 쓰면 전남 시군구 297개가 통째로 실종된다(실측). */
const hintsOf = s => SIDO_HINT.filter(([, re]) => re.test(String(s || ''))).map(([k]) => k);

/* 질의 쪽은 앞머리에서만 찾는다 — '해운대구'의 '대구'가 걸리면 안 된다 */
const hintOfQuery = s => {
  const t = squash(s);
  return (SIDO_HINT.find(([, re]) => new RegExp('^(?:' + re.source + ')').test(t)) || [])[0] || null;
};

/** '부산 해운대구', '해운대구', '광주광역시 서구' 모두 받는다 */
export function findRegion(query) {
  const rows = SBIZ_REGIONS;
  const q = squash(query);
  if (!rows.length || q.length < 2) return null;

  const exact = rows.find(r => squash(r.fullName) === q);
  if (exact) return exact;

  const hint = hintOfQuery(query);
  const pool = hint ? rows.filter(r => hintsOf(r.megaNm).includes(hint)) : rows;
  if (!pool.length) return null;

  /* 세종처럼 시군구가 하나뿐인 시도는 시군구명을 볼 것도 없다.
     SGIS 는 '세종특별자치시 세종시', 여기는 '세종특별자치시' 라 이름이 안 맞는다. */
  if (hint && pool.length === 1) return pool[0];

  /* 앞머리 시도 표기를 떼고 남은 것이 시군구명이다.
     '충청북도청주시상당구' 처럼 정식 시도명이 붙어 오는 경우가 있어
     접미사 규칙만으로는 안 벗겨진다. 후보들의 시도명으로도 한 번 더 떼 본다. */
  let tail = q.replace(/^.*?(특별자치시|특별자치도|통합특별시|특별시|광역시)/, '');
  if (tail === q) {
    for (const k of new Set(pool.map(r => squash(r.megaNm)))) {
      if (q.startsWith(k)) { tail = q.slice(k.length); break; }
    }
  }
  if (tail === q) tail = q.replace(/^(경기|강원|충북|충남|전북|전남|경북|경남|제주)도?/, '');
  if (tail === q) tail = q.replace(/^(충청북|충청남|전라북|전라남|경상북|경상남)도?/, '');
  if (tail === q && hint && q.startsWith(hint)) tail = q.slice(hint.length);
  const base = tail.length >= 2 ? tail : q;

  /* '청주시상당구' 처럼 일반구까지 붙어 오면 시(市)까지만 맞으면 된다 —
     소상공인365 자치단체는 시 단위라 일반구를 따로 세지 않는다. */
  return pool.find(r => squash(r.ctyNm) === base)
      || pool.find(r => squash(r.ctyNm).startsWith(base))
      || pool.find(r => base.startsWith(squash(r.ctyNm)))
      || null;
}

/** 시군구의 행정동 목록 (생성된 인덱스에서 읽는다) */
export const listDongs = ctyCd => byCtyCd.get(String(ctyCd))?.dongList || [];

/**
 * 다른 체계의 행정동을 소상공인365 코드로 옮긴다.
 *
 * 코드를 그대로 쓸 수 없다 — 같은 명동을 SGIS 는 11020550, 여기는 11140550 이라 부른다.
 * 뒤 4자리가 우연히 맞는 동도 있지만(명동 550) 어긋나는 동이 있어(다산동 700 vs 625)
 * 코드로 맞추면 조용히 다른 동을 집는다. 그래서 시군구를 먼저 고정하고 이름으로 찾는다.
 *
 * @param regionName 시군구 전체 이름 (예: '서울특별시 중구')
 * @param dongName   행정동 이름 (예: '명동')
 */
export function findDong(regionName, dongName) {
  const q = squash(dongName);
  if (!q) return null;

  /* 행정동 개편 흔적을 흡수한 느슨한 키.
     '박달1동'을 소상공인365 는 '박달동' 하나로 합쳤고, 읍 승격으로 '대소면'이 '대소읍'이 됐다.
     숫자를 떼고 읍·면·동 접미사를 하나로 뭉개면 같은 곳으로 읽힌다.
     시군구 안에서만 쓰므로 다른 지역과 헷갈릴 여지는 없다. */
  const loose = s => squash(s).replace(/\d+/g, '').replace(/[읍면동]$/, '');
  const lq = loose(dongName);

  const reg = findRegion(regionName);
  if (reg) {
    const hit = reg.dongList.find(d => squash(d.name) === q)
             || reg.dongList.find(d => squash(d.name).startsWith(q))
             || reg.dongList.find(d => q.startsWith(squash(d.name)))
             || (lq.length >= 2 && reg.dongList.filter(d => loose(d.name) === lq).length === 1
                 ? reg.dongList.find(d => loose(d.name) === lq) : null);
    if (hit) return { ...hit, region: reg };
  }

  /* 시군구가 통째로 바뀐 경우가 있다 — 인천 중구·동구·서구가 폐지되고
     영종구·제물포구·서해구·검단구가 생겼다. 옛 구 이름으로 물으면 시군구부터 안 잡히므로
     시도만 붙잡고 그 안에서 동 이름으로 찾는다.
     이름이 '하나만' 맞을 때에 한해 준다 — 둘 이상이면 어느 쪽인지 알 수 없고,
     조용히 틀린 동을 집느니 없다고 하는 편이 낫다. */
  const hint = hintOfQuery(regionName);
  const sameSido = reg ? SBIZ_REGIONS.filter(r => r.megaCd === reg.megaCd)
                : hint ? SBIZ_REGIONS.filter(r => hintsOf(r.megaNm).includes(hint))
                : [];
  const found = [];
  for (const r of sameSido) {
    for (const d of r.dongList) if (squash(d.name) === q) found.push({ ...d, region: r });
  }
  return found.length === 1 ? found[0] : null;
}

/** 소상공인365 행정동 코드로 직접 찾기 */
export const dongByCode = cd => byDongCd.get(String(cd)) || null;

/** 시군구를 덮는 bbox(EPSG:5181) — 생성된 인덱스에서 읽는다 */
export const bboxOfRegion = ctyCd => byCtyCd.get(String(ctyCd))?.bbox || null;

/* ── 지표 조회 ───────────────────────────────────────────────── */

/* 같은 행정동이 여러 행으로 온다. 값은 같은데 storeCnt 는 정상값과 그 3배가 섞인다
   (지도 마커가 겹쳐 그려지는 탓으로 보인다). 정상값은 늘 최솟값이었다.

   3배 행의 매출은 신뢰할 수 없다. 점포가 적어 값이 가려진 동('- 만원')에서
   3배 행에만 값이 남는 경우가 있는데, 그 값이 터무니없다
   (실측: 개포1동 편의점 2곳인데 41억원/월). 그래서 매출은 '점포수가 최솟값인 행'
   에서만 읽고, 그런 행에 값이 없으면 그 동은 값 없음으로 둔다. */
function byDong(rows, field) {
  const grouped = new Map();
  for (const r of rows || []) {
    if (!r.admCd) continue;
    if (!grouped.has(r.admCd)) grouped.set(r.admCd, []);
    grouped.get(r.admCd).push(r);
  }

  const out = new Map();
  for (const [cd, rs] of grouped) {
    const stores = rs.map(r => num(r.storeCnt)).filter(n => n !== null);
    const minStore = stores.length ? Math.min(...stores) : null;

    // 점포수가 실린 지표라면 최솟값 행만 신뢰한다
    const trusted = minStore === null ? rs : rs.filter(r => num(r.storeCnt) === minStore);
    const vals = trusted.map(r => num(r[field])).filter(n => n !== null);
    if (!vals.length) continue;                      // 가려진 값('- 만원')뿐이면 버린다

    out.set(cd, { admNm: rs[0].admNm, value: Math.min(...vals), store: minStore });
  }
  return out;
}

/**
 * bbox 안 행정동별 지표.
 * @param bbox     EPSG:5181 {minXAxis,maxXAxis,minYAxis,maxYAxis}
 * @param industry 자리픽 업종 id
 * @param prefix   행정동코드 앞자리 필터 (시군구 4자리 / 시도 2자리)
 */
export async function getDongMetrics(bbox, industry, prefix = '') {
  if (!sbizEnabled()) return null;
  const ind = SBIZ_INDUSTRY[industry];
  if (!ind || !bbox) return null;

  const base = { mapLevel: 3, substr: 8, bzznType: 1, ...bbox };
  const keep = cd => !prefix || String(cd).startsWith(prefix);

  /* 업종 무관 지표는 코드 하나로 한 번만 부르면 된다 */
  const jobs = [
    ...Object.keys(METRIC).filter(k => !METRIC[k].byIndustry).map(k => ({ k, code: ind.codes[0] })),
    ...ind.codes.flatMap(code => [{ k: 'sale', code }, { k: 'store', code }]),
  ];

  const results = await mapLimit(jobs, S.concurrency, async ({ k, code }) => {
    const rows = await get(`/gis/api/${METRIC[k].ep}`, { ...base, upjongCd: code });
    return { k, map: byDong(rows, METRIC[k].field) };
  });

  /* 매출은 '점포당 평균'이라 코드끼리 합칠 때 점포수 가중평균이어야 한다 */
  const dongs = new Map();
  for (const { k, map } of results) {
    for (const [cd, v] of map) {
      if (!keep(cd)) continue;
      if (!dongs.has(cd)) dongs.set(cd, { admCd: cd, admNm: v.admNm, 점포수: 0, _num: 0, _den: 0 });
      const d = dongs.get(cd);
      if (k === 'store') d.점포수 += v.value;
      else if (k === 'sale') {
        if (v.value > MAX_SALE_MAN) { d._dropped = (d._dropped || 0) + 1; continue; }
        d._num += v.value * (v.store ?? 0); d._den += v.store ?? 0;
      } else d[k] = v.value;
    }
  }

  const out = [...dongs.values()].map(d => ({
    행정동코드: d.admCd, 행정동: d.admNm,
    점포수: d.점포수,
    점포당_월매출_만원: d._den > 0 ? Math.round(d._num / d._den) : null,
    자료이상: d._dropped ? true : undefined,
    유동인구: d.flow ?? null,
    월평균소득_만원: d.income ?? null,
    월평균소비_만원: d.spend ?? null,
    세대수: d.house ?? null,
    직장인구: d.worker ?? null,
    주거인구: d.reside ?? null,
  }));
  out.sort((a, b) => (b.점포당_월매출_만원 ?? -1) - (a.점포당_월매출_만원 ?? -1));
  return out;
}

/**
 * 행정동 하나의 시장 지표.
 * 서울 상권 캐시가 들고 있는 admCd 가 소상공인365 행정동코드와 같은 체계라
 * 상권 리포트에 '점포당 월매출'을 그대로 붙일 수 있다.
 * 조회는 시군구 단위로 한 번만 하고 캐시에서 걸러 쓴다.
 */
export async function getDongMarket(admCd, industry) {
  const cd = String(admCd || '');
  if (!sbizEnabled() || cd.length < 8) return null;
  const reg = byCtyCd.get(cd.slice(0, 4));
  if (!reg) return null;

  const dongs = await getDongMetrics(reg.bbox, industry, reg.ctyCd);
  const hit = dongs?.find(d => d.행정동코드 === cd);
  if (!hit) return null;

  /* 같은 시군구 안에서 몇 번째인지가 절대값보다 읽기 쉽다 */
  const ranked = dongs.filter(d => d.점포당_월매출_만원 != null);
  const rank = ranked.findIndex(d => d.행정동코드 === cd);

  return {
    ...hit,
    시군구: reg.fullName,
    시군구_행정동수: dongs.length,
    매출순위: rank >= 0 ? rank + 1 : null,
    매출순위_모수: ranked.length || null,
    출처: '소상공인시장진흥공단 소상공인365',
  };
}

/**
 * 시군구명 + 행정동명으로 행정동 시장 지표를 낸다.
 * SGIS 코드 체계에서 넘어올 때 쓴다 — 코드가 아니라 이름으로 다리를 놓는다.
 */
export async function getDongStats(regionName, dongName, industry) {
  const d = findDong(regionName, dongName);
  return d ? getDongMarket(d.admCd, industry) : null;
}

/** 지역명으로 시군구 단위 시장 지표를 낸다 */
export async function getMarketStats(regionName, industry) {
  if (!sbizEnabled() || !SBIZ_INDUSTRY[industry]) return null;

  const reg = findRegion(regionName);
  if (!reg?.bbox) return null;
  const bbox = reg.bbox;

  const dongs = await getDongMetrics(bbox, industry, reg.ctyCd);
  if (!dongs || !dongs.length) return null;

  const sum = k => dongs.reduce((a, d) => a + (d[k] ?? 0), 0);
  const avg = k => {
    const v = dongs.map(d => d[k]).filter(n => typeof n === 'number');
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const store = sum('점포수');
  const wsale = dongs.reduce((a, d) => a + (d.점포당_월매출_만원 ?? 0) * (d.점포수 ?? 0), 0);

  const 제외 = dongs.filter(d => d.자료이상).length;

  return {
    지역: reg.fullName,
    시군구코드: reg.ctyCd,
    업종: SBIZ_INDUSTRY[industry].name,
    행정동수: dongs.length,
    매출제외_행정동수: 제외 || undefined,
    점포수: store,
    점포당_월매출_만원: store > 0 ? Math.round(wsale / store) : null,
    유동인구: sum('유동인구') || null,
    직장인구: sum('직장인구') || null,
    주거인구: sum('주거인구') || null,
    세대수: sum('세대수') || null,
    월평균소득_만원: avg('월평균소득_만원'),
    월평균소비_만원: avg('월평균소비_만원'),
    상위_행정동: dongs.filter(d => d.점포당_월매출_만원).slice(0, 5).map(d => ({
      행정동: d.행정동, 점포수: d.점포수, 점포당_월매출_만원: d.점포당_월매출_만원,
    })),
    출처: '소상공인시장진흥공단 소상공인365',
  };
}

/* ── 분석 화면 딥링크 (certKey 의 유일한 용도) ─────────────────── */

export const SBIZ_SCREENS = {
  hpReport: '테마상권 분석', weather: '창업기상도', slsIdex: '점포당 매출액 추이',
  storSttus: '업소현황', stcarSttus: '업력현황', detail: '상세분석',
  startupPublic: '상권지도', delivery: '배달분석', tour: '관광 축제 정보',
  simple: '간단분석', snsAnaly: 'SNS 분석',
};

export function screenUrl(screen) {
  const key = S.certKeys[screen];
  return key ? `${S.baseUrl}/#/openApi/${screen}?certKey=${key}` : null;
}

/** 인증키가 들어온 화면만 목록으로 낸다 */
export const listScreens = () =>
  Object.entries(SBIZ_SCREENS)
    .map(([id, name]) => ({ id, name, url: screenUrl(id) }))
    .filter(s => s.url);

export const sbizStatus = () => ({
  enabled: sbizEnabled() && SBIZ_REGIONS.length > 0,
  regions: SBIZ_REGIONS.length,
  screens: listScreens().length,
  industries: Object.keys(SBIZ_INDUSTRY).length,
});
