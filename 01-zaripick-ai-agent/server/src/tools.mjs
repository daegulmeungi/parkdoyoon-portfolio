/* ============================================================
 *  AI 에이전트 도구
 *
 *  설계 원칙 (기존 서비스 철학과 동일):
 *    · 숫자는 전부 이 파일의 코드가 계산한다. LLM에게 만들게 하지 않는다.
 *    · LLM은 도구를 '고르고' 결과를 '문장으로 옮기는' 역할만 한다.
 *    · 그래서 어떤 모델(Gemini/GPT/Claude)을 쓰든 수치는 동일하다.
 *
 *  각 도구는 { def, run } 구조다.
 *    def : 프로바이더에 전달할 JSON Schema (llm.mjs 가 포맷 변환)
 *    run : 실제 실행 함수. 반환값은 LLM이 읽을 compact 객체.
 * ============================================================ */
import { AREAS, NORM, findAreas, findArea, GU_LIST } from './store.mjs';
import { INDUSTRIES, GOALS, MODES, COST_ASSUMPTIONS, normCond, industryById } from './model.mjs';
import { score, financePlan } from './scoring.mjs';
import { isEnabled as sgisOn, findRegions, getRegionSummary } from './sgis.mjs';
import { getOpenCloseStats, isEnabled as localdataOn } from './localdata.mjs';
import { getMarketStats, getDongMarket, getDongStats, sbizStatus } from './sbiz.mjs';
import { getRent, getKeyMoney, roneStatus } from './rone.mjs';

const sbizOn = () => sbizStatus().enabled;
const roneOn = () => roneStatus().enabled;

const IND_IDS = INDUSTRIES.map(i => i.id);
const GOAL_IDS = GOALS.map(g => g.id);
const MODE_IDS = MODES.map(m => m.id);

/* 만원 단위를 사람이 읽는 문자열로 (LLM이 단위를 헷갈리지 않게 함께 넘긴다) */
const won = man => {
  man = Math.round(man || 0);
  if (Math.abs(man) >= 10000) {
    const eok = Math.floor(man / 10000), rest = man % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }
  return `${man.toLocaleString('ko-KR')}만원`;
};

/* 공통 조건 스키마 조각 */
const CONDITION_PROPS = {
  industry: { type: 'string', enum: IND_IDS, description: '업종 id. 반드시 이 중 하나' },
  budget: { type: 'number', description: '총 창업 예산 (만원 단위. 예: 1억 5천만원 → 15000)' },
  area: { type: 'number', description: '희망 점포 면적 (평). 미상이면 15' },
  equity: { type: 'number', description: '자기자본 (만원). 미상이면 예산의 절반 정도로 둔다' },
  goal: { type: 'string', enum: GOAL_IDS, description: 'traffic=상권 활성도 중시, safe=안정 운영 중시, cost=초기비용 절감 중시' },
  mode: { type: 'string', enum: MODE_IDS, description: 'visit=방문 중심, delivery=배달 중심, hybrid=혼합' },
  gu: { type: 'string', description: '특정 자치구로 한정할 때만 (예: 강남구). 없으면 서울 전역' },
};

/* 상권 1건을 LLM용으로 압축 */
function areaBrief(r, cond, rank) {
  const a = r.area, ind = a.ind?.[cond.industry] || {};
  return {
    순위: rank ?? undefined,
    상권명: a.name, 유형: a.type, 자치구: a.gu,
    적합도점수: r.total,
    세부점수: r.sub,
    일평균_생활인구: a.foot,
    전년동분기_증감률_퍼센트: a.footGrowth,
    피크시간대: a.peak,
    거주인구: a.resident, 직장인구: a.worker,
    지하철역수: a.subway, 버스정류장수: a.bus,
    임대료_만원_평당: a.rentPerPy, 공실률_퍼센트: a.vacancy,
    상권변화지표: a.changeNm,
    평균영업개월: a.avgOperateMonths, 서울평균영업개월: a.seoulAvgOperateMonths,
    해당업종: {
      점포수: ind.storeCnt ?? null,
      매출지수_서울중앙값100: ind.salesIdx ?? null,
      매출지수출처: ind.salesIdxSource ?? null,
      폐업률_퍼센트: ind.closeRate ?? null,
      개업률_퍼센트: ind.openRate ?? null,
      경쟁밀도_0_100: ind.competition ?? null,
      업종적합도: ind.fit ?? null,
    },
    초기개설비용_만원: r.est.openingCost,
    초기개설비용_표기: won(r.est.openingCost),
    총소요자금_만원: r.est.total,
    월고정비_만원: r.est.breakEvenMonthlySales,
    예산내_여부: r.affordable,
  };
}

/* ============================================================
 *  도구 정의
 * ============================================================ */
export const TOOLS = [

  /* ---------- 0) 유효값 조회 ---------- */
  {
    def: {
      name: 'list_options',
      description: '분석에 쓸 수 있는 업종·창업목적·운영형태·자치구의 유효한 값 목록을 반환한다. '
                 + '사용자가 말한 업종이나 지역이 이 목록의 어떤 값인지 확실하지 않을 때 먼저 호출하라.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    run() {
      return {
        업종: INDUSTRIES.map(i => ({ id: i.id, 이름: i.name })),
        창업목적: GOALS.map(g => ({ id: g.id, 이름: g.name, 설명: g.desc })),
        운영형태: MODES.map(m => ({ id: m.id, 이름: m.name, 설명: m.desc })),
        자치구: GU_LIST,
        분석대상_상권수: AREAS.length,
        안내: '업종은 이 8개만 지원한다. 목록에 없는 업종을 물으면 가장 가까운 것을 제안하되 한계를 밝혀라.',
      };
    },
  },

  /* ---------- 1) 상권 검색 ---------- */
  {
    def: {
      name: 'search_areas',
      description: '조건(업종·예산·면적·목적·운영형태)에 맞는 서울 상권을 적합도 순으로 찾는다. '
                 + '"어디가 좋을까", "추천해줘" 류의 질문에 쓴다. 예산은 만원 단위로 변환해 넣어라.',
      parameters: {
        type: 'object',
        properties: {
          ...CONDITION_PROPS,
          top: { type: 'number', description: '반환 개수 (기본 5, 최대 10)' },
        },
        required: ['industry', 'budget'],
      },
    },
    run(args) {
      const cond = normCond(args);
      const top = Math.max(1, Math.min(10, Number(args.top) || 5));
      let pool = AREAS;
      if (cond.gu) pool = pool.filter(a => a.gu === cond.gu);
      if (!pool.length) {
        return { 오류: `'${cond.gu}' 에 해당하는 상권이 없습니다.`, 사용가능_자치구: GU_LIST };
      }
      const ranked = pool.map(a => score(a, cond, NORM))
                         .sort((x, y) => y.total - x.total)
                         .slice(0, top);
      return {
        조건: {
          업종: industryById(cond.industry).name, 예산: won(cond.budget),
          면적_평: cond.area, 목적: GOALS.find(g => g.id === cond.goal)?.name,
          운영형태: MODES.find(m => m.id === cond.mode)?.name,
          범위: cond.gu || '서울 전역',
        },
        후보_상권수: pool.length,
        결과: ranked.map((r, i) => areaBrief(r, cond, i + 1)),
        주의: '매출과 수익은 제공하지 않는다. 예측하지 말고 관측 지표만 근거로 설명하라.',
      };
    },
  },

  /* ---------- 2) 상권 상세 ---------- */
  {
    def: {
      name: 'get_area_detail',
      description: '특정 상권 한 곳의 상세 지표를 조회한다. 사용자가 지역명을 말하면 이 도구로 확인하라. '
                 + '지역명은 "성수", "강남역", "홍대" 처럼 부정확해도 된다.',
      parameters: {
        type: 'object',
        properties: {
          areaName: { type: 'string', description: '상권명 또는 지역명' },
          industry: CONDITION_PROPS.industry,
          budget: CONDITION_PROPS.budget,
          area: CONDITION_PROPS.area,
        },
        required: ['areaName', 'industry'],
      },
    },
    async run(args) {
      const matches = findAreas(args.areaName, 5);
      if (!matches.length) {
        return { 오류: `'${args.areaName}' 과(와) 일치하는 상권을 찾지 못했습니다.`,
                 안내: '서울시가 정의한 상권명 기준으로 검색합니다. 다른 이름으로 다시 시도하도록 사용자에게 물어보세요.' };
      }
      const cond = normCond(args);
      const r = score(matches[0], cond, NORM);

      /* 상권 캐시의 admCd 가 소상공인365 행정동코드와 같은 체계라 실매출을 붙일 수 있다.
         적합도 점수에는 반영하지 않는다 — 참고 수치다. */
      let 시장 = null;
      if (sbizOn() && matches[0].admCd) {
        const m = await getDongMarket(matches[0].admCd, cond.industry).catch(() => null);
        if (m) 시장 = {
          행정동: m.행정동,
          점포당_월매출_만원: m.점포당_월매출_만원,
          행정동_점포수: m.점포수,
          주의: '행정동 평균 카드매출 추정치다. 이 상권 개별 점포의 예상 매출이 아니며 그렇게 말하지 마라.',
          출처: m.출처,
        };
      }

      return {
        결과: areaBrief(r, cond, null),
        시장,
        유사_상권: matches.slice(1).map(a => a.name),
        안내: matches.length > 1
          ? '여러 상권이 매칭되었다. 다른 곳을 의도했을 수 있으니 필요하면 되물어라.' : undefined,
      };
    },
  },

  /* ---------- 3) 상권 비교 ---------- */
  {
    def: {
      name: 'compare_areas',
      description: '2~4개 상권을 같은 조건으로 나란히 비교한다. "A랑 B 중에 어디가 나아?" 류 질문에 쓴다.',
      parameters: {
        type: 'object',
        properties: {
          areaNames: { type: 'array', items: { type: 'string' }, description: '비교할 상권명 2~4개' },
          industry: CONDITION_PROPS.industry,
          budget: CONDITION_PROPS.budget,
          area: CONDITION_PROPS.area,
          goal: CONDITION_PROPS.goal,
          mode: CONDITION_PROPS.mode,
        },
        required: ['areaNames', 'industry'],
      },
    },
    run(args) {
      const names = (args.areaNames || []).slice(0, 4);
      if (names.length < 2) return { 오류: '비교하려면 상권을 2개 이상 지정해야 합니다.' };
      const cond = normCond(args);
      const rows = [], missed = [];
      for (const n of names) {
        const a = findArea(n);
        if (!a) { missed.push(n); continue; }
        rows.push(areaBrief(score(a, cond, NORM), cond, null));
      }
      if (rows.length < 2) return { 오류: '유효한 상권이 2개 미만입니다.', 못찾음: missed };
      const best = rows.reduce((b, x) => (x.적합도점수 > b.적합도점수 ? x : b), rows[0]);
      return {
        조건: { 업종: industryById(cond.industry).name, 예산: won(cond.budget), 면적_평: cond.area },
        비교: rows,
        최고점: best.상권명,
        못찾음: missed.length ? missed : undefined,
        주의: '점수 차가 작으면 우열을 단정하지 말고 어떤 지표에서 갈리는지 설명하라.',
      };
    },
  },

  /* ---------- 4) 자금 계획 ---------- */
  {
    def: {
      name: 'simulate_finance',
      description: '특정 상권에 창업할 때 필요한 자금과 조달 조합(정책자금·보증·신용대출)을 계산한다. '
                 + '"돈이 얼마나 드나", "대출은 얼마나 받아야 하나" 류 질문에 쓴다.',
      parameters: {
        type: 'object',
        properties: {
          areaName: { type: 'string', description: '상권명. 생략하면 예산 조건의 대표 상권으로 계산' },
          industry: CONDITION_PROPS.industry,
          budget: CONDITION_PROPS.budget,
          area: CONDITION_PROPS.area,
          equity: CONDITION_PROPS.equity,
          ageBand: { type: 'string', enum: ['young', 'normal'],
                     description: '만 39세 이하면 young (청년 지원상품 대상)' },
        },
        required: ['industry', 'budget', 'equity'],
      },
    },
    run(args) {
      const cond = normCond(args);
      const a = args.areaName ? findArea(args.areaName) : null;
      if (args.areaName && !a) return { 오류: `'${args.areaName}' 상권을 찾지 못했습니다.` };

      const target = a || AREAS.map(x => score(x, cond, NORM))
                               .sort((x, y) => y.total - x.total)[0].area;
      const r = score(target, cond, NORM);
      const fin = financePlan(r, cond);

      return {
        상권: target.name,
        상권_자동선택: !a ? '지정이 없어 조건상 적합도 1위 상권으로 계산했다' : undefined,
        비용내역_만원: {
          보증금: r.est.depositMan, 인테리어: r.est.interiorMan, 설비집기: r.est.equipMan,
          초기운영자금: r.est.reserve, 예비비: r.est.contingency,
          초기개설비용: r.est.openingCost, 총소요자금: r.est.total,
          월임차료: r.est.rentMonth, 월운영비: r.est.opMonth, 월고정비: r.est.breakEvenMonthlySales,
        },
        표기: { 총소요자금: won(r.est.total), 월고정비: won(r.est.breakEvenMonthlySales) },
        자금: {
          자기자본_만원: cond.equity, 부족자금_만원: fin.shortfall,
          부족자금_표기: won(fin.shortfall),
          총조달_만원: fin.raised, 조달가능: fin.covered,
          거치중_월상환_만원: fin.graceRepay, 원리금_월상환_만원: fin.monthlyRepay,
          상환포함_손익분기매출_만원: fin.breakEvenWithRepay,
          상환포함_손익분기매출_표기: won(fin.breakEvenWithRepay),
        },
        조달상품: fin.products.map(p => ({
          이름: p.name, 기관: p.org, 유형: p.type, 금리_퍼센트: p.rate,
          금액_만원: p.amt, 금액_표기: won(p.amt),
          거치개월: p.grace, 기간: p.term, 월상환_만원: p.monthly, 선택이유: p.why,
        })),
        가정: COST_ASSUMPTIONS.notes,
        주의: '손익분기 매출선은 고정비와 상환액에서 역산한 값이다. 매출 예측이 아니라는 점을 반드시 밝혀라.',
      };
    },
  },

  /* ---------- 5) 전국 지역 통계 (SGIS) ---------- */
  {
    def: {
      name: 'get_national_region',
      description: '서울 밖 지역(부산·대구·전주·제주 등)의 인구·연령구성·업종별 사업체 수를 조회한다. '
                 + '상권 단위 상세 분석은 서울만 가능하므로, 서울이 아닌 지역을 물으면 반드시 이 도구를 쓴다. '
                 + '통계청 SGIS 전국 데이터이며 시군구 단위다.',
      parameters: {
        type: 'object',
        properties: {
          regionName: { type: 'string', description: '지역명 (예: 해운대구, 전주시, 제주시). 시군구 단위로 해석된다' },
          dongName: { type: 'string', description: '행정동/읍/면 이름 (예: 명동, 노형동, 돌산읍). '
                    + '사용자가 동네 단위로 물으면 넣는다. 넣으면 그 동만 따로 본다' },
          industry: CONDITION_PROPS.industry,
        },
        required: ['regionName'],
      },
    },
    async run(args) {
      if (!sgisOn()) {
        return { 오류: 'SGIS 연동이 꺼져 있어 서울 외 지역은 조회할 수 없습니다.',
                 안내: '현재 상세 분석은 서울 1,030개 상권만 지원한다고 안내하세요.' };
      }
      const hits = await findRegions(args.regionName, 5);
      if (!hits.length) return { 오류: `'${args.regionName}' 지역을 찾지 못했습니다.` };

      const s = await getRegionSummary(hits[0].code, args.industry);
      if (!s) return { 오류: `'${hits[0].fullName}' 통계를 가져오지 못했습니다.` };

      /* LOCALDATA 가 수집돼 있으면 개·폐업률을 덧붙인다.
         SGIS 에는 없는 지표라 이게 있어야 '안정성'을 말할 수 있다. */
      let 개폐업 = null;
      if (args.industry && localdataOn()) {
        const oc = await getOpenCloseStats(hits[0].fullName, args.industry);
        if (oc && !oc.조회실패) {
          개폐업 = {
            기준자치단체: oc.자치단체,
            기준연도: oc.기준연도,
            영업중: oc.영업중,
            기준연도_개업: oc.기준연도_개업,
            기준연도_폐업: oc.기준연도_폐업,
            폐업률_퍼센트: oc.폐업률_퍼센트,
            개업률_퍼센트: oc.개업률_퍼센트,
            올해_진행: oc.올해,
            산출식: oc.산출식,
            주의: oc.주의,
            출처: oc.출처,
          };
        } else if (oc?.조회실패) {
          개폐업 = { 조회실패: true, 사유: oc.사유 };
        }
      }

      /* 소상공인365 는 SGIS·LOCALDATA 둘 다 없는 '점포당 월매출'을 준다.
         행정동 단위라 시군구 안에서 어디가 센지도 말할 수 있다. */
      let 시장 = null, 동단위 = false;
      if (args.industry && sbizOn()) {
        /* 동 이름을 주면 그 동만, 아니면 시군구 전체를 본다 */
        const m = args.dongName
          ? await getDongStats(hits[0].fullName, args.dongName, args.industry).catch(() => null)
          : await getMarketStats(hits[0].fullName, args.industry).catch(() => null);
        if (m) {
          동단위 = Boolean(args.dongName);
          시장 = {
            단위: 동단위 ? `${m.행정동} (행정동)` : '시군구 전체',
            점포당_월매출_만원: m.점포당_월매출_만원,
            점포수: m.점포수,
            유동인구: m.유동인구,
            직장인구: m.직장인구,
            주거인구: m.주거인구,
            월평균소득_만원: m.월평균소득_만원,
            월평균소비_만원: m.월평균소비_만원,
            ...(동단위
              ? { 시군구_내_매출순위: m.매출순위 && `${m.매출순위}/${m.매출순위_모수}위` }
              : { 매출상위_행정동: m.상위_행정동 }),
            주의: '점포당 월평균 매출은 카드매출 추정치다. 개별 점포의 예상 매출이 아니며 그렇게 말하지 마라.',
            출처: m.출처,
          };
        } else if (args.dongName) {
          시장 = { 오류: `'${args.dongName}' 을(를) ${hits[0].fullName} 안에서 찾지 못했습니다.` };
        }
      }

      /* 한국부동산원 임대료·권리금. 이게 있어야 초기비용을 말할 수 있다. */
      let 부동산 = null;
      if (roneOn()) {
        const [rent, km] = await Promise.all([
          getRent(hits[0].fullName).catch(() => null),
          args.industry ? getKeyMoney(hits[0].fullName, args.industry).catch(() => null) : null,
        ]);
        if (rent) 부동산 = {
          임대료_만원_평: rent.임대료_만원_평,
          공실률_퍼센트: rent.공실률_퍼센트,
          기준: rent.기준,
          시점: rent.시점,
          권리금_중위_만원: km?.권리금_중위_만원 ?? null,
          권리금_있는_비율_퍼센트: km?.권리금_있는_비율_퍼센트 ?? null,
          주의: '지역 평균이다. 개별 점포의 임대료·권리금은 입지와 조건에 따라 크게 다르다.',
          출처: rent.출처,
        };
      }

      return {
        개폐업,
        개폐업_기준: 개폐업 && 동단위 ? `${hits[0].fullName} 전체 (인허가 데이터에 행정동 구분이 없다)` : undefined,
        시장,
        부동산,
        지역: hits[0].fullName,
        인구: s.인구 ? {
          총인구: s.인구.총인구, 평균나이: s.인구.평균나이,
          인구밀도_명_제곱km: s.인구.인구밀도, 총가구: s.인구.총가구,
          전체사업체수: s.인구.사업체수, 기준연도: s.인구.year,
        } : null,
        연령구성_퍼센트: s.연령구성 ? Object.fromEntries(
          Object.entries(s.연령구성).filter(([k]) => k.includes('대'))
                .map(([k, v]) => [k, v.비율])) : null,
        해당업종: s.업종 ? {
          업종: industryById(s.업종.industry).name,
          사업체수: s.업종.사업체수, 종사자수: s.업종.종사자수,
          기준연도: s.업종.year,
        } : null,
        점포당_배후인구: s.점포당_배후인구,
        다른_후보: hits.slice(1).map(h => h.fullName),
        한계: '서울과 달리 상권 단위가 아니라 시군구·행정동 단위다. 임대료는 지역 평균이라 '
            + '초기비용은 말할 수 있지만, 교통·생활인프라 지표가 없어 적합도 6축 점수는 산출하지 않는다. '
            + '관측된 수치만 설명하고 서울 상권 점수와 직접 비교하지 마라.',
        출처: s.출처,
      };
    },
  },

  /* ---------- 6) 지표 설명 ---------- */
  {
    def: {
      name: 'explain_metric',
      description: '지표나 점수가 어떻게 계산되는지, 데이터 출처가 무엇인지 설명이 필요할 때 호출한다. '
                 + '"적합도 점수가 뭐야", "이 숫자 어디서 나온 거야" 류 질문에 쓴다.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['적합도점수', '수요', '업종적합도', '교통', '생활인프라', '예산적합도',
                   '안정성', '매출지수', '경쟁밀도', '비용산출', '데이터출처', '한계'],
            description: '설명할 항목',
          },
        },
        required: ['metric'],
      },
    },
    run(args) {
      const DOC = {
        적합도점수: '6개 세부점수(수요·업종적합도·교통·생활인프라·예산적합도·안정성)를 창업목적별 가중치로 가중합산한 0~100점. '
          + '목적이 traffic이면 수요 30%·업종 24%, safe면 안정성 24%, cost면 예산적합도 38%가 가장 큰 비중이다. '
          + '예산으로 개설비용을 감당하지 못하면 총점에 0.62~0.90 배의 감점을 적용한다.',
        수요: '방문 중심은 일평균 생활인구를 상위 95퍼센타일로 정규화한 값. '
          + '배달 중심은 거주인구×1.1 + 직장인구×0.7 의 배후수요로 대체하고 교통 가중치를 절반으로 낮춘다. 혼합은 둘의 평균.',
        업종적합도: '해당 상권의 업종별 점포수·매출지수·폐업률·경쟁밀도를 결합한 0~100점. ETL 단계에서 미리 계산해 둔다.',
        교통: '상권 반경 내 지하철역 수와 버스정류장 수를 정규화해 합산한 0~100점.',
        생활인프라: '상권 내 생활편의 시설 밀도를 정규화한 0~100점.',
        예산적합도: '입력 예산 ÷ 초기개설비용 비율로 산출. 1.6배 이상이면 92점, 1.0~1.6배는 70~92점 구간, 1.0 미만이면 비율×62.',
        안정성: '100 - 폐업률×4.2 - 경쟁밀도×0.25 - 공실률×1.4 에 상권변화지표 보정(상권확장 +8 ~ 상권축소 -12)과 '
          + '평균영업기간 보정(±10)을 더한 값.',
        매출지수: '서울 중앙값을 100으로 둔 상대지수. 절대 매출액이 아니다. '
          + '원천 데이터가 골목상권에만 존재해 그 외 상권은 자치구 중앙값으로 대체하며, salesIdxSource 필드에 observed/gu_avg/seoul_avg 로 표기한다.',
        경쟁밀도: '상권 면적 대비 동일 업종 점포 수를 0~100으로 정규화한 값. 높을수록 경쟁이 치열하다.',
        비용산출: '임대료는 한국부동산원 관측값(평당 월세)이다. 보증금은 월세×10개월 가정, '
          + '인테리어·설비·운영비는 업종 표준 단가 가정값이며 관측값이 아니다. 권리금은 공개 통계가 없어 제외했다.',
        데이터출처: '서울 열린데이터광장(생활인구·상권분석서비스), 소상공인시장진흥공단(상가정보), '
          + '한국부동산원(임대동향), 국토교통부(실거래가), 국가철도공단(역사정보), 서울시(버스정류소) '
          + '6개 기관 데이터를 행정동 코드 기준으로 통합한 SEOUL DB를 쓴다. 매월 1회 갱신한다.',
        한계: '① 매출·수익·투자회수기간을 예측하지 않는다(운영 역량 편차가 커 신뢰구간을 줄 수 없다). '
          + '② 매출 데이터는 골목상권에만 존재한다. ③ 권리금 데이터가 없다. '
          + '④ 인테리어·운영비는 가정값이다. ⑤ 현재 서울만 지원한다.',
      };
      return { 항목: args.metric, 설명: DOC[args.metric] || '해당 항목 설명이 준비되어 있지 않습니다.' };
    },
  },
];

export const TOOL_DEFS = TOOLS.map(t => t.def);
const BY_NAME = new Map(TOOLS.map(t => [t.def.name, t]));

/** 도구 실행. 실패해도 예외를 던지지 않고 오류 객체를 반환해 대화를 이어가게 한다.
 *  외부 API를 쓰는 도구가 있어 async 다. 호출부는 반드시 await 해야 한다. */
export async function runTool(name, args = {}) {
  const t = BY_NAME.get(name);
  if (!t) return { 오류: `알 수 없는 도구: ${name}`, 사용가능: [...BY_NAME.keys()] };
  try {
    return await t.run(args || {});
  } catch (e) {
    console.warn(`[tools] ${name} 실행 실패:`, e.message);
    return { 오류: `도구 실행 중 오류가 발생했습니다: ${e.message}` };
  }
}

/** UI 표시용 한글 라벨 */
export const TOOL_LABELS = {
  list_options: '분석 옵션 확인',
  search_areas: '상권 검색',
  get_area_detail: '상권 상세 조회',
  compare_areas: '상권 비교',
  simulate_finance: '자금 계획 계산',
  get_national_region: '전국 지역 통계 조회',
  explain_metric: '지표 산출 방식 조회',
};
