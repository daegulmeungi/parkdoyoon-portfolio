# seoul_db.db 데이터 구조 문서

서울 상권 입지 분석 DB, 총 26개 테이블(SQLite 내부 테이블 제외)과 뷰 1개.

- 1~5절: 초기 구축 단계의 기준·인구·점포·부동산·교통 테이블 13개 (`data-pipeline/build_db.py`가 1단계 스키마를 만듭니다)
- 6절: 이후 상권 단위 분석으로 바꾸면서 추가한 상권·파생·매핑 테이블 13개

---

## 1. 지역 기준 테이블

### `dong_master` — 행정동 마스터 (425행)
서울시 전체 행정동의 코드, 명칭, 중심좌표.
| 컬럼 | 설명 |
|---|---|
| adm_cd | 행정동코드 (8자리) — 다른 테이블들의 공통 조인 키 |
| adm_nm | 행정동명 (예: 청운효자동) |
| sigungu_cd / sigungu_nm | 자치구 코드/명 |
| center_lat / center_lng | 행정동 중심 좌표 |

### `bjd_adm_mapping` — 법정동↔행정동 매핑 (746행)
법정동명으로 실거래가 데이터를 행정동에 연결할 때 사용.
| 컬럼 | 설명 |
|---|---|
| bjd_cd / bjd_nm | 법정동코드/명 |
| adm_cd | 대응되는 행정동코드 |

### `district_dong_crosswalk` — 상권명↔자치구 매핑 (72행)
한국부동산원(R-ONE) 임대료 통계의 상권명(예: 광화문, 압구정, 홍대/합정)을 자치구로 연결.
| 컬럼 | 설명 |
|---|---|
| district_nm | 상권명 |
| gu_guess | 매핑된 자치구명 |
| confidence | 매핑 근거 표시값 |

---

## 2. 인구 데이터

### `floating_population` — 유동인구 (3,693,812행)
행정동 × 날짜 × 시간대별 총생활인구수. 2025년 7월~2026년 6월, 12개월치.
| 컬럼 | 설명 |
|---|---|
| adm_cd | 행정동코드 |
| base_ymd | 기준일자 (예: 20250701) |
| time_slot | 시간대 (00~23시) |
| population | 해당 행정동·날짜·시간대의 총생활인구수 |

### `resident_population` — 거주인구 (423행)
행정동별 등록 거주인구.
| 컬럼 | 설명 |
|---|---|
| adm_cd | 행정동코드 |
| base_year | 기준년도 |
| population | 거주인구수 |
| male_ratio / female_ratio | 성비 (현재 데이터 없음) |

---

## 3. 상권·업종 데이터

### `commercial_store` — 업종별 점포 통계 (141,218행)
행정동 × 업종 × 분기별 집계. 서울열린데이터광장 상권분석서비스 기반.
| 컬럼 | 설명 |
|---|---|
| adm_cd / adm_nm | 행정동코드/명 |
| base_qtr | 기준분기 |
| industry_cd / industry_nm | 서비스업종 코드/명 (예: 커피-음료, 한식음식점) |
| store_cnt | 점포수 |
| similar_cnt | 유사업종 점포수 |
| open_rate / open_cnt | 개업률/개업점포수 |
| close_rate / close_cnt | 폐업률/폐업점포수 |
| franchise_cnt | 프랜차이즈 점포수 |

### `store_poi` — 개별 점포 위치정보 (537,489행)
소상공인시장진흥공단 상가업소 데이터. 2026년 3월 기준 서울시 전체 등록 점포 하나하나의 위치.
| 컬럼 | 설명 |
|---|---|
| store_id | 상가업소번호 |
| gu | 시군구명 |
| adm_cd / adm_nm | 행정동코드/명 |
| cat_large / cat_mid / cat_small | 업종 대/중/소분류 (예: 음식 > 비알코올 > 카페) |
| lon / lat | 좌표 — 반경 기반 경쟁밀도 계산용 |

---

## 4. 부동산 가격 데이터

### `rent_index` — 서울 전체 임대동향 지수 (48행)
지역 구분 없는 서울 전체 단일 시계열. 소규모/중대형 상가 기준.
| 컬럼 | 설명 |
|---|---|
| building_type | 소규모/중대형 |
| item_nm | 임대가격지수/공실률/임대료/임대수입 등 |
| base_qtr | 기준분기 |
| value / unit | 값과 단위 |

### `rent_vacancy_district` — 상권별 임대료·공실률 (3,456행)
한국부동산원 상권별 임대료·공실률 원본. 소규모/중대형/집합/오피스 4개 건물유형, 서울 전체~권역~개별상권 3단계 지역 계층.
| 컬럼 | 설명 |
|---|---|
| shop_type | 소규모/중대형/집합/오피스 |
| item_nm | 임대료/공실률 |
| region_large / region_mid / district_nm | 서울 / 권역(도심·강남·영등포신촌·기타) / 상권명 |
| level | citywide(서울전체) / region(권역) / point(개별상권) |
| quarter | 기준분기 (예: 2024Q3) |
| value / unit | 값과 단위 (천원/㎡ 또는 %) |

### `dong_rent_vacancy_applied` — 행정동별 적용 임대료·공실률 (27,072행)
`rent_vacancy_district`를 `district_dong_crosswalk`로 행정동 단위까지 내려서 채운 최종 테이블. 상권 데이터가 없는 행정동은 자치구 평균 또는 서울 전체값으로 대체.
| 컬럼 | 설명 |
|---|---|
| adm_cd / gu | 행정동코드 / 자치구명 |
| shop_type | 소규모/중대형/집합/오피스 |
| item_nm | 임대료/공실률 |
| quarter | 기준분기 |
| value | 적용된 값 |
| match_type | 값의 출처 (자치구평균 / 서울전체대체) |

### `real_estate_transaction` — 상업업무용 매매 실거래 (12,445행)
국토교통부 실거래가 공개시스템 기준, 개별 거래 건. 2025년 8월~2026년 7월, 12개월 롤링.
| 컬럼 | 설명 |
|---|---|
| sigungu / dong | 자치구/법정동명 |
| building_type | 집합/일반 |
| jibun / road_nm | 지번/도로명 |
| use_zone / building_use | 용도지역/건축물주용도 |
| area_exclusive / area_land | 전용면적/대지면적(㎡) |
| deal_amount | 거래금액(만원) |
| floor | 층 |
| deal_ym / deal_day | 계약년월/계약일 |
| build_year | 건축년도 |
| deal_type | 직거래/중개거래 |
| adm_cd | 매칭된 행정동코드 |
| match_type | 행정동 매칭 방식 |

---

## 5. 교통 데이터

### `subway_station` — 지하철역 (403행)
서울 소재 지하철역 전체. 국가철도공단 전국도시철도역사정보 기준.
| 컬럼 | 설명 |
|---|---|
| stn_id / stn_nm | 역번호/역사명 |
| line_nm | 노선명 |
| transfer_type / transfer_line_nm | 환승역 여부/환승노선명 |
| lat / lon | 좌표 |
| operator | 운영기관명 |
| addr | 역사 도로명주소 |

### `bus_stop` — 버스정류장 (11,240행)
서울시 버스정류소 위치정보. 일반차로/중앙차로/마을버스 등 유형별 구분.
| 컬럼 | 설명 |
|---|---|
| node_id / ars_id | 정류장ID/정류장번호 |
| stop_nm | 정류소명 |
| lon / lat | 좌표 |
| stop_type | 일반차로/중앙차로/마을버스/가로변시간/가로변전일 |

---

## 6. 상권 단위 · 파생 · 매핑 테이블

서울시가 정의한 상권(`trdar_cd`)을 분석 단위로 쓰면서 추가한 테이블입니다.

| 테이블 | 행 수 | 내용 | 주요 컬럼 |
|---|--:|---|---|
| `trade_area_master` | 1,650 | 상권 영역 마스터 | trdar_cd, trdar_nm, trdar_se, gu_nm, adm_cd, center_lon/lat, area_m2 |
| `trade_area_sales` | 147,035 | 상권 × 업종 분기별 추정매출 | quarter, trdar_cd, industry_cd, monthly_sales_amt, weekday/weekend_sales_amt |
| `trade_area_floating_population` | 34,633 | 상권별 분기 유동인구 (성별 · 연령 · 시간대) | quarter, trdar_cd, total_pop, age10~age60_up, t00_06 … |
| `trade_area_worker_population` | 34,386 | 상권별 직장인구 | quarter, trdar_cd, total_worker, age10~age60_up |
| `trade_area_change_indicator` | 34,650 | 상권변화지표 (평균 영업 · 폐업 개월) | quarter, trdar_cd, change_cd, avg_operate_months, avg_close_months |
| `trade_area_store_match` | 445,748 | 점포 POI ↔ 상권 정제 매칭 (폴리곤 중첩 중복 제거) | poi_id, trdar_cd, cat_large/mid/small |
| `trade_area_subway_match` | 279 | 지하철역 ↔ 상권 매칭 | stn_id, trdar_cd, transfer_type |
| `trade_area_bus_match` | 5,472 | 버스정류장 ↔ 상권 매칭 | bus_id, trdar_cd |
| `dong_change_indicator` | 8,925 | 행정동 상권변화지표 | quarter, adm_cd, change_cd, avg_operate_months |
| `dong_deposit_estimated` | 13,536 | 행정동별 추정 보증금 (임대료 ÷ 전환율) | adm_cd, shop_type, rent_value, conversion_rate, est_deposit_per_pyeong |
| `conversion_rate_district` | 8,098 | 지역별 전환율 (R-ONE) | shop_type, region1, region2, quarter, value |
| `industry_mapping` | 48 | 원천 업종 코드 → UI 업종 8종 매핑 | ui_category, source_type, code, name |
| `quarter_days` | 32 | 분기별 일수 (일평균 환산용) | quarter_std, days_in_quarter |

뷰 `v_trade_area_floating_daily`: 상권 유동인구를 일평균으로 환산한 뷰입니다.

---

## 테이블 간 연결 구조

```
dong_master (adm_cd 기준)
  ├─ floating_population
  ├─ resident_population
  ├─ commercial_store
  ├─ store_poi
  ├─ dong_rent_vacancy_applied
  └─ real_estate_transaction

bjd_adm_mapping — 법정동명 기반으로 real_estate_transaction의 행정동 매칭에 사용
district_dong_crosswalk — rent_vacancy_district를 dong_rent_vacancy_applied로 변환할 때 사용

store_poi / subway_station / bus_stop — 좌표(lat/lon) 기반 반경 검색용,
  adm_cd로도 조인 가능하지만 주 용도는 특정 지점 주변 밀집도 계산

trade_area_master (trdar_cd 기준)
  ├─ trade_area_sales · trade_area_floating_population · trade_area_worker_population
  ├─ trade_area_change_indicator
  └─ trade_area_store_match · trade_area_subway_match · trade_area_bus_match
       (store_poi · subway_station · bus_stop을 상권에 연결)
```
