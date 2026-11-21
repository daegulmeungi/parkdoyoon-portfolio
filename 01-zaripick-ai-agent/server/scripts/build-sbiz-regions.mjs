/* ============================================================
 *  소상공인365 시군구 인덱스 생성  →  src/sbiz-regions.mjs
 *
 *    node scripts/build-sbiz-regions.mjs
 *
 *  왜 미리 만드는가
 *    소상공인365 지도 API 는 지역코드가 아니라 bbox(EPSG:5181)로 조회한다.
 *    시군구의 bbox 를 요청 때마다 만들려면 그 안의 행정동 경계를 전부 받아야 해서
 *    시군구 하나에 15~44 회 호출이 든다. 실제로 그렇게 돌렸다가 서버가
 *    연결을 끊었다(ECONNRESET). 그래서 여기서 한 번만 만들어 파일로 굳힌다.
 *
 *  어떻게 적게 부르는가
 *    행정동 경계(폴리곤) 대신 getCoordToAdmPoint 로 '행정동 중심점'만 훑는다.
 *    한 번에 넓은 사각형을 받을 수 있어 전국이 수십 회로 끝난다.
 *    dongCd 앞 4자리가 시군구 코드라, 중심점만 모으면 시군구 bbox 가 나온다.
 * ============================================================ */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/sbiz-regions.mjs');
const S = config.sbiz;

/* 남한을 넉넉히 덮는 EPSG:5181 범위.
   서해 5도(백령 x≈-3,900 · 대청 x≈-2,500)와 울릉·독도까지 들어와야 한다.
   minX 를 40,000 으로 뒀다가 옹진군 백령면·대청면을 통째로 놓쳤다. */
const KOREA = { minX: -60_000, maxX: 640_000, minY: -120_000, maxY: 800_000 };
const TILE = Number(process.env.SBIZ_TILE_M || 40_000);   // 타일 한 변(m)
const PAD  = 1_500;                                       // 시군구 경계 여유(m)

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 서버가 연결을 끊으면 잠시 쉬었다 다시 시도한다.
   동시성을 높이면 바로 막히므로 천천히 부르는 편이 결국 빠르다. */
async function get(path, params, tries = 5) {
  const url = `${S.baseUrl}${path}?${new URLSearchParams(params)}`;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), S.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (res.ok) {
        let d = JSON.parse(await res.text());
        if (typeof d === 'string') d = JSON.parse(d);
        return d;
      }
      if (res.status < 500) return null;                  // 파라미터 문제면 재시도해도 같다
    } catch { /* ECONNRESET 등 — 아래에서 쉰다 */ }
    finally { clearTimeout(timer); }
    await sleep(1500 * (i + 1));
  }
  return null;
}

const tiles = [];
for (let x = KOREA.minX; x < KOREA.maxX; x += TILE) {
  for (let y = KOREA.minY; y < KOREA.maxY; y += TILE) {
    tiles.push({ minXAxis: x, maxXAxis: x + TILE, minYAxis: y, maxYAxis: y + TILE });
  }
}

console.log(`행정동 중심점 수집 · 타일 ${TILE / 1000}km × ${tiles.length}개`);

const dongs = new Map();     // dongCd → {x, y, nm}
let empty = 0;
const t0 = Date.now();

async function sweep(list, label) {
  const failed = [];
  for (const [i, t] of list.entries()) {
    const rows = await get('/gis/api/getCoordToAdmPoint.json', { ...t, mapLevel: 3 });
    if (rows === null) { failed.push(t); continue; }
    if (!rows.length) { empty++; continue; }
    for (const r of rows) {
      const cd = String(r.dongCd || '');
      const x = Number(r.centerXCrdnt), y = Number(r.centerYCrdnt);
      if (cd.length < 8 || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!dongs.has(cd)) dongs.set(cd, { x, y, nm: r.admdstCdNm, full: r.dongNm });
    }
    if ((i + 1) % 50 === 0) {
      console.log(`  ${label} ${i + 1}/${list.length}p · 행정동 ${dongs.size}개 · 빈타일 ${empty} · 실패 ${failed.length}`);
    }
    await sleep(120);                                     // 예의상 간격
  }
  return failed;
}

let failed = await sweep(tiles, '1차');

/* 실패한 타일을 그냥 넘기면 그 지역이 통째로 빠진 인덱스가 만들어진다.
   실측: 13타일을 놓쳤더니 대구 4개 구가 사라진 채로 파일이 덮어써졌다.
   그래서 남은 타일만 다시 훑고, 그래도 실패하면 파일을 쓰지 않는다. */
for (let pass = 2; failed.length && pass <= 4; pass++) {
  console.log(`\n  실패 ${failed.length}타일 재시도 (${pass}차)`);
  await sleep(5000);
  failed = await sweep(failed, `${pass}차`);
}

console.log(`\n행정동 ${dongs.size}개 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
if (failed.length) {
  console.error(`\n[!] ${failed.length}개 타일을 끝내 못 받았습니다. `
    + '그 지역이 빠진 인덱스를 만들지 않으려고 중단합니다. 잠시 후 다시 실행하세요.\n');
  process.exit(1);
}
if (dongs.size < 3400) {
  console.error(`\n[!] 행정동이 ${dongs.size}개뿐입니다(정상 3,500 이상). `
    + '차단됐거나 타일이 성깁니다. 잠시 후 다시 실행하세요.\n');
  process.exit(1);
}

/* 시군구 이름표는 별도 목록에서 받는다 (16 + 16 회) */
const megas = await get('/gis/com/megaListNoAll.json', {}) || [];
const name = new Map();
for (const m of megas) {
  const ctys = await get('/gis/com/ctyList.json', { mtpctdCd: m.megaCd, thrd: 'no' }) || [];
  for (const c of ctys) {
    name.set(String(c.ctyCd), { ctyNm: c.ctyNm, megaCd: String(m.megaCd), megaNm: m.megaNm });
  }
  await sleep(120);
}
console.log(`시군구 이름표 ${name.size}개`);

/* 행정동 중심점을 시군구로 묶어 bbox 를 만든다 */
const cty = new Map();
for (const [cd, d] of dongs) {
  const key = cd.slice(0, 4);
  if (!cty.has(key)) cty.set(key, { list: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const c = cty.get(key);
  c.list.push([cd, d.nm]);
  c.minX = Math.min(c.minX, d.x); c.maxX = Math.max(c.maxX, d.x);
  c.minY = Math.min(c.minY, d.y); c.maxY = Math.max(c.maxY, d.y);
}

const rows = [...cty.entries()]
  .filter(([cd]) => name.has(cd))
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([cd, c]) => {
    const n = name.get(cd);
    return {
      cd, ...n,
      /* 행정동은 코드·이름만 둔다. 좌표는 시군구 bbox 로 한 번에 조회하므로 필요 없다. */
      dongList: c.list.sort((a, b) => a[1].localeCompare(b[1], 'ko')),
      /* 중심점만 모았으니 가장자리 동이 잘린다. 여유를 둔다 —
         너무 넓어도 결과는 시군구코드로 걸러내므로 손해가 없다. */
      bbox: [
        Math.floor(c.minX - PAD), Math.floor(c.minY - PAD),
        Math.ceil(c.maxX + PAD),  Math.ceil(c.maxY + PAD),
      ],
    };
  });

const missing = [...name.keys()].filter(cd => !cty.has(cd));
if (missing.length) {
  console.warn(`[!] 중심점을 못 찾은 시군구 ${missing.length}곳: `
    + missing.map(cd => name.get(cd).megaNm + ' ' + name.get(cd).ctyNm).join(', '));
}

const bySido = {};
for (const r of rows) bySido[r.megaNm] = (bySido[r.megaNm] || 0) + 1;
console.log('\n시도별 시군구 수');
for (const [s, n] of Object.entries(bySido)) console.log(`  ${s.padEnd(16)} ${n}곳`);

/* 행정동은 코드 앞 4자리가 시군구코드와 같으므로 뒤 4자리만 적는다 */
const body = rows.map(r =>
  `  ['${r.cd}', '${r.ctyNm}', '${r.megaCd}', '${r.megaNm}', `
  + `${r.bbox[0]}, ${r.bbox[1]}, ${r.bbox[2]}, ${r.bbox[3]}, `
  + `'${r.dongList.map(([cd, nm]) => `${cd.slice(4)}:${nm}`).join('|')}'],`).join('\n');

const js = `/* ============================================================
 *  소상공인365 시군구 인덱스 (자동 생성 — 직접 수정하지 말 것)
 *
 *    생성:  node scripts/build-sbiz-regions.mjs
 *    시점:  ${new Date().toISOString().slice(0, 10)}  ·  시군구 ${rows.length}곳 / 행정동 ${dongs.size}개
 *
 *  bbox 는 EPSG:5181 [minX, minY, maxX, maxY] 미터다.
 *  소상공인365 지도 API 가 지역코드가 아니라 bbox 로 조회하기 때문에 필요하다.
 *  행정구역이 개편되면 이 스크립트를 다시 실행하면 된다.
 * ============================================================ */

/** [시군구코드(4), 시군구명, 시도코드(2), 시도명, minX, minY, maxX, maxY, '뒤4자리:행정동명|…'] */
const RAW = [
${body}
];

export const SBIZ_REGIONS = RAW.map(([cd, ctyNm, megaCd, megaNm, x1, y1, x2, y2, dongStr]) => ({
  ctyCd: cd, ctyNm, megaCd, megaNm,
  /* 세종은 시도이자 시군구라 이름이 겹친다 */
  fullName: megaNm === ctyNm ? megaNm : \`\${megaNm} \${ctyNm}\`,
  bbox: { minXAxis: x1, minYAxis: y1, maxXAxis: x2, maxYAxis: y2 },
  dongList: dongStr.split('|').map(s => {
    const i = s.indexOf(':');
    return { admCd: cd + s.slice(0, i), name: s.slice(i + 1) };
  }),
}));

for (const r of SBIZ_REGIONS) r.dongs = r.dongList.length;

export const byCtyCd = new Map(SBIZ_REGIONS.map(r => [r.ctyCd, r]));
export const byDongCd = new Map(
  SBIZ_REGIONS.flatMap(r => r.dongList.map(d => [d.admCd, { ...d, region: r }])));
`;

writeFileSync(OUT, js, 'utf8');
console.log(`\nsbiz-regions.mjs 생성 완료 (시군구 ${rows.length}곳)`);
