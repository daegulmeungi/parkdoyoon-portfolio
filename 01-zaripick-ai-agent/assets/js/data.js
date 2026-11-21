/* ============================================================
 *  MOCK DATA : 추후 Firestore / 공공데이터 API 연동 시 교체
 *  교체 지점: window.MOCK.areas  ->  fetch('/api/areas')
 * ============================================================ */

// 업종 마스터
/* 업종: seoul_db 의 industry_mapping.ui_category 8종과 동일하게 유지한다.
 * (서버 연동 시 /api/meta 의 목록으로 교체되므로 두 곳이 어긋나면 안 된다) */
const INDUSTRIES = [
  { id: 'cafe',    name: '카페·디저트', icon: 'cafe',     avgTicket: 7500,  monthlyCost: 620,  interiorPerPy: 180 },
  { id: 'bakery',  name: '베이커리',    icon: 'bread',    avgTicket: 9800,  monthlyCost: 850,  interiorPerPy: 220 },
  { id: 'korean',  name: '한식·분식',   icon: 'bowl',     avgTicket: 11000, monthlyCost: 780,  interiorPerPy: 160 },
  { id: 'pub',     name: '주점·호프',   icon: 'beer',     avgTicket: 24000, monthlyCost: 900,  interiorPerPy: 200 },
  { id: 'beauty',  name: '미용·뷰티',   icon: 'scissors', avgTicket: 32000, monthlyCost: 560,  interiorPerPy: 240 },
  { id: 'academy', name: '학원·교육',   icon: 'book',     avgTicket: 250000, monthlyCost: 720, interiorPerPy: 120 },
  { id: 'fitness', name: '헬스·필라테스', icon: 'dumbbell', avgTicket: 120000, monthlyCost: 980, interiorPerPy: 200 },
  { id: 'conv',    name: '편의점·무인', icon: 'bag',      avgTicket: 6200,  monthlyCost: 520,  interiorPerPy: 140 },
];

// 창업 목적: 초기비용·임대료 / 주변 상권 활성도 / 안정 운영
const GOALS = [
  { id: 'cost',    name: '초기비용 절감', icon: 'wallet',  desc: '임대료·보증금·권리금 부담 최소화' },
  { id: 'traffic', name: '상권 활성도',   icon: 'trendup', desc: '유동인구·집객 시설 가중' },
  { id: 'safe',    name: '안정 운영',     icon: 'shield',  desc: '폐업률·성장성 가중' },
];

// 운영 형태: 방문/배달에 따라 수요 지표 가중치가 달라짐
const MODES = [
  { id: 'visit',    name: '방문 중심', icon: 'store',   desc: '유동인구·교통 접근성 가중' },
  { id: 'delivery', name: '배달 중심', icon: 'scooter', desc: '배후 주거·직장 인구, 임대료 가중' },
  { id: 'hybrid',   name: '혼합',      icon: 'grid',    desc: '방문·배달 수요 균형 반영' },
];

/* 서울 주요 상권 15곳. 지표는 데모용 합성 데이터 */
const AREAS = [
  {
    id: 'seongsu', name: '성수동 카페거리', gu: '성동구', station: '성수역·뚝섬역',
    foot: 78000, footGrowth: 12.4, rentPerPy: 42, deposit: 8000, premium: 6000,
    infra: 82, transit: 88, competition: 74, closeRate: 8.2, growth: 91,
    ageMix: { '20대': 34, '30대': 31, '40대': 18, '50대+': 17 },
    peak: '주말 13~19시', resident: 31000, office: 42000,
    fit: { cafe: 95, korean: 78, pub: 82, bakery: 90, beauty: 74, academy: 45, fitness: 72, conv: 66 },
    salesIdx: { cafe: 118, korean: 96, pub: 104, bakery: 112, beauty: 92, academy: 58, fitness: 88, conv: 80 },
    tags: ['MZ 성지', '팝업스토어', 'SNS 노출도 최상'],
  },
  {
    id: 'gangnam', name: '강남역 상권', gu: '강남구', station: '강남역·역삼역',
    foot: 152000, footGrowth: 3.1, rentPerPy: 78, deposit: 20000, premium: 14000,
    infra: 95, transit: 98, competition: 93, closeRate: 12.6, growth: 74,
    ageMix: { '20대': 30, '30대': 36, '40대': 21, '50대+': 13 },
    peak: '평일 18~22시', resident: 18000, office: 128000,
    fit: { cafe: 82, korean: 88, pub: 91, bakery: 76, beauty: 93, academy: 90, fitness: 89, conv: 84 },
    salesIdx: { cafe: 124, korean: 132, pub: 141, bakery: 108, beauty: 146, academy: 138, fitness: 130, conv: 118 },
    tags: ['오피스 밀집', '높은 객단가', '경쟁 치열'],
  },
  {
    id: 'mangwon', name: '망원동 골목상권', gu: '마포구', station: '망원역',
    foot: 41000, footGrowth: 9.8, rentPerPy: 26, deposit: 4000, premium: 2500,
    infra: 71, transit: 70, competition: 58, closeRate: 7.1, growth: 84,
    ageMix: { '20대': 28, '30대': 34, '40대': 22, '50대+': 16 },
    peak: '주말 12~20시', resident: 44000, office: 9000,
    fit: { cafe: 88, korean: 86, pub: 76, bakery: 87, beauty: 72, academy: 58, fitness: 66, conv: 74 },
    salesIdx: { cafe: 96, korean: 98, pub: 88, bakery: 94, beauty: 82, academy: 66, fitness: 74, conv: 84 },
    tags: ['소자본 창업', '주거+상권 혼합', '단골 형성 용이'],
  },
  {
    id: 'hongdae', name: '홍대입구 상권', gu: '마포구', station: '홍대입구역',
    foot: 134000, footGrowth: 5.6, rentPerPy: 62, deposit: 15000, premium: 11000,
    infra: 90, transit: 96, competition: 91, closeRate: 13.4, growth: 78,
    ageMix: { '20대': 48, '30대': 26, '40대': 15, '50대+': 11 },
    peak: '금·토 19~02시', resident: 26000, office: 31000,
    fit: { cafe: 86, korean: 82, pub: 96, bakery: 74, beauty: 84, academy: 62, fitness: 70, conv: 88 },
    salesIdx: { cafe: 108, korean: 104, pub: 138, bakery: 92, beauty: 112, academy: 78, fitness: 86, conv: 116 },
    tags: ['야간 상권', '외국인 관광', '20대 집중'],
  },
  {
    id: 'yeouido', name: '여의도 오피스권', gu: '영등포구', station: '여의도역·여의나루역',
    foot: 96000, footGrowth: 2.2, rentPerPy: 58, deposit: 13000, premium: 7000,
    infra: 88, transit: 90, competition: 71, closeRate: 9.1, growth: 68,
    ageMix: { '20대': 18, '30대': 33, '40대': 30, '50대+': 19 },
    peak: '평일 11~14시', resident: 12000, office: 142000,
    fit: { cafe: 90, korean: 94, pub: 78, bakery: 82, beauty: 66, academy: 52, fitness: 84, conv: 86 },
    salesIdx: { cafe: 116, korean: 128, pub: 96, bakery: 104, beauty: 84, academy: 62, fitness: 118, conv: 110 },
    tags: ['점심 특수', '주말 공동화', '법인 카드 비중 높음'],
  },
  {
    id: 'yeonnam', name: '연남동 경의선숲길', gu: '마포구', station: '홍대입구역·가좌역',
    foot: 62000, footGrowth: 10.9, rentPerPy: 38, deposit: 7000, premium: 5000,
    infra: 78, transit: 82, competition: 79, closeRate: 9.6, growth: 86,
    ageMix: { '20대': 38, '30대': 32, '40대': 17, '50대+': 13 },
    peak: '주말 13~21시', resident: 28000, office: 14000,
    fit: { cafe: 92, korean: 84, pub: 86, bakery: 88, beauty: 76, academy: 48, fitness: 64, conv: 70 },
    salesIdx: { cafe: 110, korean: 100, pub: 108, bakery: 106, beauty: 90, academy: 56, fitness: 72, conv: 82 },
    tags: ['공원 인접', '데이트 상권', '외식업 강세'],
  },
  {
    id: 'jamsil', name: '잠실·송리단길', gu: '송파구', station: '잠실역·잠실나루역',
    foot: 118000, footGrowth: 7.3, rentPerPy: 54, deposit: 12000, premium: 8000,
    infra: 92, transit: 94, competition: 82, closeRate: 8.8, growth: 82,
    ageMix: { '20대': 24, '30대': 33, '40대': 27, '50대+': 16 },
    peak: '주말 14~21시', resident: 52000, office: 46000,
    fit: { cafe: 86, korean: 88, pub: 80, bakery: 84, beauty: 86, academy: 88, fitness: 90, conv: 82 },
    salesIdx: { cafe: 106, korean: 114, pub: 102, bakery: 104, beauty: 118, academy: 126, fitness: 124, conv: 100 },
    tags: ['대형몰 집객', '가족 단위', '학군 수요'],
  },
  {
    id: 'daechi', name: '대치동 학원가', gu: '강남구', station: '대치역·한티역',
    foot: 58000, footGrowth: 1.8, rentPerPy: 66, deposit: 16000, premium: 9000,
    infra: 84, transit: 80, competition: 68, closeRate: 6.4, growth: 71,
    ageMix: { '20대': 16, '30대': 22, '40대': 38, '50대+': 24 },
    peak: '평일 17~22시', resident: 41000, office: 22000,
    fit: { cafe: 78, korean: 80, pub: 42, bakery: 82, beauty: 74, academy: 98, fitness: 76, conv: 88 },
    salesIdx: { cafe: 98, korean: 102, pub: 48, bakery: 100, beauty: 96, academy: 168, fitness: 94, conv: 112 },
    tags: ['학원 수요 독보적', '저녁 픽업 트래픽', '폐업률 최저'],
  },
  {
    id: 'gunja', name: '군자·건대입구', gu: '광진구', station: '건대입구역·군자역',
    foot: 87000, footGrowth: 6.1, rentPerPy: 36, deposit: 7000, premium: 4500,
    infra: 80, transit: 88, competition: 77, closeRate: 10.2, growth: 79,
    ageMix: { '20대': 42, '30대': 25, '40대': 19, '50대+': 14 },
    peak: '평일 18~24시', resident: 38000, office: 21000,
    fit: { cafe: 82, korean: 88, pub: 92, bakery: 74, beauty: 80, academy: 66, fitness: 82, conv: 86 },
    salesIdx: { cafe: 94, korean: 108, pub: 122, bakery: 88, beauty: 96, academy: 82, fitness: 100, conv: 104 },
    tags: ['대학가', '가성비 상권', '심야 수요'],
  },
  {
    id: 'euljiro', name: '을지로·힙지로', gu: '중구', station: '을지로3가역',
    foot: 72000, footGrowth: 8.4, rentPerPy: 33, deposit: 5500, premium: 3000,
    infra: 76, transit: 92, competition: 64, closeRate: 9.4, growth: 88,
    ageMix: { '20대': 31, '30대': 34, '40대': 22, '50대+': 13 },
    peak: '평일 18~23시', resident: 9000, office: 96000,
    fit: { cafe: 84, korean: 86, pub: 94, bakery: 70, beauty: 60, academy: 44, fitness: 62, conv: 76 },
    salesIdx: { cafe: 100, korean: 110, pub: 126, bakery: 84, beauty: 74, academy: 52, fitness: 70, conv: 92 },
    tags: ['레트로 트렌드', '직장인 회식', '저렴한 권리금'],
  },
  {
    id: 'sinchon', name: '신촌·이대', gu: '서대문구', station: '신촌역·이대역',
    foot: 92000, footGrowth: -1.2, rentPerPy: 44, deposit: 9000, premium: 5500,
    infra: 84, transit: 92, competition: 86, closeRate: 13.9, growth: 58,
    ageMix: { '20대': 52, '30대': 20, '40대': 16, '50대+': 12 },
    peak: '평일 12~20시', resident: 24000, office: 18000,
    fit: { cafe: 80, korean: 84, pub: 88, bakery: 72, beauty: 82, academy: 70, fitness: 68, conv: 84 },
    salesIdx: { cafe: 90, korean: 94, pub: 104, bakery: 82, beauty: 94, academy: 88, fitness: 76, conv: 98 },
    tags: ['대학 상권', '방학기 변동 큼', '임대료 조정 국면'],
  },
  {
    id: 'mokdong', name: '목동 학원·주거', gu: '양천구', station: '목동역·오목교역',
    foot: 54000, footGrowth: 2.9, rentPerPy: 39, deposit: 8000, premium: 4000,
    infra: 82, transit: 74, competition: 61, closeRate: 6.9, growth: 72,
    ageMix: { '20대': 17, '30대': 24, '40대': 36, '50대+': 23 },
    peak: '평일 16~21시', resident: 68000, office: 16000,
    fit: { cafe: 80, korean: 84, pub: 54, bakery: 86, beauty: 84, academy: 94, fitness: 88, conv: 82 },
    salesIdx: { cafe: 92, korean: 98, pub: 58, bakery: 100, beauty: 106, academy: 142, fitness: 112, conv: 96 },
    tags: ['안정적 주거 배후', '학군 프리미엄', '단가 방어력'],
  },
  {
    id: 'nowon', name: '노원역 상권', gu: '노원구', station: '노원역·중계역',
    foot: 76000, footGrowth: 3.4, rentPerPy: 28, deposit: 5000, premium: 3000,
    infra: 78, transit: 84, competition: 66, closeRate: 8.6, growth: 70,
    ageMix: { '20대': 26, '30대': 25, '40대': 27, '50대+': 22 },
    peak: '평일 17~22시', resident: 82000, office: 12000,
    fit: { cafe: 76, korean: 86, pub: 80, bakery: 80, beauty: 82, academy: 90, fitness: 84, conv: 86 },
    salesIdx: { cafe: 84, korean: 96, pub: 92, bakery: 88, beauty: 94, academy: 118, fitness: 98, conv: 100 },
    tags: ['배후 세대 최다', '저렴한 임대료', '생활밀착 업종 유리'],
  },
  {
    id: 'gangseo', name: '마곡나루 신도심', gu: '강서구', station: '마곡나루역·마곡역',
    foot: 64000, footGrowth: 15.7, rentPerPy: 46, deposit: 9000, premium: 2000,
    infra: 74, transit: 82, competition: 48, closeRate: 6.1, growth: 95,
    ageMix: { '20대': 22, '30대': 41, '40대': 24, '50대+': 13 },
    peak: '평일 11~14시', resident: 34000, office: 88000,
    fit: { cafe: 88, korean: 90, pub: 74, bakery: 80, beauty: 78, academy: 72, fitness: 86, conv: 84 },
    salesIdx: { cafe: 104, korean: 112, pub: 88, bakery: 94, beauty: 92, academy: 88, fitness: 110, conv: 98 },
    tags: ['신규 배후수요 급증', '경쟁 밀도 낮음', '기업 이전 효과'],
  },
  {
    id: 'ikseon', name: '익선동·종로3가', gu: '종로구', station: '종로3가역',
    foot: 68000, footGrowth: 6.8, rentPerPy: 40, deposit: 7500, premium: 6500,
    infra: 80, transit: 94, competition: 81, closeRate: 10.8, growth: 76,
    ageMix: { '20대': 33, '30대': 30, '40대': 20, '50대+': 17 },
    peak: '주말 13~21시', resident: 11000, office: 54000,
    fit: { cafe: 90, korean: 88, pub: 86, bakery: 78, beauty: 62, academy: 40, fitness: 54, conv: 68 },
    salesIdx: { cafe: 108, korean: 112, pub: 110, bakery: 90, beauty: 76, academy: 48, fitness: 62, conv: 80 },
    tags: ['관광 수요', '한옥 콘셉트', '주말 집중형'],
  },
];

/* 금융상품 목업: 실제 상품 조건과 다를 수 있는 데모용 데이터 */
const FIN_PRODUCTS = [
  {
    id: 'sbiz-start', name: '소상공인 정책자금 (창업기반지원)', org: '소상공인시장진흥공단',
    type: '정책자금', logo: '정', rate: [3.0, 3.9], limitMan: 7000, term: '5년 (2년 거치)',
    desc: '업력 3년 미만 창업 소상공인 대상 저리 정책자금. 신용점수·업종 제한 요건 확인 필요.',
    fitFor: ['startup', 'lowRate'], score: 96,
  },
  {
    id: 'guarantee', name: '지역신용보증재단 보증부 대출', org: '서울신용보증재단',
    type: '보증', logo: '보', rate: [4.1, 5.2], limitMan: 10000, term: '5년 (1년 거치)',
    desc: '담보가 부족한 창업자를 위한 보증서 발급 후 은행 대출 실행. 보증료 연 0.8~1.2% 별도.',
    fitFor: ['noCollateral', 'startup'], score: 92,
  },
  {
    id: 'kb-sajang', name: '사장님 우대 신용대출 (예시)', org: '1금융권 은행',
    type: '신용대출', logo: '신', rate: [5.4, 7.8], limitMan: 5000, term: '3년 (일시상환/분할)',
    desc: '사업자등록 후 매출 발생 시 신속 실행. 카드매출 연동 시 한도 우대.',
    fitFor: ['fast'], score: 78,
  },
  {
    id: 'rent-support', name: '청년 창업 임차보증금 이자지원', org: '서울시',
    type: '지자체 지원', logo: '서', rate: [1.0, 2.0], limitMan: 10000, term: '4년',
    desc: '만 39세 이하 청년 창업자 임차보증금 대출 이자 일부 지원. 서울 소재 사업장 한정.',
    fitFor: ['young', 'deposit'], score: 88,
  },
  {
    id: 'card-adv', name: '카드매출 담보 운전자금', org: '여신전문사',
    type: '운전자금', logo: '운', rate: [6.8, 9.5], limitMan: 3000, term: '1년 (매출 자동상환)',
    desc: '운영 3개월 이상 후 카드매출 기반 한도 산정. 단기 운영자금 보완용.',
    fitFor: ['working'], score: 64,
  },
];

window.MOCK = { INDUSTRIES, GOALS, MODES, AREAS, FIN_PRODUCTS };
