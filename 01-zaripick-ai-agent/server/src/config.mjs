/* ============================================================
 *  .env 로더 + 설정
 *  의존성 없이 .env 를 직접 파싱한다(dotenv 불필요).
 * ============================================================ */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');

/** .env 파싱: KEY=VALUE, #주석, 따옴표, 빈 줄 지원 */
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (let line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// 우선순위: 실제 프로세스 환경변수 > .env 파일
const fileEnv = loadEnvFile(resolve(ROOT, '.env'));
const env = (key, fallback = '') => {
  const v = process.env[key] ?? fileEnv[key];
  return v === undefined || v === '' ? fallback : v;
};

const num = (key, fallback) => {
  // 값이 없으면 Number('')가 0이 되어 기본값을 덮어쓴다. 빈 값은 먼저 걸러야 한다.
  const raw = env(key, '');
  if (raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num('PORT', 8787),
  dbPath: resolve(ROOT, env('DB_PATH', '../seoul_db.db')),
  cachePath: resolve(ROOT, env('CACHE_PATH', './cache/areas.json')),
  staticDir: env('STATIC_DIR', '..') ? resolve(ROOT, env('STATIC_DIR', '..')) : null,

  areaTypes: env('AREA_TYPES', '발달상권,골목상권,관광특구').split(',').map(s => s.trim()).filter(Boolean),
  minDailyFoot: num('MIN_DAILY_FOOT', 3000),

  /* SGIS(통계청) — 전국 행정동 단위 인구·사업체 통계.
     키가 없으면 관련 기능만 꺼지고 서울 분석은 그대로 동작한다. */
  sgis: {
    serviceId: env('SGIS_SERVICE_ID', ''),
    securityKey: env('SGIS_SECURITY_KEY', ''),
    baseUrl: env('SGIS_BASE_URL', 'https://sgisapi.kostat.go.kr/OpenAPI3'),
    timeoutMs: num('SGIS_TIMEOUT_MS', 10000),
    cacheMin: num('SGIS_CACHE_MIN', 720),
  },

  /* LOCALDATA(행정안전부 인허가) — 전국 개·폐업.
     cond[필드::연산자] 필터가 있어 적재 없이 요청 시점에 건수만 조회한다. */
  localdata: {
    apiKey: env('LOCALDATA_API_KEY', ''),
    baseUrl: env('LOCALDATA_BASE_URL', 'https://apis.data.go.kr/1741000'),
    timeoutMs: num('LOCALDATA_TIMEOUT_MS', 45000),
    concurrency: num('LOCALDATA_CONCURRENCY', 5),
    cacheMin: num('LOCALDATA_CACHE_MIN', 720),
    dbPath: resolve(ROOT, env('LOCALDATA_DB_PATH', './cache/localdata.db')),
  },

  /* 소상공인365(소상공인시장진흥공단 빅데이터 플랫폼).
     지도 데이터 엔드포인트는 인증 없이 열려 있고, certKey 는 데이터 키가 아니라
     분석 '화면' 접근키다(POST /pub/api/apics/checkApiCertVl 가 라우트명만 돌려준다).
     그래서 데이터는 gis 쪽에서 받고, certKey 는 해당 화면 딥링크에만 쓴다. */
  sbiz: {
    baseUrl: env('SBIZ_BASE_URL', 'https://bigdata.sbiz.or.kr'),
    timeoutMs: num('SBIZ_TIMEOUT_MS', 15000),
    concurrency: num('SBIZ_CONCURRENCY', 4),
    cacheMin: num('SBIZ_CACHE_MIN', 720),
    /* 화면별 발급 인증키 — 없으면 해당 화면 링크만 노출하지 않는다 */
    certKeys: {
      hpReport:      env('SBIZ_CERT_HP_REPORT', ''),      // 테마상권 분석
      weather:       env('SBIZ_CERT_WEATHER', ''),        // 창업기상도
      slsIdex:       env('SBIZ_CERT_SLS_IDEX', ''),       // 점포당 매출액 추이
      storSttus:     env('SBIZ_CERT_STOR_STTUS', ''),     // 업소현황
      stcarSttus:    env('SBIZ_CERT_STCAR_STTUS', ''),    // 업력현황
      detail:        env('SBIZ_CERT_DETAIL', ''),         // 상세분석
      startupPublic: env('SBIZ_CERT_STARTUP_PUBLIC', ''), // 상권지도
      delivery:      env('SBIZ_CERT_DELIVERY', ''),       // 배달분석
      tour:          env('SBIZ_CERT_TOUR', ''),           // 관광 축제 정보
      simple:        env('SBIZ_CERT_SIMPLE', ''),         // 간단분석
      snsAnaly:      env('SBIZ_CERT_SNS_ANALY', ''),      // SNS 분석
    },
  },

  /* 한국부동산원 R-ONE — 상업용부동산 임대동향조사.
     전국에서 유일하게 없던 축(임대료·공실률·권리금)을 채운다.
     통계표 하나가 몇천 행뿐이라 적재하지 않고 통째로 받아 캐시한다. */
  rone: {
    apiKey: env('RONE_API_KEY', ''),
    baseUrl: env('RONE_BASE_URL', 'https://www.reb.or.kr/r-one/openapi'),
    timeoutMs: num('RONE_TIMEOUT_MS', 20000),
    cacheMin: num('RONE_CACHE_MIN', 720),
  },

  ai: {
    /* 'auto' 면 order 순서대로 키가 있는 첫 프로바이더를 쓴다.
       특정 값(gemini/openai/anthropic)을 주면 그것만 쓴다. */
    provider: env('AI_PROVIDER', 'auto').trim().toLowerCase(),
    order: env('AI_PROVIDER_ORDER', 'gemini,openai,anthropic')
             .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    /* 호출 실패 시 다음 프로바이더로 넘길지 (auto 일 때만 의미 있음) */
    failover: env('AI_FAILOVER', 'true') !== 'false',

    maxTokens: num('AI_MAX_TOKENS', 1200),
    timeoutMs: num('AI_TIMEOUT_MS', 20000),
    /* 에이전트가 도구를 연쇄 호출할 수 있는 최대 횟수 */
    maxToolTurns: num('AI_MAX_TOOL_TURNS', 5),

    providers: {
      gemini: {
        label: 'Gemini',
        key: env('GEMINI_API_KEY', ''),
        baseUrl: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
        model: env('GEMINI_MODEL', 'gemini-2.5-flash'),
      },
      openai: {
        label: 'GPT',
        key: env('OPENAI_API_KEY', ''),
        baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        model: env('OPENAI_MODEL', 'gpt-4o-mini'),
      },
      anthropic: {
        label: 'Claude',
        key: env('ANTHROPIC_API_KEY', ''),
        baseUrl: env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
        model: env('ANTHROPIC_MODEL', 'claude-sonnet-5'),
      },
    },
  },
};

/** 키가 등록된 프로바이더 id 목록을 우선순위 순으로 반환 */
export function availableProviders() {
  const P = config.ai.providers;
  const wanted = config.ai.provider === 'auto' || !config.ai.provider
    ? config.ai.order
    : [config.ai.provider];
  return wanted.filter(id => P[id] && P[id].key);
}

/** AI 키가 하나라도 있으면 true. 없으면 규칙 기반으로 동작한다. */
export const aiEnabled = () => availableProviders().length > 0;

/** SGIS 자격증명이 모두 있으면 true */
export const sgisEnabled = () =>
  Boolean(config.sgis.serviceId && config.sgis.securityKey);

/** LOCALDATA 키가 있으면 true */
export const localdataEnabled = () => Boolean(config.localdata.apiKey);

/** R-ONE 인증키가 있으면 true */
export const roneEnabled = () => Boolean(config.rone.apiKey);

/* 소상공인365 지도 데이터는 키가 필요 없다. 끄고 싶을 때만 SBIZ_ENABLED=false. */
export const sbizEnabled = () => env('SBIZ_ENABLED', 'true') !== 'false';

/** 인증키가 들어온 분석 화면 목록 */
export const sbizScreens = () =>
  Object.entries(config.sbiz.certKeys).filter(([, v]) => v).map(([k]) => k);
