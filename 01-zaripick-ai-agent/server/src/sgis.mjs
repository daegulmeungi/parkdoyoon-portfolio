/* ============================================================
 *  SGIS (통계청 통계지리정보서비스) OpenAPI3 클라이언트
 *
 *  왜 필요한가
 *    seoul_db 는 서울 전용이다. SGIS 는 같은 지표를 '전국 행정동' 단위로
 *    제공하므로 전국 확장의 기준 데이터가 된다.
 *
 *  설계
 *    · 액세스토큰은 발급 후 재사용한다. 응답의 accessTimeout(만료 epoch ms)을
 *      그대로 신뢰하되 안전 여유를 두고 미리 갱신한다.
 *    · 일일 호출 한도(무료 50,000회)를 아끼기 위해 조회 결과를 메모리에 캐시한다.
 *    · 자격증명이 없으면 예외를 던지지 않고 { ok:false } 를 돌려준다.
 *      → 서울 분석 등 기존 기능은 영향을 받지 않는다.
 *
 *  주의: SGIS 는 실패해도 HTTP 200 을 주고 errCd 로 알린다. 반드시 errCd 를 본다.
 * ============================================================ */
import { config, sgisEnabled } from './config.mjs';

const S = config.sgis;

/* 토큰 만료 전에 미리 갱신할 여유 (5분) */
const TOKEN_SAFETY_MS = 5 * 60 * 1000;

let token = null;          // { value, expiresAt }
let tokenPromise = null;   // 동시 요청이 토큰을 중복 발급하지 않도록 공유

const cache = new Map();   // key → { at, data }

/* SGIS 응답 코드 (문서 기준) */
const ERR = {
  '0': '정상',
  '-401': '필수 파라미터 누락',
  '-100': '검색결과 없음',
};

/* ---------- 저수준 호출 ---------- */
async function getJson(path, params, { timeoutMs = S.timeoutMs } = {}) {
  const url = new URL(`${S.baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`SGIS HTTP ${res.status}: ${text.slice(0, 200)}`);

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`SGIS 응답 파싱 실패: ${text.slice(0, 200)}`); }

    // errCd 는 숫자/문자열이 섞여 오므로 문자열로 비교한다
    const code = String(data.errCd ?? '0');
    if (code !== '0') {
      const err = new Error(`SGIS ${code}: ${data.errMsg || ERR[code] || '알 수 없는 오류'}`);
      err.errCd = code;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 인증 ---------- */
async function issueToken() {
  const data = await getJson('/auth/authentication.json', {
    consumer_key: S.serviceId,
    consumer_secret: S.securityKey,
  });
  const r = data.result || {};
  if (!r.accessToken) throw new Error('SGIS 토큰 발급 실패: accessToken 없음');

  // accessTimeout 은 만료 시각(epoch ms) 문자열
  const raw = Number(r.accessTimeout);
  const expiresAt = Number.isFinite(raw) && raw > Date.now()
    ? raw
    : Date.now() + 3 * 60 * 60 * 1000;   // 값이 이상하면 3시간으로 보수적 처리

  return { value: r.accessToken, expiresAt };
}

/** 유효한 액세스토큰 확보 (캐시 + 동시성 제어) */
async function getToken() {
  if (token && Date.now() < token.expiresAt - TOKEN_SAFETY_MS) return token.value;
  if (tokenPromise) return tokenPromise;

  tokenPromise = issueToken()
    .then(t => {
      token = t;
      const mins = Math.round((t.expiresAt - Date.now()) / 60000);
      console.log(`[sgis] 토큰 발급 · 약 ${mins}분 유효`);
      return t.value;
    })
    .finally(() => { tokenPromise = null; });

  return tokenPromise;
}

/* ---------- 인증이 필요한 호출 ---------- */
async function call(path, params = {}, { cacheable = true } = {}) {
  const key = path + '?' + new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();

  if (cacheable) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < S.cacheMin * 60000) return hit.data;
  }

  let data;
  try {
    data = await getJson(path, { ...params, accessToken: await getToken() });
  } catch (e) {
    /* 토큰 만료/무효로 보이면 한 번만 재발급 후 재시도 */
    if (/(-?401|토큰|token|인증)/i.test(e.message)) {
      token = null;
      data = await getJson(path, { ...params, accessToken: await getToken() });
    } else {
      throw e;
    }
  }

  if (cacheable) cache.set(key, { at: Date.now(), data });
  return data;
}

/* 숫자 변환: SGIS 는 모든 값을 문자열로 주고 결측은 'N/A' 로 표기한다 */
const n = v => {
  if (v === undefined || v === null || v === '' || v === 'N/A') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/* ============================================================
 *  업종 매핑 — 자리픽 8개 UI 업종 → SGIS 테마코드
 *
 *  SGIS 사업체통계(stats/company)는 테마코드로 업종을 지정한다.
 *  한 UI 업종이 여러 테마에 걸치는 경우 합산한다.
 *  (문서 p.18~19 테마 코드표 기준)
 * ============================================================ */
export const SGIS_THEME = {
  cafe:    [{ cd: '5010', nm: '카페' }],
  bakery:  [{ cd: '5006', nm: '제과점' }],
  korean:  [{ cd: '5001', nm: '한식' }, { cd: '5004', nm: '분식' }],
  pub:     [{ cd: '5009', nm: '호프 및 간이주점' }],
  beauty:  [{ cd: '1008', nm: '미용실' }, { cd: 'D005', nm: '피부/미용' }],
  academy: [{ cd: '1003', nm: '교습학원' }, { cd: '1004', nm: '어학원' }, { cd: '1005', nm: '예체능학원' }],
  fitness: [{ cd: 'F001', nm: '생활체육시설' }],
  conv:    [{ cd: '2003', nm: '편의점' }],
};

/* ============================================================
 *  공개 API
 * ============================================================ */

/** 사용 가능 여부 */
export const isEnabled = () => sgisEnabled();

/**
 * 단계별 행정구역 조회
 * @param cd 미지정=시도 목록, 2자리=시군구 목록, 5자리=읍면동 목록
 */
export async function listRegions(cd) {
  const d = await call('/addr/stage.json', { cd, pg_yn: 0 });
  return (d.result || []).map(r => ({
    code: r.cd,
    name: r.addr_name,
    fullName: r.full_addr,
    x: n(r.x_coor),
    y: n(r.y_coor),
  }));
}

/**
 * 총조사 주요지표 (인구·가구·주택·인구밀도)
 * @param admCd 2자리=시도, 5자리=시군구, 7자리=읍면동
 */
export async function getPopulation(admCd, year = 2020) {
  const d = await call('/stats/population.json', { year, adm_cd: admCd, low_search: 0 });
  const r = (d.result || [])[0];
  if (!r) return null;
  return {
    admCd: r.adm_cd,
    admNm: r.adm_nm,
    year,
    총인구: n(r.tot_ppltn),
    평균나이: n(r.avg_age),
    인구밀도: n(r.ppltn_dnsty),          // 명/㎢
    노령화지수: n(r.aged_child_idx),
    총가구: n(r.tot_family),
    평균가구원수: n(r.avg_fmember_cnt),
    총주택: n(r.tot_house),
    사업체수: n(r.corp_cnt),
    종사자수: n(r.employee_cnt),
  };
}

/**
 * 연령대별 거주인구 구성 (배후 수요 분석용)
 */
export async function getAgeMix(admCd) {
  const d = await call('/startupbiz/pplsummary.json', { adm_cd: admCd });
  const r = (d.result || []).find(x => x.adm_cd === String(admCd)) || (d.result || [])[0];
  if (!r) return null;
  const pick = (cnt, per) => ({ 인구: n(r[cnt]), 비율: n(r[per]) });
  return {
    admCd: r.adm_cd,
    admNm: r.adm_nm,
    '10대미만': pick('teenage_less_than_cnt', 'teenage_less_than_per'),
    '10대': pick('teenage_cnt', 'teenage_per'),
    '20대': pick('twenty_cnt', 'twenty_per'),
    '30대': pick('thirty_cnt', 'thirty_per'),
    '40대': pick('forty_cnt', 'forty_per'),
    '50대': pick('fifty_cnt', 'fifty_per'),
    '60대': pick('sixty_cnt', 'sixty_per'),
    '70대이상': pick('seventy_more_than_cnt', 'seventy_more_than_per'),
  };
}

/**
 * 업종별 사업체 수·종사자 수 (전국)
 * @param industry 자리픽 UI 업종 id (cafe/bakery/...)
 */
export async function getCompanyByIndustry(admCd, industry, year = 2019) {
  const themes = SGIS_THEME[industry];
  if (!themes) throw new Error(`지원하지 않는 업종: ${industry}`);

  const parts = [];
  for (const t of themes) {
    try {
      const d = await call('/stats/company.json', {
        year, adm_cd: admCd, low_search: 0, theme_cd: t.cd,
      });
      const r = (d.result || [])[0];
      parts.push({
        테마: t.nm, 코드: t.cd,
        사업체수: r ? n(r.corp_cnt) : null,
        종사자수: r ? n(r.tot_worker) : null,
        admNm: r?.adm_nm ?? null,
      });
    } catch (e) {
      // 특정 테마에 데이터가 없어도(-100) 나머지는 살린다
      if (e.errCd === '-100') parts.push({ 테마: t.nm, 코드: t.cd, 사업체수: 0, 종사자수: 0 });
      else throw e;
    }
  }

  const sum = k => {
    const vals = parts.map(p => p[k]).filter(v => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  return {
    admCd: String(admCd),
    admNm: parts.find(p => p.admNm)?.admNm ?? null,
    industry, year,
    사업체수: sum('사업체수'),
    종사자수: sum('종사자수'),
    내역: parts,
  };
}

/* ---------- 지역명 검색 ----------
 * 사용자는 코드가 아니라 "해운대구", "전주" 처럼 말한다.
 * 시도(17) + 시군구(약 250)를 한 번만 받아 인덱스로 들고 있는다. */
let regionIndex = null;
let regionIndexPromise = null;

async function buildRegionIndex() {
  const sido = await listRegions();
  const all = sido.map(s => ({ ...s, level: '시도' }));
  // 시도별 시군구를 순차로 받는다(동시 호출로 한도를 튀기지 않도록)
  for (const s of sido) {
    try {
      const sgg = await listRegions(s.code);
      for (const g of sgg) all.push({ ...g, level: '시군구', parent: s.name });
    } catch { /* 일부 시도 실패는 무시 */ }
  }
  console.log(`[sgis] 행정구역 인덱스 ${all.length}건 구축`);
  return all;
}

/** 지역명으로 행정구역 검색 (부분 일치) */
export async function findRegions(query, limit = 5) {
  if (!regionIndex) {
    if (!regionIndexPromise) {
      regionIndexPromise = buildRegionIndex()
        .then(v => (regionIndex = v))
        .finally(() => { regionIndexPromise = null; });
    }
    await regionIndexPromise;
  }
  const q = String(query || '').replace(/\s/g, '');
  if (!q) return [];
  const scored = [];
  for (const r of regionIndex) {
    const nm = r.name.replace(/\s/g, '');
    let s = 0;
    if (nm === q) s = 100;
    else if (nm.startsWith(q)) s = 80;
    else if (nm.includes(q)) s = 60;
    else if (q.length >= 2 && (r.fullName || '').replace(/\s/g, '').includes(q)) s = 40;
    // 시군구를 시도보다 우선(사용자는 보통 구·시 단위를 말한다)
    if (s) scored.push({ r, s: s + (r.level === '시군구' ? 5 : 0) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.r);
}

/** 지역 종합 요약 (전국 어디든 조회 가능) */
export async function getRegionSummary(admCd, industry) {
  const [pop, ageMix, company] = await Promise.all([
    getPopulation(admCd).catch(() => null),
    getAgeMix(admCd).catch(() => null),
    industry ? getCompanyByIndustry(admCd, industry).catch(() => null) : Promise.resolve(null),
  ]);
  if (!pop && !ageMix && !company) return null;

  // 사업체 1곳당 배후 거주인구 = 경쟁 밀도의 전국 공통 대리지표
  let 점포당_배후인구 = null;
  if (pop?.총인구 && company?.사업체수) {
    점포당_배후인구 = Math.round(pop.총인구 / company.사업체수);
  }

  return {
    지역: { code: String(admCd), name: pop?.admNm || ageMix?.admNm || null },
    인구: pop,
    연령구성: ageMix,
    업종: company,
    점포당_배후인구,
    출처: 'SGIS(통계청) 인구주택총조사 · 전국사업체조사',
  };
}

/** 상태 조회 */
export function sgisStatus() {
  return {
    enabled: sgisEnabled(),
    baseUrl: S.baseUrl,
    tokenCached: Boolean(token && Date.now() < token.expiresAt),
    tokenExpiresIn: token ? Math.max(0, Math.round((token.expiresAt - Date.now()) / 60000)) : null,
    cachedQueries: cache.size,
    cacheMin: S.cacheMin,
    industries: Object.keys(SGIS_THEME),
    note: sgisEnabled()
      ? 'SGIS 전국 통계 연동됨. 서울 외 지역의 인구·사업체 지표를 조회합니다.'
      : 'SGIS 키가 없어 전국 통계 기능이 꺼져 있습니다. .env 에 SGIS_SERVICE_ID / SGIS_SECURITY_KEY 를 넣으세요.',
  };
}
