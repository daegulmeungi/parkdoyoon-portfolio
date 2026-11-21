/* ============================================================
 *  AI 에이전트 (tool-use 루프)
 *
 *  흐름: 사용자 질문 → LLM이 도구 선택 → 서버가 도구 실행(숫자 계산)
 *        → 결과를 LLM에 되돌림 → 필요하면 반복 → 최종 문장 생성
 *
 *  API 키가 하나도 없으면 규칙 기반 라우터가 같은 스키마로 답한다.
 *  (키 없이도 데모가 끊기지 않아야 한다는 기존 원칙을 유지)
 * ============================================================ */
import { config } from './config.mjs';
import { chat, llmStatus } from './llm.mjs';
import { TOOL_DEFS, TOOL_LABELS, runTool } from './tools.mjs';
import { INDUSTRIES, industryById } from './model.mjs';
import { rankAreas, detectGu } from './store.mjs';
import { isEnabled as sgisOn, findRegions } from './sgis.mjs';
import { findRegion as findRegionSbiz } from './sbiz.mjs';

/* ============================================================
 *  시스템 프롬프트
 * ============================================================ */
const SYSTEM = `당신은 '자리픽'의 창업 입지 상담 에이전트입니다.
서울 1,030개 상권의 공공데이터를 도구로 조회해 창업 자리와 자금 계획을 상담합니다.

[가장 중요한 규칙]
- 숫자는 반드시 도구가 반환한 값만 쓰세요. 어떤 수치도 직접 추정하거나 만들어내지 마세요.
- 매출액·영업이익·투자금 회수기간을 예측하지 마세요. 이 서비스는 매출을 예측하지 않습니다.
  자금 관련 질문에는 '손익분기 필요 매출선'(고정비와 상환액에서 역산한 값)만 제시하고,
  그것이 예측이 아니라는 점을 밝히세요.
- 도구 없이 상권을 추천하지 마세요. 추천에는 반드시 search_areas 결과가 있어야 합니다.
- 데이터에 없는 것을 물으면 없다고 말하세요. 지어내지 마세요.

[도구 사용]
- 업종과 예산을 알면 곧바로 search_areas 를 호출하세요. 되묻지 말고 먼저 실행합니다.
- 예산을 전혀 알 수 없으면 그때만 한 번 되물으세요.
- 면적을 모르면 15평, 자기자본을 모르면 예산의 절반으로 가정하고 그 가정을 답변에 밝히세요.
- 지역명이 나오면 get_area_detail 로 확인하세요. 상권명은 부정확해도 됩니다.
- 계산 방식이나 출처를 물으면 explain_metric 을 호출하세요.

[답변 형식]
- 한국어 존댓말, 담백하게. 과장이나 투자 권유 표현은 쓰지 마세요.
- 마크다운(**, ##, -)을 쓰지 마세요. 강조는 <b>...</b> 만 씁니다.
- 상권을 여러 개 제시할 때는 각 줄을 "1. 상권명 (적합도 82.4점) — 근거" 형태로 씁니다.
- 답변은 6문장 이내로 간결하게. 표를 만들지 마세요.
- 수치를 말할 때 단위를 반드시 붙이세요(명, 만원, %, 점).`;

/* ============================================================
 *  AI 경로
 * ============================================================ */
async function runWithAI(messages, context) {
  const trace = [];
  const msgs = messages.map(m => ({ role: m.role, content: m.content }));

  // 앱에서 이미 설정한 조건이 있으면 힌트로 넘긴다
  let system = SYSTEM;
  if (context?.cond) {
    const c = context.cond;
    system += `\n\n[현재 사용자가 화면에서 설정한 조건]
업종=${industryById(c.industry).name}(${c.industry}), 예산=${c.budget}만원, 면적=${c.area}평, 자기자본=${c.equity}만원, 목적=${c.goal}, 운영형태=${c.mode}${c.gu ? `, 자치구=${c.gu}` : ''}
사용자가 조건을 따로 말하지 않으면 이 값을 기본값으로 쓰세요.`;
  }
  if (context?.topAreas?.length) {
    system += `\n방금 화면에 표시된 추천 상권: ${context.topAreas.slice(0, 5).join(', ')}`;
  }

  let last = null;
  for (let turn = 0; turn < config.ai.maxToolTurns; turn++) {
    last = await chat({ system, messages: msgs, tools: TOOL_DEFS });

    if (!last.toolCalls?.length) {
      return { reply: last.text, trace, provider: last.provider, model: last.model };
    }

    msgs.push({ role: 'assistant', content: last.text, toolCalls: last.toolCalls });

    for (const tc of last.toolCalls) {
      const result = await runTool(tc.name, tc.args);
      trace.push({
        name: tc.name,
        label: TOOL_LABELS[tc.name] || tc.name,
        args: tc.args,
        ok: !result?.오류,
      });
      msgs.push({
        role: 'tool', toolCallId: tc.id, name: tc.name,
        content: JSON.stringify(result),
      });
    }
  }

  /* 도구 호출 한도에 걸리면 도구 없이 한 번 더 불러 문장을 받아낸다 */
  const final = await chat({ system, messages: msgs });
  return {
    reply: final.text || last?.text || '조회한 내용을 정리하지 못했습니다. 질문을 조금 더 구체적으로 적어 주세요.',
    trace, provider: final.provider, model: final.model,
  };
}

/* ============================================================
 *  규칙 기반 폴백 (API 키 없음)
 * ============================================================ */
const IND_KEYWORDS = {
  cafe: ['카페', '커피', '디저트', '까페'],
  bakery: ['베이커리', '빵집', '빵', '제과'],
  korean: ['한식', '분식', '식당', '밥집', '김밥', '백반', '음식점'],
  pub: ['주점', '호프', '술집', '포차', '이자카야', '바'],
  beauty: ['미용', '헤어', '네일', '뷰티', '미용실', '살롱'],
  academy: ['학원', '교육', '공부방', '과외', '교습소'],
  fitness: ['헬스', '필라테스', '요가', '피트니스', '짐'],
  conv: ['편의점', '무인', '무인점포'],
};

/** "1억 5천만원", "5000만원", "3천" → 만원 단위 정수 */
export function parseMoneyMan(s = '') {
  const t = String(s).replace(/,/g, '');
  let total = 0, found = false;

  const eok = t.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eok) { total += parseFloat(eok[1]) * 10000; found = true; }

  const rest = eok ? t.slice(eok.index + eok[0].length) : t;
  const cheon = rest.match(/(\d+(?:\.\d+)?)\s*천/);
  if (cheon) {
    total += parseFloat(cheon[1]) * 1000; found = true;
  } else {
    const man = rest.match(/(\d{1,6})\s*만/);
    if (man) { total += parseInt(man[1], 10); found = true; }
  }
  return found ? Math.round(total) : null;
}

function detectIndustry(text) {
  for (const [id, words] of Object.entries(IND_KEYWORDS)) {
    if (words.some(w => text.includes(w))) return id;
  }
  return null;
}

/* 문장에서 지역명을 뽑는다.
   findArea 는 '깨끗한 상권명' 전용이라 문장을 그대로 넣으면 매칭되지 않는다.
   그래서 한글 토큰으로 쪼갠 뒤 조사를 떼고 각각 조회해 최고점을 고른다. */
const STOP_TOKENS = new Set([
  '상권', '자리', '창업', '추천', '분석', '어때', '괜찮', '어떤가', '알려', '예산', '정도',
  '근처', '주변', '얼마나', '필요해', '있어', '하려는데', '하려고', '좋을까', '어디가', '어디',
  '매출', '임대료', '보증금', '대출', '자금', '비용', '점포', '가게', '오픈', '만원', '천만원',
  '서울', '지역', '업종', '조건', '기준', '가능', '개설', '수익', '월세', '평수', '알고',
  ...Object.values(IND_KEYWORDS).flat(),
]);
const PARTICLE = /(에서는|에서|으로는|으로|에는|에게|에|은|는|이|가|을|를|의|도|만|랑|이랑|과|와|까지|부터)$/;

function mentionedArea(text) {
  const toks = String(text).match(/[가-힣]{2,12}/g) || [];
  let best = null, bestScore = 0;
  for (const tok of toks) {
    if (STOP_TOKENS.has(tok)) continue;
    for (const cand of [tok, tok.replace(PARTICLE, '')]) {
      if (cand.length < 2 || STOP_TOKENS.has(cand)) continue;
      const hit = rankAreas(cand, 1)[0];
      if (!hit) continue;
      // 긴 토큰이 맞은 쪽을 더 신뢰한다
      const s = hit.s + cand.length * 4;
      if (s > bestScore) { bestScore = s; best = hit.a; }
    }
  }
  // 우연한 부분일치를 걸러내는 하한선
  return bestScore >= 55 ? best : null;
}

/* 서울 상권에 없는 지명이면 SGIS 전국 행정구역에서 찾는다.
   ("부산 해운대", "전주" 처럼 서울 밖 질문을 규칙 모드에서도 처리하기 위함) */
/* 약칭 → 정식 시도명. "광주 서구" 처럼 시도와 시군구를 따로 말하는 경우가 많아
   시도를 먼저 확정하고 그 안에서 시군구를 찾아야 한다.
   ('서구'만으로 찾으면 서울·부산·대구·인천·광주·대전에 모두 있어 아무거나 걸린다) */
const SIDO_ALIAS = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도',
};

/**
 * 문장 안에서 행정동 이름을 찾는다.
 * 시군구를 이미 정한 뒤에 부르므로, 그 시군구가 실제로 가진 동 이름과만 맞춘다.
 * 그래야 '해운대구 카페'의 '해운대'를 동 이름으로 오인하지 않는다.
 */
function mentionedDong(text, sggName) {
  const raw = String(text);
  const list = (findRegionSbiz(sggName)?.dongList) || [];
  if (!list.length) return null;

  /* 동 이름에는 숫자가 섞인다('우1동', '종로1.2.3.4가동').
     일반 토큰 규칙은 한글만 떼어 내서 '우1동'이 '우'와 '동'으로 쪼개진다. */
  const toks = (raw.match(/[가-힣][가-힣0-9.·]{1,11}/g) || [])
    .flatMap(t => [t, t.replace(PARTICLE, '')])
    .map(t => t.replace(/[.·]$/, ''))
    .filter(t => t.length >= 2 && !STOP_TOKENS.has(t));

  /* 긴 이름을 먼저 본다 — '중앙동'과 '중앙1동'이 함께 있으면 더 구체적인 쪽이 맞다 */
  let best = null;
  for (const d of list) {
    const nm = d.name.replace(/[\s()·.]/g, '');
    if (toks.some(t => t === nm) && nm.length > (best?.length ?? 0)) best = nm;
  }
  return best;
}

async function mentionedRegion(text) {
  const raw = String(text);
  const toks = (raw.match(/[가-힣]{2,12}/g) || []).filter(t => !STOP_TOKENS.has(t));

  const cands = new Set();
  for (const tok of toks) {
    cands.add(tok);
    const stripped = tok.replace(PARTICLE, '');
    if (stripped.length >= 2 && !STOP_TOKENS.has(stripped)) cands.add(stripped);
  }

  /* 문장에 언급된 시도 (없을 수도 있다).
     단순 포함으로 보면 '해운대구'의 '대구'가 걸려 대구광역시로 잘못 몰린다.
     그래서 낱말 첫머리에 붙은 것만 인정하고, 여러 개면 먼저 나온 쪽을 쓴다. */
  const alias = Object.keys(SIDO_ALIAS)
    .map(a => [a, raw.search(new RegExp('(^|[^가-힣])' + a))])
    .filter(([, i]) => i >= 0)
    .sort((x, y) => x[1] - y[1])[0]?.[0] || null;
  const sidoFull = alias ? SIDO_ALIAS[alias] : null;
  // '광주광역시' 같은 시도명 자체는 시군구 후보에서 뺀다 ('부산진구'는 남겨야 한다)
  const isSidoWord = c =>
    c === alias || c === sidoFull || new RegExp(`^${alias}(특별시|광역시|특별자치시|특별자치도|도)$`).test(c);

  const pick = async (cand, limit) => {
    try { return await findRegions(cand, limit); } catch { return []; }
  };

  /* 1순위: 시도를 알면 그 안에서 시군구를 찾는다 */
  if (sidoFull) {
    let best = null, bestLen = 0;
    for (const cand of cands) {
      if (cand.length < 2 || isSidoWord(cand)) continue;    // 시도 토큰 자체는 건너뛴다
      const hits = await pick(cand, 8);
      const inSido = hits.find(h => h.level === '시군구' && (h.fullName || '').startsWith(sidoFull));
      if (inSido && cand.length > bestLen) { best = inSido; bestLen = cand.length; }
    }
    if (best) return best;
    // 시군구를 못 찾으면 시도 대표(첫 시군구)가 아니라 시도 자체를 준다
    const sido = (await pick(alias, 8)).find(h => h.fullName === sidoFull || h.name === sidoFull);
    if (sido) return sido;
  }

  /* 2순위: 시도를 모를 때 — 가장 구체적인(긴) 토큰으로 찾는다 */
  let best = null, bestLen = 0;
  for (const cand of cands) {
    if (cand.length < 2 || cand.length <= bestLen) continue;
    const hit = (await pick(cand, 1))[0];
    if (hit && hit.level === '시군구') { best = hit; bestLen = cand.length; }
  }
  return best;
}

const fmtWon = man => {
  man = Math.round(man || 0);
  if (Math.abs(man) >= 10000) {
    const e = Math.floor(man / 10000), r = man % 10000;
    return r ? `${e}억 ${r.toLocaleString('ko-KR')}만원` : `${e}억원`;
  }
  return `${man.toLocaleString('ko-KR')}만원`;
};

async function runWithRules(messages, context) {
  const userTexts = messages.filter(m => m.role === 'user').map(m => m.content || '');
  const text = userTexts[userTexts.length - 1] || '';
  const trace = [];
  const call = async (name, args) => {
    const r = await runTool(name, args);
    trace.push({ name, label: TOOL_LABELS[name] || name, args, ok: !r?.오류 });
    return r;
  };

  const base = context?.cond || {};

  /* 대화 문맥 유지: 최근 발화부터 거슬러 올라가며 처음 찾은 값을 쓴다.
     "홍대에서 주점 어디가 좋아?" → "자금 얼마나 필요해?" 처럼
     뒷 문장에 업종·예산이 없어도 앞 발화에서 이어받는다.
     (AI 경로는 대화 이력을 그대로 넘기므로 이 처리가 필요 없다) */
  const recall = fn => {
    for (let i = userTexts.length - 1; i >= 0; i--) {
      const v = fn(userTexts[i]);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };

  const industry = recall(detectIndustry) || base.industry || null;
  const budget = recall(parseMoneyMan) ?? base.budget ?? null;

  /* 서울 밖 시도를 명시했으면 서울 상권 매칭을 쓰지 않는다.
     "광주 서구"의 '서구'가 서울 '강서구청'에 부분일치해 엉뚱한 결과가 나온다. */
  const OUTSIDE_SEOUL = /(부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;
  const outside = OUTSIDE_SEOUL.test(text) && !/서울/.test(text);

  const named = outside ? null : (mentionedArea(text) || recall(mentionedArea));
  // "홍대에서" 처럼 자치구가 아닌 지명을 말하면 그 상권이 속한 구로 범위를 좁힌다
  const gu = detectGu(text) || recall(detectGu) || named?.gu || base.gu || null;

  /* 의도 구분: 목록을 원하는가(추천), 한 곳을 원하는가(상세) */
  const wantsList = /추천|찾아|어디가|어디에|어디서|좋을까|좋은\s?곳|자리|후보|목록|알아봐|비교/.test(text);
  const wantsOne = /어때|어떤가|괜찮|분석해|알려줘|상세|정보|평가/.test(text);

  /* 1) 지표·출처 설명 */
  if (/어떻게 (계산|산출)|무슨 뜻|뭐야|어디서 (가져|나온)|출처|기준이 뭐|한계/.test(text)) {
    const metric = /출처|어디서/.test(text) ? '데이터출처'
                 : /한계|못하|안 하|안하/.test(text) ? '한계'
                 : /적합도|점수/.test(text) ? '적합도점수'
                 : /비용|보증금|인테리어/.test(text) ? '비용산출'
                 : /매출/.test(text) ? '매출지수' : '적합도점수';
    const r = await call('explain_metric', { metric });
    return { reply: `<b>${metric}</b> — ${r.설명}`, trace };
  }

  /* 2) 자금 계획 */
  if (/자금|대출|얼마나 (드|필요)|보증금|비용|예산이 되|가능할까/.test(text) && industry && budget) {
    const equity = base.equity ?? Math.round(budget / 2);
    const areaName = mentionedArea(text)?.name;
    const r = await call('simulate_finance', { industry, budget, equity, area: base.area ?? 15, areaName });
    if (r.오류) return { reply: r.오류, trace };
    const lines = [
      `<b>${r.상권}</b> 기준 총 소요자금은 ${r.표기.총소요자금}입니다.`,
      `자기자본 ${fmtWon(equity)}을 빼면 ${r.자금.부족자금_표기}을 조달해야 합니다.`,
      r.조달상품.length
        ? `금리가 낮은 순서로 ${r.조달상품.map(p => `${p.이름.split(' (')[0]} ${p.금액_표기}(연 ${p.금리_퍼센트}%)`).join(', ')} 조합을 권합니다.`
        : '',
      `월 고정비는 ${r.표기.월고정비}이고, 상환까지 반영한 손익분기 필요 매출선은 월 ${r.자금.상환포함_손익분기매출_표기}입니다.`,
      `이 값은 매출 예측이 아니라 고정비와 상환액에서 역산한 기준선입니다.`,
    ].filter(Boolean);
    return { reply: lines.join(' '), trace };
  }

  /* 3) 특정 상권 조회 — 목록을 원하는 질문이면 건너뛴다 */
  if (named && industry && wantsOne && !wantsList) {
    const r = await call('get_area_detail', { areaName: named.name, industry, budget: budget ?? 15000, area: base.area ?? 15 });
    if (r.오류) return { reply: r.오류, trace };
    const d = r.결과, mk = r.시장;
    return {
      reply: `<b>${d.상권명}</b>(${d.자치구})의 ${industryById(industry).name} 적합도는 <b>${d.적합도점수}점</b>입니다. `
           + `일평균 생활인구 ${d.일평균_생활인구?.toLocaleString('ko-KR')}명, 해당 업종 점포 ${d.해당업종.점포수 ?? '-'}개, `
           + `폐업률 ${d.해당업종.폐업률_퍼센트 ?? '-'}%, 평당 임대료 ${d.임대료_만원_평당 ?? '-'}만원입니다. `
           + (mk?.점포당_월매출_만원
             ? `${mk.행정동} 기준 점포당 월매출은 <b>평균 ${mk.점포당_월매출_만원.toLocaleString('ko-KR')}만원</b>입니다(카드매출 추정, 행정동 평균). `
             : '')
           + `초기 개설비용은 ${d.초기개설비용_표기}으로 추산됩니다.`,
      trace,
    };
  }

  /* 3-b) 서울 밖 지역 → SGIS 전국 통계
     서울 상권에서 못 찾았고 업종을 알면, 전국 행정구역에서 다시 찾아본다. */
  if (!named && industry && sgisOn()) {
    const region = await mentionedRegion(text);
    if (region) {
      /* 반드시 fullName('광주광역시 서구')을 넘긴다.
         name('서구')만 주면 도구가 다시 검색하면서 동명이구 중 첫 번째(부산)를 잡는다. */
      const sggName = region.fullName || region.name;
      const r = await call('get_national_region',
        { regionName: sggName, dongName: mentionedDong(text, sggName) || undefined, industry });
      if (!r.오류) {
        const p = r.인구 || {}, ind = r.해당업종 || {}, oc = r.개폐업, mk = r.시장;
        const bits = [
          `<b>${r.지역}</b>는 총인구 ${(p.총인구 ?? 0).toLocaleString('ko-KR')}명, `
          + `인구밀도 ${p.인구밀도_명_제곱km ?? '-'}명/㎢입니다.`,
          `${ind.업종 ?? ''} 사업체는 ${(ind.사업체수 ?? 0).toLocaleString('ko-KR')}개로 `
          + `점포 1곳당 배후인구는 ${(r.점포당_배후인구 ?? 0).toLocaleString('ko-KR')}명입니다.`,
        ];
        // 소상공인365 가 있으면 매출까지 말할 수 있다
        if (mk?.점포당_월매출_만원) {
          const 동 = mk.시군구_내_매출순위;
          bits.push(동
            ? `<b>${mk.단위.replace(' (행정동)', '')}</b>의 점포당 월매출은 `
              + `<b>평균 ${mk.점포당_월매출_만원.toLocaleString('ko-KR')}만원</b>으로, `
              + `${r.지역} 안에서 <b>${동}</b>입니다(카드매출 기준).`
            : `점포당 월매출은 <b>평균 ${mk.점포당_월매출_만원.toLocaleString('ko-KR')}만원</b>으로 추정됩니다(카드매출 기준).`
              + (mk.매출상위_행정동?.length
                ? ` 이 안에서는 ${mk.매출상위_행정동.slice(0, 3)
                    .map(d => `<b>${d.행정동}</b> ${d.점포당_월매출_만원.toLocaleString('ko-KR')}만원`).join(', ')} 순으로 높습니다.`
                : ''));
        }
        // 인허가 데이터가 있으면 개·폐업까지 말할 수 있다
        if (oc && !oc.조회실패) {
          bits.push(`<b>${oc.기준연도}년</b> 한 해 동안 <b>${oc.기준연도_개업}곳이 새로 열고 `
            + `${oc.기준연도_폐업}곳이 문을 닫아 폐업률은 ${oc.폐업률_퍼센트}%</b>였습니다(인허가 기준`
            + (r.개폐업_기준 ? `, ${r.지역} 전체` : '') + ').'
            + (oc.올해_진행 ? ` ${oc.올해_진행.연도}년은 진행 중이며 개업 ${oc.올해_진행.개업}곳·폐업 ${oc.올해_진행.폐업}곳입니다.` : ''));
        }
        // 임대료·권리금이 있으면 초기비용까지 말할 수 있다
        const re = r.부동산;
        if (re?.임대료_만원_평) {
          bits.push(`임대료는 평당 <b>${re.임대료_만원_평}만원</b>`
            + (re.공실률_퍼센트 != null ? `, 공실률 ${re.공실률_퍼센트}%` : '')
            + `입니다(${re.기준}, ${re.시점}).`
            + (re.권리금_중위_만원
              ? ` 권리금은 중위 <b>${re.권리금_중위_만원.toLocaleString('ko-KR')}만원</b>이며, `
                + `점포의 ${re.권리금_있는_비율_퍼센트}%가 권리금이 있습니다.`
              : ''));
        }
        const 없는것 = [...(mk?.점포당_월매출_만원 ? [] : ['유동인구']),
                      ...(oc && !oc.조회실패 ? [] : ['폐업률']),
                      ...(re?.임대료_만원_평 ? [] : ['임대료'])];
        bits.push(`다만 <b>서울 외 지역은 시군구·행정동 단위</b>라 `
          + (없는것.length ? `${없는것.join('·')}는 확인할 수 없고, ` : '')
          + `교통·생활인프라 지표가 없어 <b>적합도 6축 점수는 산출하지 않습니다</b>. `
          + `서울 상권 분석과는 산출 기준이 달라 직접 비교할 수 없습니다.`);
        return { reply: bits.join(' '), trace };
      }
    }
  }

  /* 4) 상권 추천 */
  if (industry && budget) {
    const r = await call('search_areas', { industry, budget, area: base.area ?? 15, goal: base.goal, mode: base.mode, gu, top: 5 });
    if (r.오류) return { reply: r.오류, trace };
    const head = `${industryById(industry).name} · 예산 ${fmtWon(budget)}${gu ? ` · ${gu}` : ''} 조건으로 `
               + `${r.후보_상권수.toLocaleString('ko-KR')}개 상권을 분석했습니다.`;
    const list = r.결과.map(x =>
      `${x.순위}. <b>${x.상권명}</b> (적합도 ${x.적합도점수}점) — 일평균 ${x.일평균_생활인구?.toLocaleString('ko-KR')}명, `
      + `${x.해당업종.점포수 ?? '-'}개 점포, 개설비 ${x.초기개설비용_표기}${x.예산내_여부 ? '' : ' (예산 초과)'}`
    ).join('\n');
    return { reply: `${head}\n\n${list}\n\n자세한 지표와 자금 계획은 화면의 분석 리포트에서 확인하실 수 있습니다.`, trace };
  }

  /* 5) 정보 부족 → 안내 */
  const missing = [];
  if (!industry) missing.push('업종');
  if (!budget) missing.push('예산');
  return {
    reply: `상담을 위해 <b>${missing.join('과 ')}</b>을(를) 알려주세요. `
         + `예를 들어 "강남에서 1억 5천으로 카페 자리 찾아줘" 처럼 적어 주시면 바로 분석해 드립니다. `
         + `지원 업종은 ${INDUSTRIES.map(i => i.name).join(', ')} 8가지입니다.`,
    trace,
  };
}

/* ============================================================
 *  공개 진입점
 * ============================================================ */
export async function runAgent({ messages = [], context = null } = {}) {
  const clean = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)                                   // 최근 12턴만 (토큰·비용 제한)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!clean.length) {
    return { reply: '무엇을 도와드릴까요?', trace: [], by: 'rule', ai: llmStatus() };
  }

  const status = llmStatus();
  if (!status.enabled) {
    return { ...(await runWithRules(clean, context)), by: 'rule', ai: status };
  }

  try {
    const r = await runWithAI(clean, context);
    return { ...r, by: 'ai', ai: status };
  } catch (e) {
    console.warn('[agent] AI 실패 → 규칙 기반 폴백:', e.message);
    const fb = await runWithRules(clean, context);
    return { ...fb, by: 'rule-fallback', aiError: e.message, ai: status };
  }
}

/** 첫 진입 시 보여줄 추천 질문 */
export const SUGGESTIONS = [
  '강남에서 1억 5천으로 카페 자리 찾아줘',
  '성수동 카페 상권 어때?',
  '5천만원으로 창업 가능한 곳 있어?',
  '적합도 점수는 어떻게 계산해?',
];
