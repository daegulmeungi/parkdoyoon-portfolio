/* ============================================================
 *  전국 입지 분석 — 행정동 단위 랭킹
 *
 *  서울 6축 점수와 '다른 산식'이다. 섞으면 안 된다.
 *    서울   : 상권 1,030곳 · 유동인구·업종·교통·인프라·예산·안정성 6축
 *    전국   : 행정동 3,563곳 · 수요·배후·매출력·경쟁·구매력 5축
 *  전국에는 교통·생활인프라 지표가 없어 6축을 그대로 쓸 수 없다.
 *  그래서 이름도 '입지 점수'로 따로 두고, 화면·에이전트가 서로 비교하지 못하게 한다.
 *
 *  순위는 '선택한 시군구 안에서의 상대 평가'다.
 *  시군구마다 1등이 100점 근처가 되므로 다른 시군구의 점수와 견주면 안 된다.
 *  임대료·폐업률은 시군구 단위라 같은 시군구 안에서는 변별력이 없다 —
 *  순위를 가르지 않고 '수준'을 정하는 데만 쓴다.
 * ============================================================ */
import { estimate, financePlan } from './scoring.mjs';

/* 목적별 가중치. 서울 쪽 WEIGHTS 와 축이 달라 따로 둔다. */
const WEIGHTS = {
  traffic: { demand: .34, base: .18, sales: .24, comp: .12, power: .12 },
  safe:    { demand: .20, base: .24, sales: .20, comp: .22, power: .14 },
  cost:    { demand: .22, base: .22, sales: .18, comp: .20, power: .18 },
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/* 백분위 점수. 값이 없는 동은 0점이 아니라 '제외'해야 하므로 null 을 그대로 돌려준다.
   같은 값이 여럿이면 같은 점수를 준다. */
function percentile(values) {
  const ok = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (ok.length < 2) return () => (ok.length ? 50 : null);
  const sorted = [...ok].sort((a, b) => a - b);
  return v => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    /* 자기보다 작은 값의 비율 (동점은 절반으로 친다) */
    let lo = 0, eq = 0;
    for (const s of sorted) { if (s < v) lo++; else if (s === v) eq++; }
    return Math.round((lo + eq / 2) / sorted.length * 100);
  };
}

/**
 * 행정동 목록에 점수를 매긴다.
 * @param dongs  getDongMetrics() 결과
 * @param ctx    { 지역, 임대료_만원_평, 폐업률_퍼센트, ... } 시군구 단위 맥락
 * @param cond   normCond() 결과
 */
export function rankDongs(dongs, ctx, cond) {
  const rows = (dongs || []).filter(d => d.행정동코드);
  if (!rows.length) return [];

  /* 배후인구는 주거·직장을 함께 본다. 낮에 버는 업종과 밤에 버는 업종이 다르므로
     운영 형태로 무게를 바꾼다 — 배달이면 주거 쪽이 훨씬 중요하다. */
  const baseOf = d => {
    const res = d.주거인구 ?? 0, wrk = d.직장인구 ?? 0;
    return cond.mode === 'delivery' ? res * 1.3 + wrk * 0.4 : res * 0.9 + wrk * 0.8;
  };
  /* 점포 하나가 나눠 갖는 배후인구. 클수록 덜 붐빈다. */
  const roomOf = d => (d.점포수 > 0 ? baseOf(d) / d.점포수 : null);
  const powerOf = d => (d.월평균소득_만원 != null && d.월평균소비_만원 != null)
    ? d.월평균소득_만원 * 0.4 + d.월평균소비_만원 * 0.6 : null;

  const pDemand = percentile(rows.map(d => d.유동인구));
  const pBase   = percentile(rows.map(baseOf));
  const pSales  = percentile(rows.map(d => d.점포당_월매출_만원));
  const pComp   = percentile(rows.map(roomOf));
  const pPower  = percentile(rows.map(powerOf));

  const W = WEIGHTS[cond.goal] || WEIGHTS.traffic;

  /* 비용은 임대료에서 나온다.
     서울은 seoul_db 의 자치구 임대료를(rentByDong), 그 밖은 한국부동산원 값을 쓴다.
     둘 다 행정동을 갈라 주지는 못한다 — 행정동 단위 임대료는 어느 기관도 공개하지 않는다.
     그래서 예산은 순위를 가르지 않고 '이 지역에서 창업이 가능한가'만 판정한다. */
  const rentOf = d => ctx.rentByDong?.get(d.행정동코드) ?? ctx.임대료_만원_평 ?? 0;
  const costOf = d => estimate({ rentPerPy: rentOf(d), keyMoneyMan: ctx.권리금_만원 ?? null }, cond);

  const est = estimate({ rentPerPy: ctx.임대료_만원_평 || 0, keyMoneyMan: ctx.권리금_만원 ?? null }, cond);
  const fin = financePlan({ est }, cond);
  const affordable = est.total <= cond.budget;

  const scored = rows.map(d => {
    const parts = {
      demand: pDemand(d.유동인구),
      base:   pBase(baseOf(d)),
      sales:  pSales(d.점포당_월매출_만원),
      comp:   pComp(roomOf(d)),
      power:  pPower(powerOf(d)),
    };
    /* 값이 없는 축은 빼고 남은 가중치로 다시 나눈다.
       0점으로 채우면 자료가 없다는 이유로 순위가 떨어진다. */
    let sum = 0, wsum = 0;
    for (const k of Object.keys(W)) {
      if (parts[k] == null) continue;
      sum += parts[k] * W[k]; wsum += W[k];
    }
    const total = wsum > 0 ? clamp(sum / wsum) : null;

    const cost = costOf(d);
    return {
      행정동코드: d.행정동코드,
      행정동: d.행정동,
      임대료_만원_평: rentOf(d) || null,
      임대료_출처: ctx.rentByDong?.has(d.행정동코드) ? '서울 자치구 실측' : '한국부동산원 지역 평균',
      비용: cost,
      예산내: cost.total <= cond.budget,
      점수: {
        total: total == null ? null : Math.round(total * 10) / 10,
        ...parts,
        결측축: Object.keys(W).filter(k => parts[k] == null),
      },
      지표: {
        유동인구: d.유동인구,
        주거인구: d.주거인구,
        직장인구: d.직장인구,
        세대수: d.세대수,
        해당업종_점포수: d.점포수,
        점포당_월매출_만원: d.점포당_월매출_만원,
        점포당_배후인구: roomOf(d) == null ? null : Math.round(roomOf(d)),
        월평균소득_만원: d.월평균소득_만원,
        월평균소비_만원: d.월평균소비_만원,
        매출_자료이상: d.자료이상 || undefined,
      },
    };
  });

  scored.sort((a, b) => (b.점수.total ?? -1) - (a.점수.total ?? -1));
  scored.forEach((r, i) => { r.순위 = i + 1; });

  return { list: scored, 비용: est, 조달: fin, 예산내: affordable };
}

export const AXIS_LABEL = {
  demand: '유동 수요',
  base:   '배후 인구',
  sales:  '매출력',
  comp:   '경쟁 여유',
  power:  '구매력',
};

export const AXIS_HELP = {
  demand: '해당 행정동의 유동인구. 시군구 안에서의 백분위입니다.',
  base:   '주거인구와 직장인구를 운영 형태에 맞춰 합산한 배후 규모입니다.',
  sales:  '같은 업종 점포 한 곳의 월평균 카드매출 추정치입니다.',
  comp:   '점포 한 곳이 나눠 갖는 배후인구. 클수록 경쟁이 덜 붐빕니다.',
  power:  '해당 지역 거주자의 월평균 소득·소비 수준입니다.',
};
