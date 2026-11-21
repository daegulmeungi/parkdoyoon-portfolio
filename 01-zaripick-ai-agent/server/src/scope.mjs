/* ============================================================
 *  서비스 지역 범위
 *
 *  지역마다 확보한 데이터가 달라 제공 수준이 다르다. 이를 숨기지 않고
 *  '분석 등급'으로 드러낸다. 화면·API·에이전트가 모두 이 정의를 따른다.
 *
 *    A등급(정밀)  서울 — 상권 1,030곳 단위. 유동인구·임대료·폐업률까지 있어
 *                 6축 적합도 점수와 자금 계획을 산출한다.
 *    B등급(기본)  전국 — 시군구·행정동 단위. 인구·점포·매출·개폐업률을 제공한다.
 *                 임대료가 없어 적합도 점수와 자금 계획은 내지 않는다.
 *
 *  전국을 연 근거
 *    SGIS(인구·사업체)·LOCALDATA(개폐업)·소상공인365(매출·유동인구)가 모두
 *    전국을 덮는다. 광역시로 묶어 둘 이유가 사라졌다.
 *    여전히 없는 것은 임대료 하나이며, 그래서 등급은 그대로 둘로 유지한다.
 *    전국을 A등급처럼 보이게 만들지 않는다 — 부족한 축은 계속 명시한다.
 * ============================================================ */

export const TIERS = {
  full: {
    id: 'full',
    label: '정밀 분석',
    unit: '상권',
    desc: '유동인구·임대료·폐업률까지 반영해 6축 적합도 점수와 자금 계획을 제공합니다.',
    features: ['적합도 점수', '상권 순위', '초기비용 산출', '자금 조달 설계', 'PDF 리포트'],
  },
  basic: {
    id: 'basic',
    label: '기본 통계',
    unit: '시군구·행정동',
    desc: '인구·업종별 점포 수·점포당 월매출·유동인구·개폐업률을 제공합니다. '
        + '임대료 데이터가 없어 적합도 점수와 자금 계획은 산출하지 않습니다.',
    features: ['인구·연령 구성', '업종별 점포 수', '점포당 월매출', '유동인구·소득·소비', '개업률·폐업률'],
    missing: ['임대료·공실률', '적합도 점수', '자금 계획'],
  },
};

/** 지원 시도. code 는 SGIS 행정구역코드다 (/api/region 이 이 체계를 쓴다). */
export const SIDO = [
  { code: '11', name: '서울특별시',     short: '서울', tier: 'full'  },
  { code: '21', name: '부산광역시',     short: '부산', tier: 'basic' },
  { code: '22', name: '대구광역시',     short: '대구', tier: 'basic' },
  { code: '23', name: '인천광역시',     short: '인천', tier: 'basic' },
  { code: '24', name: '광주광역시',     short: '광주', tier: 'basic' },
  { code: '25', name: '대전광역시',     short: '대전', tier: 'basic' },
  { code: '26', name: '울산광역시',     short: '울산', tier: 'basic' },
  { code: '29', name: '세종특별자치시', short: '세종', tier: 'basic' },
  { code: '31', name: '경기도',         short: '경기', tier: 'basic' },
  { code: '32', name: '강원특별자치도', short: '강원', tier: 'basic' },
  { code: '33', name: '충청북도',       short: '충북', tier: 'basic' },
  { code: '34', name: '충청남도',       short: '충남', tier: 'basic' },
  { code: '35', name: '전북특별자치도', short: '전북', tier: 'basic' },
  { code: '36', name: '전라남도',       short: '전남', tier: 'basic' },
  { code: '37', name: '경상북도',       short: '경북', tier: 'basic' },
  { code: '38', name: '경상남도',       short: '경남', tier: 'basic' },
  { code: '39', name: '제주특별자치도', short: '제주', tier: 'basic' },
];

export const sidoByCode = cd => SIDO.find(s => s.code === String(cd)) || null;
export const isFullTier = cd => sidoByCode(cd)?.tier === 'full';

/** 시도 코드 기본값 (서울) */
export const DEFAULT_SIDO = '11';
