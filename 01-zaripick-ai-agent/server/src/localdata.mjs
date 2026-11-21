/* ============================================================
 *  LOCALDATA (행정안전부 지방행정 인허가) 클라이언트
 *
 *  왜 필요한가
 *    SGIS는 전국 '사업체 수'는 주지만 '폐업률'을 주지 않는다.
 *    LOCALDATA는 인허가일·폐업일·영업상태를 제공하므로
 *    전국에서 개업률·폐업률을 산출할 수 있는 유일한 무료 경로다.
 *
 *  조회 방식 — cond[필드::연산자] 문법
 *    이 API의 필터는 일반적인 파라미터명이 아니라 아래 형태다.
 *      cond[OPN_ATMY_GRP_CD::EQ]=3010000   개방자치단체코드 일치
 *      cond[SALS_STTS_CD::EQ]=01           영업상태 일치 (01 영업 / 03 폐업)
 *      cond[LCPMT_YMD::GTE]=20250812       인허가일 이상
 *      cond[CLSBIZ_YMD::GTE]=20250812      폐업일 이상
 *      cond[BZSTAT_SE_NM::LIKE]=커피숍      업태명 포함
 *      cond[DAT_UPDT_PNT::GTE]=YYYYMMDDHHMMSS
 *    조건은 겹쳐 쓸 수 있고, 응답 포맷은 resultType 이 아니라 returnType 이다.
 *
 *  덕분에 전량 적재 없이 요청 시점에 조회한다.
 *  필요한 건 건수뿐이라 numOfRows=1 로 부르고 totalCount 만 읽는다.
 * ============================================================ */
import { config, localdataEnabled } from './config.mjs';
import { findAtmy, atmyName } from './atmy-codes.mjs';

const L = config.localdata;

/* ---------- 서비스 목록 ---------- */
export const SERVICES = [
  { id: 'rest_cafes',                name: '휴게음식점' },
  { id: 'general_restaurants',       name: '일반음식점' },
  { id: 'bakeries',                  name: '제과점영업' },
  { id: 'beauty_salons',             name: '미용업' },
  { id: 'fitness_centers',           name: '체력단련장업' },
  { id: 'pharmacies',                name: '약국' },
  { id: 'clinics',                   name: '의원' },
  { id: 'large_scale_retail_stores', name: '대규모점포' },
  { id: 'lodgings',                  name: '숙박업' },
  { id: 'tourist_accommodations',    name: '관광숙박업' },
];

/* ---------- 영업상태코드 (참고문서 시트2) ---------- */
export const SALS_STATUS = {
  '01': '영업/정상', '02': '휴업', '03': '폐업',
  '04': '취소/말소/만료/정지/중지', '05': '제외/삭제/전출', '06': '기타',
};
const ACTIVE = '01';
const CLOSED = '03';

/* ============================================================
 *  자리픽 8개 업종 ← 서비스 + 업태(BZSTAT_SE_NM) LIKE
 *
 *  한 서비스에 여러 업종이 섞여 있어(일반음식점 = 한식·주점·중식…)
 *  업태명으로 가른다. terms 가 null 이면 서비스 전체를 쓴다.
 *  terms 가 여러 개면 각각 조회해 합산한다(호출 수가 늘어나므로
 *  실측상 비중이 큰 항목만 남겼다).
 * ============================================================ */
export const INDUSTRY_MAP = {
  cafe:    { svc: 'rest_cafes',          terms: ['커피숍', '다방', '아이스크림'] },
  conv:    { svc: 'rest_cafes',          terms: ['편의점'] },
  korean:  { svc: 'general_restaurants', terms: ['한식', '분식', '김밥'] },
  pub:     { svc: 'general_restaurants', terms: ['호프', '소주방', '감성주점'] },
  bakery:  { svc: 'bakeries',            terms: null },
  beauty:  { svc: 'beauty_salons',       terms: null },
  fitness: { svc: 'fitness_centers',     terms: null },
  // academy(학원·교육)는 교육청 소관이라 인허가 데이터에 없다.
};

export const SUPPORTED_INDUSTRIES = Object.keys(INDUSTRY_MAP);

/* ---------- 캐시 ---------- */
const cache = new Map();
const cacheGet = k => {
  const h = cache.get(k);
  return h && Date.now() - h.at < L.cacheMin * 60000 ? h.v : undefined;
};
const cacheSet = (k, v) => { cache.set(k, { at: Date.now(), v }); return v; };

/* ---------- 호출 ---------- */
export const isEnabled = () => localdataEnabled();

async function getTotal(serviceId, conds = {}) {
  const key = serviceId + '|' + JSON.stringify(conds);
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  let url = `${L.baseUrl}/${serviceId}/info`
    + `?serviceKey=${encodeURIComponent(L.apiKey)}`
    + `&pageNo=1&numOfRows=1&returnType=json`;
  for (const [k, v] of Object.entries(conds)) {
    url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), L.timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);

    let j;
    try { j = JSON.parse(text); }
    catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 160)}`); }

    if (j.OpenAPI_ServiceResponse) {
      const h = j.OpenAPI_ServiceResponse.cmmMsgHeader || {};
      throw new Error(`게이트웨이 ${h.returnReasonCode}: ${h.returnAuthMsg || h.errMsg}`);
    }
    const head = j.response?.header;
    if (head && String(head.resultCode) !== '0') {
      throw new Error(`LOCALDATA ${head.resultCode}: ${head.resultMsg}`);
    }
    return cacheSet(key, Number(j.response?.body?.totalCount) || 0);
  } finally {
    clearTimeout(timer);
  }
}

/** 재시도 — 공공 API는 간헐적으로 끊긴다.
 *  서비스에 따라 응답이 크게 느려질 때가 있어(미용업 등) 재시도 폭을 넉넉히 둔다.
 *  끝내 실패하면 예외를 던지지 않고 null 을 준다. 지표 하나가 안 나온다고
 *  화면 전체가 무너지면 안 되기 때문이다. 호출부가 null 을 보고 판단한다. */
async function getTotalSafe(serviceId, conds, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { return await getTotal(serviceId, conds); }
    catch (e) {
      if (i === tries - 1) {
        console.warn(`[localdata] ${serviceId} 조회 실패: ${String(e.message).slice(0, 80)}`);
        return null;
      }
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }
  }
  return null;
}

/* ---------- 조건 조립 ---------- */
const C = {
  atmy: cd => ({ 'cond[OPN_ATMY_GRP_CD::EQ]': cd }),
  status: cd => ({ 'cond[SALS_STTS_CD::EQ]': cd }),
  bzstat: t => ({ 'cond[BZSTAT_SE_NM::LIKE]': t }),
};

/* 날짜 필터의 실제 정밀도는 '연 단위'다 (실측).
   같은 해 안에서 날짜를 바꿔도 결과가 변하지 않는다:
     GTE 2025-01-01 = GTE 2025-08-11 = GTE 2025-12-31
   또 저장값이 'YYYY-MM-DD' 형식이라 하이픈 없는 '20250811' 을 주면
   문자 비교에서 '-'(0x2D) < '0'(0x30) 이 되어 그 해 자료가 통째로 빠진다.
   → 반드시 하이픈 형식으로, 연 경계(GTE + LT)로 창을 닫아 쓴다. */
const yearWindow = (field, year) => ({
  [`cond[${field}::GTE]`]: `${year}-01-01`,
  [`cond[${field}::LT]`]: `${year + 1}-01-01`,
});

/* ============================================================
 *  공개 API
 * ============================================================ */

/**
 * 지역 + 업종의 개·폐업 통계를 실시간 조회한다.
 * 지역명은 '부산광역시 해운대구' 처럼 SGIS 표기를 그대로 넣어도 된다.
 *
 * 기준은 '직전 완결 연도'다. "최근 1년"으로 잡으면 조회 시점에 따라
 * 창이 12~24개월로 늘었다 줄었다 해서 폐업률이 연중 계속 부풀어 오른다.
 * 완결된 해로 고정해야 지역 간·업종 간 비교가 성립한다.
 * 올해 진행분은 추세 참고용으로 따로 담는다.
 *
 * 호출 수 = 업태 수 × 5 (영업중 / 기준연도 개업·폐업 / 올해 개업·폐업).
 * 전부 병렬로 보내고 결과는 캐시한다.
 */
export async function getOpenCloseStats(regionName, industry) {
  if (!localdataEnabled()) return null;

  const map = INDUSTRY_MAP[industry];
  if (!map) return null;                       // academy 등 미지원 업종

  const atmy = findAtmy(regionName);
  if (!atmy) {
    /* 왜 없는지 말해 주는 편이 낫다. 대부분은 행정구역 개편 때문이다 —
       인천 중구·서구는 폐지되고 영종구·제물포구·서해구·검단구로 갈렸는데,
       하나로 대응시킬 방법이 없어 개폐업을 붙이지 않는다. */
    return {
      조회실패: true,
      사유: `'${regionName}' 에 해당하는 인허가 자치단체 코드가 없습니다. `
          + '행정구역 개편으로 관할이 나뉜 지역일 수 있습니다.',
    };
  }

  const thisYear = new Date().getFullYear();
  const baseYear = thisYear - 1;               // 직전 완결 연도
  const terms = map.terms || [null];           // null = 서비스 전체

  const rows = await Promise.all(terms.map(async term => {
    const base = { ...C.atmy(atmy.cd), ...(term ? C.bzstat(term) : {}) };
    const [active, opened, closed, openedNow, closedNow] = await Promise.all([
      getTotalSafe(map.svc, { ...base, ...C.status(ACTIVE) }),
      getTotalSafe(map.svc, { ...base, ...yearWindow('LCPMT_YMD', baseYear) }),
      getTotalSafe(map.svc, { ...base, ...yearWindow('CLSBIZ_YMD', baseYear) }),
      getTotalSafe(map.svc, { ...base, ...yearWindow('LCPMT_YMD', thisYear) }),
      getTotalSafe(map.svc, { ...base, ...yearWindow('CLSBIZ_YMD', thisYear) }),
    ]);
    return {
      업태: term || SERVICES.find(s => s.id === map.svc)?.name,
      active, opened, closed, openedNow, closedNow,
    };
  }));

  /* 하나라도 못 받았으면 합계를 내지 않는다.
     일부만 더한 값을 정상값처럼 보여주면 폐업률이 실제보다 낮게 나온다. */
  const miss = rows.some(r => [r.active, r.opened, r.closed].some(v => v === null));
  if (miss) {
    return {
      자치단체: atmy.nm, 코드: atmy.cd, 업종: industry,
      조회실패: true,
      사유: '원천 API 응답이 지연되어 일부 지표를 가져오지 못했습니다.',
      출처: 'LOCALDATA(행정안전부 지방행정 인허가)',
    };
  }

  const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const active = sum('active'), opened = sum('opened'), closed = sum('closed');

  /* 폐업률 = 기준연도 폐업 ÷ (영업 중 + 기준연도 폐업).
     누적 폐업을 분모에 넣으면 오래된 지역일수록 비율이 왜곡된다. */
  const closeRate = (active + closed) > 0
    ? Math.round(closed / (active + closed) * 1000) / 10 : null;
  const openRate = active > 0 ? Math.round(opened / active * 1000) / 10 : null;

  return {
    자치단체: atmy.nm,
    코드: atmy.cd,
    업종: industry,
    기준연도: baseYear,
    영업중: active,
    기준연도_개업: opened,
    기준연도_폐업: closed,
    폐업률_퍼센트: closeRate,
    개업률_퍼센트: openRate,
    올해: { 연도: thisYear, 개업: sum('openedNow'), 폐업: sum('closedNow'), 비고: '진행 중' },
    내역: rows,
    산출식: `폐업률 = ${baseYear}년 폐업 ÷ (영업 중 + ${baseYear}년 폐업)`,
    주의: `원천 데이터의 날짜 필터가 연 단위로만 동작해 '${baseYear}년 한 해'를 기준으로 삼았습니다. `
        + '서울 상권 분석의 폐업률과는 산출 기준이 달라 직접 비교할 수 없습니다.',
    출처: 'LOCALDATA(행정안전부 지방행정 인허가)',
  };
}

/** 연결 확인용 — 서비스 하나의 전체 건수 */
export async function ping(serviceId = 'bakeries') {
  return getTotalRetry(serviceId, {});
}

export function localdataStatus() {
  return {
    enabled: localdataEnabled(),
    baseUrl: L.baseUrl,
    mode: 'live',                   // 전량 적재 없이 요청 시점 조회
    services: SERVICES.length,
    industries: SUPPORTED_INDUSTRIES,
    unsupported: ['academy'],
    cachedQueries: cache.size,
    cacheMin: L.cacheMin,
    note: localdataEnabled()
      ? 'cond[필드::연산자] 필터로 지역·업종·기간을 직접 조회합니다. 적재가 필요 없습니다.'
      : 'LOCALDATA_API_KEY 가 없어 전국 개·폐업 기능이 꺼져 있습니다.',
  };
}

