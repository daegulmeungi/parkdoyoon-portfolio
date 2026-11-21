/* ============================================================
 *  적합도 스코어링 + 비용/자금 계획
 *  입력 지표는 전부 seoul_db 관측값(캐시)이고,
 *  가중치 결합만 이 파일에서 수행한다.
 * ============================================================ */
import { industryById, COST_ASSUMPTIONS, FIN_PRODUCTS } from './model.mjs';

export const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = n => Math.round(n * 10) / 10;

/* 목적별 가중치 */
const WEIGHTS = {
  traffic: { foot: .30, biz: .24, transit: .14, infra: .12, cost: .10, risk: .10 },
  safe:    { foot: .16, biz: .20, transit: .10, infra: .14, cost: .16, risk: .24 },
  cost:    { foot: .14, biz: .18, transit: .08, infra: .10, cost: .38, risk: .12 },
};

/* ---------- 비용 추정 ---------- */
export function estimate(area, cond) {
  const I = industryById(cond.industry);
  const C = COST_ASSUMPTIONS;
  const py = Math.max(1, cond.area);

  const rentMonth = Math.round((area.rentPerPy || 0) * py);              // 관측: 임대료
  const depositMan = Math.round(rentMonth * C.depositMonths);            // 가정: 월세 ×10
  const interiorMan = Math.round(I.interiorPerPy * py / 10) * 10;        // 가정
  const equipMan = Math.round(interiorMan * C.equipRatio);               // 가정
  const opMonth = Math.round(I.monthlyOpCost * (0.55 + 0.45 * py / 15)); // 가정
  /* 권리금은 한국부동산원 값이 있을 때만 넣는다.
     실제로 나가는 목돈이라 빼 두면 자금 계획이 그만큼 헐거워진다. */
  const premiumMan = area.keyMoneyMan != null ? Math.round(area.keyMoneyMan) : null;
  const openingCost = depositMan + interiorMan + equipMan + (premiumMan || 0);
  const reserve = Math.round((rentMonth + opMonth) * C.reserveMonths);
  const contingency = Math.round((openingCost + reserve) * C.contingencyRatio);

  return {
    rentMonth, depositMan, interiorMan, equipMan, opMonth, premiumMan,
    openingCost, reserve, contingency,
    total: openingCost + reserve + contingency,
    // 참고: DB의 환산보증금(전환율 기반). 실제 계약 보증금과 다른 개념
    convDepositRef: area.convDepositPerPy != null ? Math.round(area.convDepositPerPy * py) : null,
    breakEvenMonthlySales: rentMonth + opMonth,   // 고정비 = 손익분기 최소 매출
  };
}

/* ---------- 적합도 점수 ---------- */
export function score(area, cond, norm) {
  const est = estimate(area, cond);
  const W = { ...WEIGHTS[cond.goal] || WEIGHTS.traffic };
  const ind = area.ind?.[cond.industry] || {};

  // 수요: 운영 형태에 따라 기준이 달라진다
  const walkin = clamp((area.foot || 0) / (norm.footP95 || 50000) * 100);
  const backfill = clamp(((area.resident || 0) * 1.1 + (area.worker || 0) * 0.7) / 45000 * 100);
  let sFoot;
  if (cond.mode === 'delivery') {
    sFoot = backfill;
    W.transit *= 0.5;
    W.cost *= 1.3;
  } else if (cond.mode === 'hybrid') {
    sFoot = clamp(walkin * 0.5 + backfill * 0.5);
  } else {
    sFoot = walkin;
  }
  const wsum = Object.values(W).reduce((s, x) => s + x, 0);
  Object.keys(W).forEach(k => (W[k] /= wsum));

  const sBiz = ind.fit != null ? ind.fit : 50;
  const sTransit = area.transit ?? 40;
  const sInfra = area.infra ?? 40;

  // 예산 적합도
  const ratio = cond.budget / Math.max(est.openingCost, 1);
  let sCost;
  if (ratio >= 1.6) sCost = 92;
  else if (ratio >= 1.0) sCost = 70 + (ratio - 1) * 36;
  else sCost = clamp(ratio * 62);

  // 안정성: 폐업률 + 경쟁밀도 + 공실률 + 상권 변화지표 + 평균 영업기간
  const closeRate = ind.closeRate ?? 8;
  const changeBonus = { '상권확장': 8, '다이나믹': 0, '정체': -3, '상권축소': -12 }[area.changeNm] ?? 0;
  const operBonus = (area.avgOperateMonths && area.seoulAvgOperateMonths)
    ? clamp((area.avgOperateMonths - area.seoulAvgOperateMonths) * 0.35, -10, 10) : 0;
  const sRisk = clamp(
    100 - closeRate * 4.2
        - (ind.competition ?? 50) * 0.25
        - (area.vacancy ?? 5) * 1.4
        + changeBonus + operBonus);

  let total = sFoot * W.foot + sBiz * W.biz + sTransit * W.transit +
              sInfra * W.infra + sCost * W.cost + sRisk * W.risk;

  const affordable = cond.budget >= est.openingCost;
  if (!affordable) total *= 0.62 + 0.28 * Math.min(1, ratio);

  return {
    area, est, affordable,
    sub: { foot: Math.round(sFoot), biz: Math.round(sBiz), transit: Math.round(sTransit),
           infra: Math.round(sInfra), cost: Math.round(sCost), risk: Math.round(sRisk) },
    total: round1(clamp(total)),
  };
}

/* ---------- 자금 조달 계획 ---------- */
export function financePlan(r, cond) {
  const e = r.est;
  const need = e.total;
  const shortfall = Math.max(0, need - cond.equity);
  const byId = id => FIN_PRODUCTS.find(p => p.id === id);
  const products = [];

  if (shortfall > 0) {
    const p1 = byId('sbiz-start');
    const amt1 = Math.min(p1.limitMan, Math.round(shortfall * 0.5 / 100) * 100);
    if (amt1 > 0) products.push({ p: p1, amt: amt1,
      why: '업력 3년 미만 창업자 대상 최저금리 구간입니다. 부족자금의 절반을 정책자금으로 우선 충당합니다.' });

    let rest = Math.max(0, shortfall - amt1);
    if (rest > 0) {
      const p2 = byId('guarantee');
      const amt2 = Math.min(p2.limitMan, Math.round(rest * (cond.ageBand === 'young' ? 0.6 : 1) / 100) * 100);
      if (amt2 > 0) products.push({ p: p2, amt: amt2,
        why: '담보 없이 보증서 발급으로 한도를 확보합니다. 보증료(연 0.8~1.2%)가 추가됩니다.' });
      rest = Math.max(0, rest - amt2);

      if (cond.ageBand === 'young') {
        const p3 = byId('youth-rent');
        const amt3 = Math.min(p3.limitMan, Math.max(rest, Math.round(e.depositMan * 0.5 / 100) * 100));
        if (amt3 > 0) products.push({ p: p3, amt: amt3,
          why: '만 39세 이하 청년 창업자 임차보증금 이자지원 대상입니다. 보증금 부담을 크게 낮출 수 있습니다.' });
      } else if (rest > 0) {
        const p4 = byId('bank-credit');
        // 100만원 단위 반올림으로 0이 되면 상품을 넣지 않는다(0원 조합이 표시되는 문제)
        const amt4 = Math.min(p4.limitMan, Math.round(rest / 100) * 100);
        if (amt4 > 0) products.push({ p: p4, amt: amt4,
          why: '잔여 부족분 보완용입니다. 금리가 높으므로 최소 한도로 활용하고 조기 상환을 권장합니다.' });
      }
    }
  } else {
    const p5 = byId('card-adv');
    products.push({ p: p5, amt: 1000,
      why: '자기자본으로 개설이 가능한 상태입니다. 운영 변동에 대비한 예비 한도만 확보해 두는 것을 권장합니다.' });
  }

  for (const x of products) {
    const i = x.p.rate / 100 / 12, n = x.p.months - x.p.grace;
    x.rate = x.p.rate;
    x.monthly = Math.round(x.amt * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1));
    x.graceMonthly = Math.round(x.amt * i);
    x.interestTotal = Math.round(x.monthly * n - x.amt + x.graceMonthly * x.p.grace);
  }

  const raised = products.reduce((s, x) => s + x.amt, 0);
  const monthlyRepay = products.reduce((s, x) => s + x.monthly, 0);
  const graceRepay = products.reduce((s, x) => s + (x.p.grace > 0 ? x.graceMonthly : x.monthly), 0);

  return {
    need, shortfall, raised, monthlyRepay, graceRepay,
    covered: raised + cond.equity >= need,
    // 상환까지 감안한 손익분기 매출 (고정비 + 원리금)
    breakEvenWithRepay: r.est.breakEvenMonthlySales + monthlyRepay,
    products: products.map(x => ({
      id: x.p.id, name: x.p.name, org: x.p.org, type: x.p.type, logo: x.p.logo,
      desc: x.p.desc, term: x.p.term, rate: x.rate, grace: x.p.grace,
      amt: x.amt, monthly: x.monthly, graceMonthly: x.graceMonthly, interestTotal: x.interestTotal,
      why: x.why,
    })),
  };
}
