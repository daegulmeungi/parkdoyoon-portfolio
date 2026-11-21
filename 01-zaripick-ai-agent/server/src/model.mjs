/* ============================================================
 *  도메인 모델: 업종/목적/운영형태 정의와 비용 가정
 *  프런트엔드는 /api/meta 로 이 값을 받아 쓰므로 여기가 단일 출처다.
 * ============================================================ */

/* 업종: seoul_db 의 industry_mapping.ui_category 8종과 1:1로 대응한다.
 * DB에 매핑이 없는 업종은 지표를 산출할 수 없으므로 여기에 임의로 추가하지 말 것.
 * interiorPerPy / monthlyOpCost 는 DB에 없는 값이라 '가정'이며,
 * 리포트에서 관측치와 구분해 표기한다. */
export const INDUSTRIES = [
  { id: 'cafe',    name: '카페·디저트',   icon: 'cafe',     interiorPerPy: 180, monthlyOpCost: 620, assumed: true },
  { id: 'bakery',  name: '베이커리',      icon: 'bread',    interiorPerPy: 220, monthlyOpCost: 850, assumed: true },
  { id: 'korean',  name: '한식·분식',     icon: 'bowl',     interiorPerPy: 160, monthlyOpCost: 780, assumed: true },
  { id: 'pub',     name: '주점·호프',     icon: 'beer',     interiorPerPy: 200, monthlyOpCost: 900, assumed: true },
  { id: 'beauty',  name: '미용·뷰티',     icon: 'scissors', interiorPerPy: 240, monthlyOpCost: 560, assumed: true },
  { id: 'academy', name: '학원·교육',     icon: 'book',     interiorPerPy: 120, monthlyOpCost: 720, assumed: true },
  { id: 'fitness', name: '헬스·필라테스', icon: 'dumbbell', interiorPerPy: 200, monthlyOpCost: 980, assumed: true },
  { id: 'conv',    name: '편의점·무인',   icon: 'bag',      interiorPerPy: 140, monthlyOpCost: 520, assumed: true },
];

export const GOALS = [
  { id: 'cost',    name: '초기비용 절감', icon: 'wallet',  desc: '임대료·보증금·권리금 부담 최소화' },
  { id: 'traffic', name: '상권 활성도',   icon: 'trendup', desc: '유동인구·집객 시설 가중' },
  { id: 'safe',    name: '안정 운영',     icon: 'shield',  desc: '폐업률·상권 변화지표 가중' },
];

export const MODES = [
  { id: 'visit',    name: '방문 중심', icon: 'store',   desc: '유동인구·교통 접근성 가중' },
  { id: 'delivery', name: '배달 중심', icon: 'scooter', desc: '배후 주거·직장 인구, 임대료 가중' },
  { id: 'hybrid',   name: '혼합',      icon: 'grid',    desc: '방문·배달 수요 균형 반영' },
];

/* 비용 산출 가정: 리포트에 명시된다 */
export const COST_ASSUMPTIONS = {
  depositMonths: 10,        // 보증금 = 월 임대료 × 10 (상가 임대 관행)
  equipRatio: 0.35,         // 설비·집기 = 인테리어비 × 35%
  reserveMonths: 3,         // 초기 운영자금 = 월 고정비 × 3
  contingencyRatio: 0.05,   // 예비비 5%
  notes: [
    '임대료·공실률은 한국부동산원 상권별 통계를 행정동 단위로 적용한 관측값입니다.',
    '보증금은 월 임대료의 10개월분으로 가정했습니다. 실제 계약 조건에 따라 달라집니다.',
    '인테리어·설비·운영비 단가는 업종 표준치를 적용한 가정값이며 DB 관측값이 아닙니다.',
    '권리금은 공개 데이터가 없어 산출에서 제외했습니다.',
  ],
};

export const FIN_PRODUCTS = [
  { id: 'sbiz-start', name: '소상공인 정책자금 (창업기반지원)', org: '소상공인시장진흥공단',
    type: '정책자금', logo: '정', rate: 3.4, limitMan: 7000, months: 60, grace: 24,
    term: '5년 (2년 거치)',
    desc: '업력 3년 미만 창업 소상공인 대상 저리 정책자금. 신용점수·업종 제한 요건 확인 필요.' },
  { id: 'guarantee', name: '지역신용보증재단 보증부 대출', org: '서울신용보증재단',
    type: '보증', logo: '보', rate: 4.6, limitMan: 10000, months: 60, grace: 12,
    term: '5년 (1년 거치)',
    desc: '담보가 부족한 창업자를 위한 보증서 발급 후 은행 대출 실행. 보증료 연 0.8~1.2% 별도.' },
  { id: 'bank-credit', name: '사장님 우대 신용대출 (예시)', org: '1금융권 은행',
    type: '신용대출', logo: '신', rate: 6.2, limitMan: 5000, months: 36, grace: 0,
    term: '3년 (분할상환)',
    desc: '사업자등록 후 매출 발생 시 신속 실행. 카드매출 연동 시 한도 우대.' },
  { id: 'youth-rent', name: '청년 창업 임차보증금 이자지원', org: '서울시',
    type: '지자체 지원', logo: '서', rate: 1.5, limitMan: 10000, months: 48, grace: 0,
    term: '4년',
    desc: '만 39세 이하 청년 창업자 임차보증금 대출 이자 일부 지원. 서울 소재 사업장 한정.' },
  { id: 'card-adv', name: '카드매출 담보 운전자금', org: '여신전문사',
    type: '운전자금', logo: '운', rate: 7.5, limitMan: 3000, months: 12, grace: 0,
    term: '1년 (매출 자동상환)',
    desc: '운영 3개월 이상 후 카드매출 기반 한도 산정. 단기 운영자금 보완용.' },
];

export const industryById = id => INDUSTRIES.find(i => i.id === id) || INDUSTRIES[0];

/* 요청 조건 정규화. 잘못된 값이 스코어링에 들어가지 않게 한다.
   HTTP 라우트와 AI 에이전트 도구가 같은 규칙을 써야 하므로 여기에 둔다. */
const clampNum = (v, d, lo, hi) => {
  // Number(null)은 0이므로 빈 값을 먼저 걸러야 한다
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
};

export function normCond(b = {}) {
  return {
    industry: INDUSTRIES.some(i => i.id === b.industry) ? b.industry : 'cafe',
    goal: GOALS.some(g => g.id === b.goal) ? b.goal : 'traffic',
    mode: MODES.some(m => m.id === b.mode) ? b.mode : 'visit',
    budget: clampNum(b.budget, 15000, 500, 500000),   // 만원
    area: clampNum(b.area, 15, 1, 300),               // 평
    equity: clampNum(b.equity, 8000, 0, 500000),      // 만원
    ageBand: b.ageBand === 'young' ? 'young' : 'normal',
    gu: typeof b.gu === 'string' && b.gu ? b.gu : null,
  };
}
