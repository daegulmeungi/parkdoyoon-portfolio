/* ============================================================
 *  AI 해설 (분석 근거 · 심층 리포트)
 *
 *  · Gemini / GPT / Claude 중 키가 등록된 프로바이더가 '해석'을 생성한다.
 *    프로바이더 선택과 포맷 변환은 llm.mjs 가 담당한다.
 *  · 키가 없거나 호출이 실패/지연되면 규칙 기반 문장으로 자동 폴백한다.
 *    → 어느 경로든 응답 스키마는 동일하므로 프런트엔드는 신경 쓰지 않는다.
 *
 *  중요: 숫자는 전부 DB/계산 결과이며 AI에게 만들게 하지 않는다.
 *        AI는 주어진 수치를 문장으로 해석하는 역할만 한다.
 * ============================================================ */
import { aiEnabled } from './config.mjs';
import { complete, llmStatus } from './llm.mjs';
import { industryById } from './model.mjs';

const won = man => {
  man = Math.round(man);
  if (Math.abs(man) >= 10000) {
    const eok = Math.floor(man / 10000), rest = man % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }
  return `${man.toLocaleString('ko-KR')}만원`;
};
const pct = n => `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`;
const comma = n => Math.round(n).toLocaleString('ko-KR');

/* 프로바이더 호출은 llm.mjs 로 위임한다(Gemini/GPT/Claude 공통 진입점) */
const callLLM = (system, user) => complete(system, user);

const SYSTEM = `당신은 서울 상권 데이터를 해석하는 창업 입지 컨설턴트입니다.

규칙:
- 제공된 수치만 사용하세요. 새로운 숫자를 추정하거나 만들어내지 마세요.
- 매출이나 수익을 예측하지 마세요. 관측된 지표의 의미만 설명합니다.
- 한국어 존댓말로 쓰되 과장 없이 담백하게 씁니다.
- 강조가 필요한 핵심 어구는 <b>...</b> 로 감쌉니다. 다른 HTML 태그는 쓰지 마세요.
- 마크다운 기호(**, ##, - )를 쓰지 마세요.
- 투자 권유나 단정적 보장 표현을 쓰지 마세요.`;

/* ---------- 1) 추천 근거 한 문단 ---------- */
function fallbackReason(r, cond) {
  const a = r.area, s = r.sub, I = industryById(cond.industry);
  const ind = a.ind?.[cond.industry] || {};
  const LABEL = { foot: '수요 기반', biz: '업종 적합도', transit: '교통 접근성',
                  infra: '생활 인프라', cost: '예산 적합도', risk: '안정성' };
  const top = Object.entries(s).sort((x, y) => y[1] - x[1])[0][0];
  const bits = [`<b>${LABEL[top]}</b>이(가) 가장 강한 상권입니다.`];

  bits.push(`일 평균 생활인구 ${comma(a.foot)}명${a.footGrowth != null ? `(전년 동분기 대비 ${pct(a.footGrowth)})` : ''}, ` +
            `${I.name} 점포 ${comma(ind.storeCnt || 0)}개가 영업 중입니다.`);
  if (ind.salesIdx != null) bits.push(`점포당 매출은 서울 중앙값 대비 ${ind.salesIdx} 수준입니다.`);
  if (cond.mode === 'delivery')
    bits.push(`배달 중심 조건이라 유동인구보다 배후 인구(거주 ${comma(a.resident || 0)}명·직장 ${comma(a.worker || 0)}명)와 임대료를 높게 반영했습니다.`);
  if (ind.closeRate != null)
    bits.push(`${I.name} 폐업률은 ${ind.closeRate}%${a.changeNm ? `이고 상권 변화지표는 '${a.changeNm}'` : ''}입니다.`);
  bits.push(r.affordable
    ? `초기 개설비용은 약 ${won(r.est.openingCost)}으로 입력 예산 범위 내입니다.`
    : `<b>현재 예산으로는 초기 개설비용 ${won(r.est.openingCost)}을 충당하기 어렵습니다.</b>`);
  return bits.join(' ');
}

export async function reasonFor(r, cond) {
  if (!aiEnabled()) return { text: fallbackReason(r, cond), by: 'rule' };
  const a = r.area, I = industryById(cond.industry), ind = a.ind?.[cond.industry] || {};
  const facts = {
    상권명: a.name, 유형: a.type, 자치구: a.gu,
    일평균_생활인구: a.foot, 전년동분기_증감률: a.footGrowth,
    피크_시간대: a.peak, 주말_비중: a.weekendRatio,
    거주인구: a.resident, 직장인구: a.worker,
    지하철역_수: a.subway, 버스정류장_수: a.bus,
    상권변화지표: a.changeNm, 평균_영업개월: a.avgOperateMonths,
    서울평균_영업개월: a.seoulAvgOperateMonths,
    임대료_만원_평당: a.rentPerPy, 공실률: a.vacancy,
    분석업종: I.name,
    해당업종_점포수: ind.storeCnt, 해당업종_매출지수_서울중앙값100: ind.salesIdx,
    해당업종_폐업률: ind.closeRate, 경쟁밀도_0_100: ind.competition,
    적합도_총점: r.total, 세부점수: r.sub,
    초기개설비용_만원: r.est.openingCost, 예산_만원: cond.budget, 예산내: r.affordable,
    운영형태: cond.mode, 창업목적: cond.goal,
  };
  try {
    const text = await callLLM(SYSTEM,
      `아래는 한 상권의 실제 관측 지표입니다. 이 자리를 추천한 근거를 2~4문장으로 설명해 주세요.
가장 두드러진 강점 하나와, 주의할 점이 있으면 하나를 함께 짚어 주세요.
값이 null인 항목은 언급하지 마세요.

${JSON.stringify(facts, null, 1)}`);
    return { text: text || fallbackReason(r, cond), by: text ? 'ai' : 'rule' };
  } catch (e) {
    console.warn('[ai] reason 폴백:', e.message);
    return { text: fallbackReason(r, cond), by: 'rule-fallback' };
  }
}

/* ---------- 2) 심층 리포트 인사이트 ---------- */
function fallbackDeep(r, cond, fin) {
  const a = r.area, e = r.est, I = industryById(cond.industry);
  const ind = a.ind?.[cond.industry] || {};

  const funding = fin.shortfall > 0
    ? `총 소요자금 ${won(fin.need)} 가운데 자기자본 ${won(cond.equity)}을 제외한 <b>${won(fin.shortfall)}</b>을 조달해야 합니다. ` +
      `금리가 낮은 순서로 배분하면 ${fin.products.map(p => `${p.name.split(' (')[0]} ${won(p.amt)}(연 ${p.rate}%)`).join(', ')} 조합이 됩니다. ` +
      `거치기간에는 월 ${comma(fin.graceRepay)}만원, 원리금 상환이 시작되면 월 ${comma(fin.monthlyRepay)}만원을 부담하게 됩니다.`
    : `총 소요자금 ${won(fin.need)}을 자기자본 ${won(cond.equity)}으로 충당할 수 있습니다. 운영 변동에 대비한 예비 한도만 확보해 두는 것을 권장합니다.`;

  const bep = `고정비는 임차료 ${won(e.rentMonth)}과 운영비 ${won(e.opMonth)}을 합쳐 월 ${won(e.breakEvenMonthlySales)}입니다. ` +
    (fin.monthlyRepay > 0
      ? `원리금 상환까지 반영하면 월 <b>${won(fin.breakEvenWithRepay)}</b> 이상의 매출이 있어야 손익분기에 도달합니다. `
      : '') +
    `본 리포트는 매출을 추정하지 않으므로, 이 수준을 감당할 수 있는지는 동일 업종 폐업률(${ind.closeRate ?? '-'}%)과 본인의 운영 계획을 기준으로 판단하시기 바랍니다.`;

  const risks = [];
  if ((ind.competition ?? 0) >= 70) risks.push(`동일 업종 경쟁밀도가 ${ind.competition}점(100점 기준)으로 높아 차별화 없이는 초기 진입이 어렵습니다.`);
  if ((a.vacancy ?? 0) >= 8) risks.push(`공실률이 ${a.vacancy}%로 높아 상권 활력이 약해지고 있는지 현장 확인이 필요합니다.`);
  if (a.footGrowth != null && a.footGrowth < 0) risks.push(`생활인구가 전년 대비 ${pct(a.footGrowth)}로 감소 추세입니다. 단기 계약 후 재평가를 권장합니다.`);
  if (a.changeNm === '상권축소') risks.push(`상권 변화지표가 '상권축소'로 분류되어 있습니다.`);
  if (fin.raised > fin.need * 0.5) risks.push(`차입 비중이 ${Math.round(fin.raised / fin.need * 100)}%로 높아 금리 변동에 민감합니다.`);
  if (!risks.length) risks.push(`관측 지표상 두드러진 위험 신호는 확인되지 않았습니다. 다만 계약 전 현장 실측을 권장합니다.`);

  return {
    funding, breakEven: bep, risks,
    summary: `${a.name}은(는) ${a.type}으로 분류되며 ${I.name} 업종 적합도 ${ind.fit ?? '-'}점, 종합 적합도 ${r.total}점입니다.`,
  };
}

export async function deepInsight(r, cond, fin) {
  const fb = fallbackDeep(r, cond, fin);
  if (!aiEnabled()) return { ...fb, by: 'rule' };

  const a = r.area, I = industryById(cond.industry), ind = a.ind?.[cond.industry] || {};
  const facts = {
    상권: { 이름: a.name, 유형: a.type, 자치구: a.gu, 상권변화지표: a.changeNm,
           일평균_생활인구: a.foot, 증감률: a.footGrowth, 공실률: a.vacancy,
           임대료_만원_평당: a.rentPerPy, 평균_영업개월: a.avgOperateMonths },
    업종: { 이름: I.name, 점포수: ind.storeCnt, 매출지수: ind.salesIdx,
           폐업률: ind.closeRate, 경쟁밀도: ind.competition, 적합도: ind.fit },
    비용: { 면적_평: cond.area, 월임차료: r.est.rentMonth, 월운영비: r.est.opMonth,
           보증금: r.est.depositMan, 인테리어: r.est.interiorMan, 설비: r.est.equipMan,
           초기운영자금: r.est.reserve, 예비비: r.est.contingency, 총소요자금: fin.need,
           월_고정비: r.est.breakEvenMonthlySales },
    자금: { 자기자본: cond.equity, 부족자금: fin.shortfall, 총조달: fin.raised,
           거치중_월상환: fin.graceRepay, 원리금_월상환: fin.monthlyRepay,
           상환포함_손익분기매출: fin.breakEvenWithRepay,
           상품: fin.products.map(p => ({ 이름: p.name, 금액: p.amt, 금리: p.rate, 기간: p.term })) },
    조건: { 창업목적: cond.goal, 운영형태: cond.mode, 대표자연령: cond.ageBand },
  };

  try {
    const raw = await callLLM(SYSTEM,
      `아래 수치를 바탕으로 심층 분석 리포트의 서술 부분을 작성해 주세요.
반드시 아래 JSON 형식으로만 응답하세요. 코드블록이나 다른 설명을 덧붙이지 마세요.

{
  "summary": "이 상권과 업종 조합에 대한 2문장 총평",
  "funding": "자금 조달 계획 해설 3~4문장. 어떤 상품을 왜 그 순서로 조합했는지 포함",
  "breakEven": "고정비와 손익분기 매출 수준에 대한 해설 2~3문장. 매출 예측은 하지 말 것",
  "risks": ["리스크와 대응 제안 문장", "...최대 4개"]
}

수치:
${JSON.stringify(facts, null, 1)}`);

    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON 파싱 실패');
    const parsed = JSON.parse(m[0]);
    return {
      summary: parsed.summary || fb.summary,
      funding: parsed.funding || fb.funding,
      breakEven: parsed.breakEven || fb.breakEven,
      risks: Array.isArray(parsed.risks) && parsed.risks.length ? parsed.risks.slice(0, 4) : fb.risks,
      by: 'ai',
    };
  } catch (e) {
    console.warn('[ai] deep 폴백:', e.message);
    return { ...fb, by: 'rule-fallback' };
  }
}

/* ---------- 상태 조회 ---------- */
export function aiStatus() {
  const s = llmStatus();
  return {
    enabled: s.enabled,
    provider: s.active,
    providerLabel: s.activeLabel,
    model: s.model,
    chain: s.chain,
    failover: s.failover,
    mode: s.enabled ? 'ai' : 'rule',
    note: s.enabled
      ? `${s.activeLabel}(${s.model})가 관측 지표를 해석해 서술을 생성합니다. 수치 자체는 DB 관측값입니다.`
      : 'API 키가 없어 규칙 기반 해설로 동작합니다. .env 에 GEMINI_API_KEY 또는 OPENAI_API_KEY 를 넣으면 AI로 전환됩니다.',
  };
}
