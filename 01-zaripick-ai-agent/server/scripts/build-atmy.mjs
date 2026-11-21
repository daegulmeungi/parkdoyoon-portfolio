/* ============================================================
 *  개방자치단체코드 표 생성  →  src/atmy-codes.mjs
 *
 *    node scripts/build-atmy.mjs
 *
 *  왜 API 에서 뽑는가
 *    참고문서 xlsx 는 행정구역 개편 전 기준이라 최신 데이터와 어긋난다.
 *    실측: 광주광역시가 '전남광주통합특별시'로 통합되면서 코드가
 *          36xxxxx → 58xxxxx 로 바뀌었는데 xlsx 에는 58 계열이 없다.
 *          그 결과 광주 5개 구가 전 업종에서 0건으로 조회됐다.
 *
 *  그래서 제과점(가장 가볍고 전국에 고르게 분포)을 전량 훑어
 *  코드 ↔ 주소(시도/시군구) 대응을 직접 만든다. 개편이 있어도 다시 돌리면 따라간다.
 * ============================================================ */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, localdataEnabled } from '../src/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/atmy-codes.mjs');
const L = config.localdata;

/* 여러 서비스를 합쳐 훑는다.
   제과점 하나만 보면 제과점이 없는 자치구가 통째로 빠진다
   (실측: 수원시 4개 구 중 권선구만 잡혔다).
   빠른 서비스 위주로 고르되 업종이 겹치지 않게 섞는다. */
const SVCS = ['bakeries', 'fitness_centers'];

if (!localdataEnabled()) {
  console.error('\n[!] LOCALDATA_API_KEY 가 없습니다. server/.env 를 확인하세요.\n');
  process.exit(1);
}

const page = async (svc, no, rows = 100) => {
  const url = `${L.baseUrl}/${svc}/info?serviceKey=${encodeURIComponent(L.apiKey)}`
    + `&pageNo=${no}&numOfRows=${rows}&returnType=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), L.timeoutMs);
  try {
    const j = await (await fetch(url, { signal: ctrl.signal })).json();
    const b = j.response?.body;
    const raw = b?.items?.item;
    return { total: Number(b?.totalCount) || 0, rows: Array.isArray(raw) ? raw : (raw ? [raw] : []) };
  } finally { clearTimeout(timer); }
};

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/* 주소 앞부분에서 시도·시군구를 뗀다.
   '전남광주통합특별시 서구 동천동 639' → { sido:'전남광주통합특별시', sgg:'서구' }
   '경기도 고양시 일산서구 …'            → { sido:'경기도', sgg:'고양시 일산서구' } */
function parseAddr(addr) {
  const t = String(addr || '').trim().replace(/\s+/g, ' ');
  const m = t.match(/^(\S*(?:특별자치시|특별자치도|특별시|광역시|통합특별시|도))\s+(.+)$/);
  if (!m) return null;
  const rest = m[2].split(' ');
  /* 자치단체코드는 '시' 단위다. 하나의 코드가 수원시 4개 구를 모두 포함한다
     (3740000 = 경기 수원시 · 권선/팔달/장안/영통).
     그래서 일반구는 라벨에 넣지 않고 시까지만 쓴다. */
  return { sido: m[1], sgg: rest[0] };
}

console.log(`자치단체코드 수집 시작 · 서비스 ${SVCS.length}종`);

const found = new Map();   // code → { sido, sgg, n }
let totalPages = 0, failed = 0;
const t0 = Date.now();

for (const svc of SVCS) {
  const first = await page(svc, 1, 1);
  const pages = Math.ceil(first.total / 100);
  totalPages += pages;
  console.log(`  ${svc}: ${first.total.toLocaleString('ko-KR')}건 / ${pages.toLocaleString('ko-KR')}p`);

  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  let done = 0;
  await mapLimit(nums, L.concurrency, async no => {
    try {
      const { rows } = await page(svc, no);
      for (const r of rows) {
        const cd = r.OPN_ATMY_GRP_CD;
        if (!cd) continue;
        const a = parseAddr(r.LOTNO_ADDR || r.ROAD_NM_ADDR);
        if (!a) continue;
        const cur = found.get(cd);
        if (cur) cur.n++;
        else found.set(cd, { ...a, n: 1 });
      }
    } catch { failed++; }
    if (++done % 300 === 0) console.log(`    ... ${done}/${pages}p · 누적 코드 ${found.size}개`);
  });
  console.log(`    → 누적 자치단체 ${found.size}개`);
}

console.log(`
완료: ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${totalPages.toLocaleString('ko-KR')}p · 실패 ${failed}p · 자치단체 ${found.size}개`);

/* 같은 코드에 여러 주소가 섞이면 가장 많이 등장한 시군구를 대표로 쓴다.
   (경계 지역 오타·이전 주소가 소수 섞이는 경우가 있다) */
const entries = [...found.entries()]
  .map(([cd, v]) => [cd, v])
  .sort((a, b) => a[0].localeCompare(b[0]));

const bySido = {};
for (const [, v] of entries) bySido[v.sido] = (bySido[v.sido] || 0) + 1;
console.log('\n시도별 자치단체 수');
for (const [s, n] of Object.entries(bySido).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(16)} ${n}곳`);
}

const body = entries
  .map(([cd, v]) => `  '${cd}': { sido: '${v.sido}', sgg: '${v.sgg}' },`)
  .join('\n');

const js = `/* ============================================================
 *  개방자치단체코드 표 (자동 생성 — 직접 수정하지 말 것)
 *
 *    생성:  node scripts/build-atmy.mjs
 *    출처:  LOCALDATA 실제 데이터(${SVCS.join(', ')})에서 코드↔주소를 수집
 *    시점:  ${new Date().toISOString().slice(0, 10)}  ·  자치단체 ${entries.length}곳
 *
 *  참고문서로 받은 xlsx 는 행정구역 개편 전 기준이라 쓰지 않는다.
 *  (광주광역시 → 전남광주통합특별시 통합으로 36xxxxx 코드가 폐지됐는데
 *   xlsx 에는 새 58xxxxx 계열이 없어 광주 전역이 0건으로 조회됐다.)
 *  개편이 또 생기면 이 스크립트를 다시 실행하면 된다.
 * ============================================================ */
export const ATMY = {
${body}
};

const squash = s => String(s || '').replace(/[\\s()·]/g, '');

/** 코드 → '시도 시군구' */
export const atmyName = cd => {
  const v = ATMY[String(cd)];
  return v ? \`\${v.sido} \${v.sgg}\` : null;
};

const INDEX = Object.entries(ATMY).map(([cd, v]) => ({
  cd, sido: v.sido, sgg: v.sgg,
  nm: \`\${v.sido} \${v.sgg}\`,
  sidoKey: squash(v.sido),
  sggKey: squash(v.sgg),
}));

/* 시도 표기 흔들림 흡수.
   SGIS 는 '광주광역시', LOCALDATA 는 '전남광주통합특별시' 처럼 다르게 부른다.
   핵심 지명(광주/전남)만 뽑아 느슨하게 맞춘다. */
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
   먼저 걸린 하나(광주)만 쓰면 전남 22개 시군구가 통째로 실종된다(실측). */
const sidoHints = s => SIDO_HINT.filter(([, re]) => re.test(String(s || ''))).map(([k]) => k);

/* 질의 쪽은 반드시 앞머리에서만 찾는다.
   느슨하게 보면 '해운대구'의 '대구'가 걸려 대구광역시로 잘못 몰린다. */
const sidoHintOfQuery = s => {
  const t = squash(s);
  return (SIDO_HINT.find(([, re]) => new RegExp('^(?:' + re.source + ')').test(t)) || [])[0] || null;
};

/**
 * 지역명으로 자치단체를 찾는다. '부산광역시 해운대구', '해운대구', '광주 서구' 모두 받는다.
 * 시도를 알면 그 안에서만 시군구를 찾는다 — '서구'는 6개 시도에 있어
 * 시도를 안 가리면 엉뚱한 곳이 걸린다.
 */
export function findAtmy(query) {
  const q = squash(query);
  if (q.length < 2) return null;

  let hit = INDEX.find(x => squash(x.nm) === q);
  if (hit) return { cd: hit.cd, nm: hit.nm };

  const hint = sidoHintOfQuery(query);
  const pool = hint ? INDEX.filter(x => sidoHints(x.sido).includes(hint)) : INDEX;
  if (!pool.length) return null;

  /* 세종처럼 자치단체가 하나뿐인 시도는 시군구명을 볼 것도 없다.
     SGIS 는 '세종특별자치시 세종시', 여기는 '세종특별자치시' 라 이름이 안 맞는다. */
  if (hint && pool.length === 1) return { cd: pool[0].cd, nm: pool[0].nm };

  /* 시군구명 후보: 앞머리의 시도 표기를 떼고 남은 부분.
     질의는 '광주광역시서구', 데이터는 '전남광주통합특별시'라 서로 다르므로
     데이터의 표기가 아니라 '시도 접미사'를 기준으로 자른다. */
  let tail = q.replace(/^.*?(특별자치시|특별자치도|통합특별시|특별시|광역시)/, '');
  if (tail === q) {
    // '경기도수원시팔달구' 처럼 '도'로 끝나는 시도
    for (const k of new Set(pool.map(x => x.sidoKey))) {
      if (q.startsWith(k)) { tail = q.slice(k.length); break; }
    }
    if (tail === q) tail = q.replace(/^(경기|강원|충북|충남|전북|전남|경북|경남|제주)도?/, '');
    /* '전라남도광양시' 처럼 정식 시도명으로 물으면 위 두 규칙에 다 걸리지 않는다.
       데이터가 그 이름을 안 쓰기 때문이다(LOCALDATA 는 '전남광주통합특별시'). */
    if (tail === q) tail = q.replace(/^(충청북|충청남|전라북|전라남|경상북|경상남)도?/, '');
  }
  // '광주 남구' 처럼 시도를 약칭으로만 쓴 경우
  if (tail === q && hint && q.startsWith(hint)) tail = q.slice(hint.length);
  const base = tail.length >= 2 ? tail : q;

  const cands = [base];
  for (let i = base.length - 1; i >= 2; i--) {
    if ('시군구'.includes(base[i - 1])) {
      const c = base.slice(0, i);
      if (c.length >= 2 && !cands.includes(c)) cands.push(c);
    }
  }
  cands.sort((a, b) => b.length - a.length);

  for (const c of cands) {
    hit = pool.find(x => x.sggKey === c)
       || pool.find(x => x.sggKey.endsWith(c))
       || pool.find(x => x.sggKey.includes(c));
    if (hit) return { cd: hit.cd, nm: hit.nm };
  }
  return null;
}
`;

writeFileSync(OUT, js, 'utf8');
console.log(`\natmy-codes.mjs 생성 완료 (${entries.length}곳)`);
