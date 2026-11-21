/* ============================================================
 *  seoul_db.db → cache/areas.json 사전 집계
 *
 *  1,650개 상권(trade_area_master)을 기준으로 각종 지표를 조인/집계한다.
 *  요청마다 수백만 행을 스캔하지 않도록 결과를 JSON으로 굳혀 둔다.
 *
 *  실행:  npm run build:cache
 * ============================================================ */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../src/config.mjs';

const t0 = Date.now();
const log = (...a) => console.log('[cache]', ...a);

log('DB 열기:', config.dbPath);
const db = new DatabaseSync(config.dbPath, { readOnly: true });
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

/* ---------- 0. 기준 분기 확인 ---------- */
const Q = {
  foot: one('SELECT MAX(quarter) q FROM trade_area_floating_population').q,   // 20261
  sales: one('SELECT MAX(quarter) q FROM trade_area_sales').q,                // 20254
  store: one('SELECT MAX(base_qtr) q FROM commercial_store').q,               // 20254
  change: one('SELECT MAX(quarter) q FROM trade_area_change_indicator').q,
  worker: one('SELECT MAX(quarter) q FROM trade_area_worker_population').q,
  rent: one('SELECT MAX(quarter) q FROM dong_rent_vacancy_applied').q,        // 2026Q2
};
// 전년 동분기 (유동인구 증감 계산용): 20261 → 20251
const footPrevQ = String(Number(Q.foot) - 10);
log('기준 분기:', JSON.stringify(Q), '| 전년동분기:', footPrevQ);

const daysInQ = one('SELECT days_in_quarter d FROM quarter_days WHERE quarter_cs=?', Q.foot)?.d || 91;

/* ---------- 1. 업종 매핑 (industry_mapping) ---------- */
// UI 카테고리(한글) → 우리 프런트 id
const UI_ID = {
  '카페·디저트': 'cafe',
  '베이커리': 'bakery',
  '한식·분식': 'korean',
  '주점·호프': 'pub',
  '미용·뷰티': 'beauty',
  '학원·교육': 'academy',
  '헬스·필라테스': 'fitness',
  '편의점·무인': 'conv',
};
const INDUSTRIES = {};   // id -> { name, csCodes:[], poiNames:[] }
for (const r of all('SELECT ui_category, source_type, code, name FROM industry_mapping')) {
  const id = UI_ID[r.ui_category];
  if (!id) continue;
  INDUSTRIES[id] ??= { id, name: r.ui_category, csCodes: [], poiNames: [] };
  if (r.source_type === 'cs_code' && r.code) INDUSTRIES[id].csCodes.push(r.code);
  if (r.source_type === 'store_poi' && r.name) INDUSTRIES[id].poiNames.push(r.name);
}
const IND_IDS = Object.keys(INDUSTRIES);
log('업종 매핑:', IND_IDS.map(i => `${i}(cs${INDUSTRIES[i].csCodes.length}/poi${INDUSTRIES[i].poiNames.length})`).join(' '));

// 역인덱스: cs_code → id, cat_small → id
const CS2ID = {}, POI2ID = {};
for (const id of IND_IDS) {
  INDUSTRIES[id].csCodes.forEach(c => (CS2ID[c] = id));
  INDUSTRIES[id].poiNames.forEach(n => (POI2ID[n] = id));
}

/* ---------- 2. 상권 마스터 ---------- */
const master = all(`
  SELECT trdar_cd, trdar_nm, trdar_se, gu_nm, adm_cd, adm_nm,
         center_lat, center_lon, area_m2
  FROM trade_area_master`);
log('상권 마스터:', master.length);

const A = new Map();   // trdar_cd -> record
for (const m of master) {
  A.set(m.trdar_cd, {
    id: m.trdar_cd,
    name: m.trdar_nm,
    type: m.trdar_se,
    gu: m.gu_nm,
    admCd: m.adm_cd,
    admNm: m.adm_nm,
    lat: m.center_lat, lng: m.center_lon,
    areaM2: m.area_m2 || 0,
    ind: {},
  });
}

/* ---------- 3. 유동인구 (연령·시간대·요일) ---------- */
const TIME_LABEL = {
  t00_06: '00~06시', t06_11: '06~11시', t11_14: '11~14시',
  t14_17: '14~17시', t17_21: '17~21시', t21_24: '21~24시',
};
const AGE_KEYS = { age10: '10대', age20: '20대', age30: '30대', age40: '40대', age50: '50대', age60_up: '60대+' };

for (const r of all(`SELECT * FROM trade_area_floating_population WHERE quarter=?`, Q.foot)) {
  const a = A.get(r.trdar_cd); if (!a) continue;
  a.foot = Math.round((r.total_pop || 0) / daysInQ);          // 일평균 생활인구

  const ageSum = Object.keys(AGE_KEYS).reduce((s, k) => s + (r[k] || 0), 0) || 1;
  a.ageMix = {};
  for (const [k, label] of Object.entries(AGE_KEYS)) {
    a.ageMix[label] = Math.round((r[k] || 0) / ageSum * 1000) / 10;
  }
  // 피크 시간대
  let best = null;
  for (const k of Object.keys(TIME_LABEL)) if (!best || (r[k] || 0) > (r[best] || 0)) best = k;
  a.peak = TIME_LABEL[best];

  const wk = (r.mon || 0) + (r.tue || 0) + (r.wed || 0) + (r.thu || 0) + (r.fri || 0);
  const we = (r.sat || 0) + (r.sun || 0);
  a.weekendRatio = wk + we ? Math.round(we / (wk + we) * 1000) / 10 : null;
}
// 전년 동분기 대비 증감률
for (const r of all(`SELECT trdar_cd, total_pop FROM trade_area_floating_population WHERE quarter=?`, footPrevQ)) {
  const a = A.get(r.trdar_cd); if (!a || !r.total_pop) continue;
  const prev = r.total_pop / daysInQ;
  if (a.foot && prev > 0) a.footGrowth = Math.round((a.foot / prev - 1) * 1000) / 10;
}

/* ---------- 4. 직장인구 ---------- */
for (const r of all(`SELECT trdar_cd, total_worker FROM trade_area_worker_population WHERE quarter=?`, Q.worker)) {
  const a = A.get(r.trdar_cd); if (a) a.worker = r.total_worker || 0;
}

/* ---------- 5. 거주인구 (행정동 단위) ---------- */
const residentByDong = {};
for (const r of all('SELECT adm_cd, population FROM resident_population')) residentByDong[r.adm_cd] = r.population || 0;
for (const a of A.values()) a.resident = residentByDong[a.admCd] ?? null;

/* ---------- 6. 교통 (지하철·버스 매칭 수) ---------- */
for (const r of all('SELECT trdar_cd, COUNT(*) n FROM trade_area_subway_match GROUP BY 1')) {
  const a = A.get(r.trdar_cd); if (a) a.subway = r.n;
}
for (const r of all('SELECT trdar_cd, COUNT(*) n FROM trade_area_bus_match GROUP BY 1')) {
  const a = A.get(r.trdar_cd); if (a) a.bus = r.n;
}
for (const a of A.values()) { a.subway ??= 0; a.bus ??= 0; }

/* ---------- 7. 임대료 · 공실률 · 환산보증금 (행정동 단위, 소규모 상가) ---------- */
const M2_PER_PY = 3.305785;
const rentByDong = {}, vacancyByDong = {}, convDepByDong = {};
for (const r of all(`SELECT adm_cd, item_nm, value FROM dong_rent_vacancy_applied
                     WHERE quarter=? AND shop_type='소규모'`, Q.rent)) {
  if (r.item_nm === '임대료') rentByDong[r.adm_cd] = r.value;      // 천원/㎡/월
  else if (r.item_nm === '공실률') vacancyByDong[r.adm_cd] = r.value;
}
for (const r of all(`SELECT adm_cd, est_deposit_per_pyeong v FROM dong_deposit_estimated
                     WHERE quarter=? AND shop_type='소규모'`, Q.rent)) {
  convDepByDong[r.adm_cd] = r.v;                                   // 만원/평 (환산보증금)
}
for (const a of A.values()) {
  const rent = rentByDong[a.admCd];
  // 천원/㎡/월 → 만원/평/월
  a.rentPerPy = rent != null ? Math.round(rent * M2_PER_PY / 10 * 10) / 10 : null;
  a.vacancy = vacancyByDong[a.admCd] != null ? Math.round(vacancyByDong[a.admCd] * 10) / 10 : null;
  a.convDepositPerPy = convDepByDong[a.admCd] != null ? Math.round(convDepByDong[a.admCd]) : null;
}

/* ---------- 8. 상권 변화지표 ---------- */
for (const r of all(`SELECT trdar_cd, change_nm, avg_operate_months, avg_close_months,
                            seoul_avg_operate_months
                     FROM trade_area_change_indicator WHERE quarter=?`, Q.change)) {
  const a = A.get(r.trdar_cd); if (!a) continue;
  a.changeNm = r.change_nm;
  a.avgOperateMonths = r.avg_operate_months;
  a.seoulAvgOperateMonths = r.seoul_avg_operate_months;
}

/* ---------- 9. 업종별 점포수 (상권 × 업종) ---------- */
const poiNameList = Object.keys(POI2ID);
const ph = poiNameList.map(() => '?').join(',');
for (const r of all(
  `SELECT trdar_cd, cat_small, COUNT(*) n FROM trade_area_store_match
   WHERE cat_small IN (${ph}) GROUP BY 1,2`, ...poiNameList)) {
  const a = A.get(r.trdar_cd); if (!a) continue;
  const id = POI2ID[r.cat_small]; if (!id) continue;
  a.ind[id] ??= {};
  a.ind[id].storeCnt = (a.ind[id].storeCnt || 0) + r.n;
}

/* ---------- 10. 업종별 매출 (상권 × 업종, 월매출 합) ---------- */
const csCodeList = Object.keys(CS2ID);
const ph2 = csCodeList.map(() => '?').join(',');
for (const r of all(
  `SELECT trdar_cd, industry_cd, SUM(monthly_sales_amt) amt, SUM(monthly_sales_cnt) cnt
   FROM trade_area_sales WHERE quarter=? AND industry_cd IN (${ph2})
   GROUP BY 1,2`, Q.sales, ...csCodeList)) {
  const a = A.get(r.trdar_cd); if (!a) continue;
  const id = CS2ID[r.industry_cd]; if (!id) continue;
  a.ind[id] ??= {};
  a.ind[id].salesAmt = (a.ind[id].salesAmt || 0) + (r.amt || 0);
  a.ind[id].salesCnt = (a.ind[id].salesCnt || 0) + (r.cnt || 0);
}

/* ---------- 11. 업종별 폐업률/개업률 (행정동 × 업종) ---------- */
const closeByDong = {};   // `${adm_cd}|${id}` -> {close, open, stores}
for (const r of all(
  `SELECT adm_cd, industry_cd, SUM(store_cnt) stores,
          SUM(close_cnt) closes, SUM(open_cnt) opens
   FROM commercial_store WHERE base_qtr=? AND industry_cd IN (${ph2})
   GROUP BY 1,2`, Q.store, ...csCodeList)) {
  const id = CS2ID[r.industry_cd]; if (!id) continue;
  const k = `${r.adm_cd}|${id}`;
  const cur = closeByDong[k] || { stores: 0, closes: 0, opens: 0 };
  cur.stores += r.stores || 0; cur.closes += r.closes || 0; cur.opens += r.opens || 0;
  closeByDong[k] = cur;
}
for (const a of A.values()) {
  for (const id of IND_IDS) {
    const c = closeByDong[`${a.admCd}|${id}`];
    if (!c || !c.stores) continue;
    a.ind[id] ??= {};
    a.ind[id].closeRate = Math.round(c.closes / c.stores * 1000) / 10;
    a.ind[id].openRate = Math.round(c.opens / c.stores * 1000) / 10;
  }
}

/* ---------- 12. 파생 지표 정규화 ---------- */
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const pct = (arr, p) => {
  const s = arr.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) * p)] : 0;
};

// 서울 전체 기준값(중앙값). 매출지수 산출용: 업종별 '점포당 월매출'
const perStoreAll = {};
for (const id of IND_IDS) perStoreAll[id] = [];
for (const a of A.values()) {
  for (const id of IND_IDS) {
    const v = a.ind[id];
    if (v?.salesAmt && v?.storeCnt) perStoreAll[id].push(v.salesAmt / v.storeCnt);
  }
}
const perStoreMedian = {};
for (const id of IND_IDS) perStoreMedian[id] = pct(perStoreAll[id], 0.5) || 1;

// 교통·인프라 정규화 기준
const busAll = [...A.values()].map(a => a.bus);
const busP90 = pct(busAll, 0.9) || 10;
const footAll = [...A.values()].map(a => a.foot).filter(Number.isFinite);
const footP95 = pct(footAll, 0.95) || 50000;
const workerAll = [...A.values()].map(a => a.worker).filter(Number.isFinite);
const workerP95 = pct(workerAll, 0.95) || 20000;

for (const a of A.values()) {
  // 교통 접근성: 지하철역(가중 큼) + 버스정류장
  a.transit = Math.round(clamp(
    Math.min(a.subway, 3) / 3 * 62 + Math.min(a.bus / busP90, 1) * 38));

  // 생활 인프라: 배후 거주·직장 인구 + 상권 규모
  const resScore = a.resident ? clamp(a.resident / 35000 * 100) : 30;
  const wrkScore = a.worker ? clamp(a.worker / workerP95 * 100) : 30;
  const sizeScore = clamp(Math.log10(Math.max(a.areaM2, 1)) / 6 * 100);
  a.infra = Math.round(clamp(resScore * 0.45 + wrkScore * 0.35 + sizeScore * 0.20));

  // 업종별 파생
  const hectares = Math.max(a.areaM2 / 10000, 0.1);
  for (const id of IND_IDS) {
    const v = (a.ind[id] ??= {});
    v.storeCnt ??= 0;
    // 매출지수: 점포당 월매출 / 서울 중앙값 × 100
    if (v.salesAmt && v.storeCnt) {
      v.perStore = v.salesAmt / v.storeCnt;
      v.salesIdx = Math.round(v.perStore / perStoreMedian[id] * 100);
      v.salesIdxSource = 'observed';
    } else {
      v.salesIdx = null;
      v.salesIdxSource = null;
    }
    // 경쟁 밀도: ha당 동일업종 점포수 → 0~100
    v.densityPerHa = Math.round(v.storeCnt / hectares * 100) / 100;
    v.competition = Math.round(clamp(v.densityPerHa / 3 * 100));
    delete v.salesAmt; delete v.salesCnt;
  }
}

/* 매출 원본(trade_area_sales)은 골목상권만 수록되어 있다.
 * 발달상권·관광특구·전통시장은 값이 없으므로, DB가 임대료를 다루는 방식과 동일하게
 * 같은 자치구 골목상권의 중앙값으로 대체하고 출처(salesIdxSource)를 남긴다. */
{
  const guPerStore = {};   // `${gu}|${id}` -> [perStore...]
  for (const a of A.values()) {
    for (const id of IND_IDS) {
      const v = a.ind[id];
      if (v?.perStore) (guPerStore[`${a.gu}|${id}`] ??= []).push(v.perStore);
    }
  }
  let filled = 0;
  for (const a of A.values()) {
    for (const id of IND_IDS) {
      const v = a.ind[id];
      if (v.salesIdx != null) { delete v.perStore; continue; }
      const arr = guPerStore[`${a.gu}|${id}`];
      if (arr?.length) {
        // 대체값은 관측값보다 신뢰도가 낮으므로 극단치를 눌러 둔다
        v.salesIdx = clamp(Math.round(pct(arr, 0.5) / perStoreMedian[id] * 100), 40, 250);
        v.salesIdxSource = 'gu_avg';
        filled++;
      } else {
        v.salesIdx = 100;                 // 서울 중앙값으로 대체
        v.salesIdxSource = 'seoul_avg';
        filled++;
      }
      delete v.perStore;
    }
  }
  log(`매출지수 대체 보정: ${filled}건 (자치구/서울 중앙값)`);
}

// 업종 적합도(fit): 매출지수·경쟁밀도·폐업률·수요규모 종합 (0~100)
const seoulCloseAvg = {};
for (const id of IND_IDS) {
  const arr = [...A.values()].map(a => a.ind[id]?.closeRate).filter(Number.isFinite);
  seoulCloseAvg[id] = arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 8;
}
for (const a of A.values()) {
  for (const id of IND_IDS) {
    const v = a.ind[id];
    const sales = v.salesIdx != null ? clamp(v.salesIdx * 0.55 + 25) : 45;      // 지수 100 ≈ 80점
    const comp = clamp(100 - v.competition * 0.6);
    const close = v.closeRate != null ? clamp(100 - (v.closeRate - seoulCloseAvg[id]) * 6 - 20) : 50;
    const demand = clamp((a.foot || 0) / footP95 * 100);
    v.fit = Math.round(clamp(sales * 0.38 + comp * 0.20 + close * 0.20 + demand * 0.22));
  }
}

/* ---------- 13. 태그 생성 (근거 기반) ---------- */
for (const a of A.values()) {
  const tags = [];
  if (a.changeNm) tags.push(a.changeNm);
  if (a.footGrowth != null && a.footGrowth >= 5) tags.push('유동인구 증가');
  if (a.footGrowth != null && a.footGrowth <= -5) tags.push('유동인구 감소');
  if (a.subway >= 2) tags.push('환승 역세권');
  else if (a.subway === 1) tags.push('역세권');
  if (a.worker && a.resident && a.worker > a.resident * 1.5) tags.push('오피스 밀집');
  if (a.resident && a.worker && a.resident > a.worker * 1.5) tags.push('주거 배후');
  if (a.weekendRatio != null && a.weekendRatio >= 30) tags.push('주말 집중');
  if (a.vacancy != null && a.vacancy <= 3) tags.push('공실률 낮음');
  if (a.type === '관광특구') tags.push('관광 수요');
  if (a.type === '전통시장') tags.push('전통시장');
  a.tags = tags.slice(0, 4);
}

/* ---------- 14. 필터 & 저장 ---------- */
const areas = [...A.values()]
  .filter(a => config.areaTypes.includes(a.type))
  .filter(a => Number.isFinite(a.foot) && a.foot >= config.minDailyFoot)
  .filter(a => a.rentPerPy != null)
  .sort((x, y) => (y.foot || 0) - (x.foot || 0));

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: 'seoul_db.db',
    quarters: { ...Q, footPrev: footPrevQ },
    daysInQuarter: daysInQ,
    counts: { master: master.length, served: areas.length },
    filters: { areaTypes: config.areaTypes, minDailyFoot: config.minDailyFoot },
    industries: Object.fromEntries(IND_IDS.map(id => [id, INDUSTRIES[id].name])),
    seoulMedianPerStoreSales: perStoreMedian,
    normalizers: { footP95, workerP95, busP90 },
  },
  areas,
};

mkdirSync(dirname(config.cachePath), { recursive: true });
writeFileSync(config.cachePath, JSON.stringify(payload), 'utf8');

const mb = (Buffer.byteLength(JSON.stringify(payload)) / 1024 / 1024).toFixed(2);
log(`완료: ${areas.length}개 상권 → ${config.cachePath} (${mb} MB, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);

// 샘플 출력 (검증용)
const sample = areas.slice(0, 3).map(a => ({
  name: a.name, type: a.type, gu: a.gu, foot: a.foot, growth: a.footGrowth,
  peak: a.peak, rentPerPy: a.rentPerPy, vacancy: a.vacancy, subway: a.subway, bus: a.bus,
  cafe: a.ind.cafe,
}));
log('샘플:', JSON.stringify(sample, null, 1));
