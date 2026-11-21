# 박도윤 포트폴리오

> **데이터로 질문에 답하고, AI로 문제를 푸는 개발자**
> 공공데이터 통합 DB와 AI 에이전트 서비스부터 빅데이터 파이프라인, 통계 분석까지 경험했습니다.
> 결과보다 <b>"이 숫자를 믿을 수 있는가"</b>를 먼저 검증하는 것을 중요하게 생각합니다.

<br>

## 한눈에 보기

| 역량 | 근거 | 바로 가기 |
|---|---|---|
| **데이터 통합 · 품질 검증** | 6개 기관 공공데이터를 26개 테이블 DB로 통합하고, 검증 중 84배 과대추정과 17,489건 중복 등 오류 6건을 찾아 수정 | [01 데이터 품질 검증](01-zaripick-ai-agent/README.md#5-데이터-품질-검증--반복-검증으로-발견조치한-문제) |
| **LLM 에이전트 설계** | 숫자는 서버가 계산하고 LLM은 이해·설명만 하는 도구 호출 구조. Gemini · GPT · Claude 폴백, Mock 테스트 | [`agent.mjs`](01-zaripick-ai-agent/server/src/agent.mjs) · [`llm.mjs`](01-zaripick-ai-agent/server/src/llm.mjs) |
| **빅데이터 파이프라인** | 리뷰 25만 건을 HDFS → Spark → Hive → MLlib로 처리, 스크립트 하나로 자동화 | [`run_pipeline.sh`](02-steam-review-bigdata/run_pipeline.sh) · [`hive_setup.hql`](02-steam-review-bigdata/src/pipeline/hive_setup.hql) |
| **통계적 해석** | 데이터 특성에 맞춰 검정 방법을 고르고, "유의함"과 "영향이 큼"을 구분해 해석 | [04 핵심 결과](04-school-health-analysis/README.md#핵심-결과) |
| **ML 실험** | 불균형 데이터 처리(SMOTEENN), 임계값 조정, 80만 건 XGBoost | [머신러닝 과제](coursework/machine-learning) |

<br>

## 프로젝트

| # | 프로젝트 | 기간 | 형태 | 핵심 기술 |
|:-:|---|:-:|:-:|---|
| 01 | [**ZARIPICK 자리픽 — 창업 입지 AI 에이전트**](01-zaripick-ai-agent)<br><sub>공공데이터 6개 기관 통합 DB + 도구 호출형 AI</sub> | 2026.07 – 08 | 팀 (2인) | Node.js · SQLite · LLM Tool-calling |
| 02 | [**펄어비스 글로벌 시장 확대 성과 분석**](02-steam-review-bigdata)<br><sub>Steam 리뷰 25만 건 빅데이터 파이프라인</sub> | 2026.05 – 06 | 개인 | Spark · Hive · HDFS · MLlib |
| 03 | [**EduTech HelpMe**](03-edutech-helpme)<br><sub>AI 기반 메타인지 학습 플랫폼 (해커톤)</sub> | 2025.11 | 팀 | React · TypeScript · Gemini · OpenAI TTS |
| 04 | [**생활습관이 학생 BMI에 미치는 영향 분석**](04-school-health-analysis)<br><sub>2023 학생건강검사 원자료 통계 분석</sub> | 2024.11 – 12 | 팀 (3인) | pandas · SciPy · statsmodels |

<br>

### 01 · ZARIPICK 자리픽 — 창업 입지 AI 에이전트
**"입지를 정한 뒤 자금을 알아보는 순서를, 자금 여력을 알고 자리를 고르는 순서로"**
- 6개 기관 공공데이터(생활인구 370만 행 등)를 지역 코드·업종 분류까지 맞춰 **26개 테이블 통합 DB**로 만들고, 서울 상권 1,030곳을 6축으로 평가했습니다.
- **도구 호출형 AI 에이전트**를 만들었습니다. LLM은 이해·계획·설명만 맡고 숫자는 모두 서버가 계산합니다. Gemini, GPT, Claude 멀티 프로바이더와 장애 시 폴백을 지원합니다.
- 반복 검증으로 **84배 과대추정, 점포 17,489건 중복** 같은 데이터 오류를 찾아 바로잡았습니다. 전국 17개 시도 · 3,563개 행정동까지 분석 범위를 넓혔습니다.

### 02 · 펄어비스 글로벌 시장 확대 성과 분석
**"붉은사막은 전작의 약점이던 서양 시장 공략에 성공했는가?"**
- 리뷰 **249,542건**을 수집하고 **HDFS → Spark 전처리 → Hive → Spark MLlib → 시각화** 파이프라인을 자동화했습니다.
- 서양권 긍정률이 <b>64.5% → 85.1%(+20.6%p)</b>로 올라, 동양권 상승폭의 3배 이상임을 확인했습니다. 플레이타임 10시간 미만 리뷰어의 긍정률은 41%에 그쳐 *초반 경험 개선*이라는 인사이트도 얻었습니다.

### 03 · EduTech HelpMe
**"안다고 생각하는 것과 실제로 아는 것의 차이를 AI로 점검한다"**
- 학습 내용을 3D 지식 그래프로 보여주고, 직접 설명하게 해서 이해도를 진단하는 서비스입니다.
- **음성 기반 메타인지 기능**(STT, GPT-4o, TTS 음성 대화), 개인화 온보딩, Gemini 연동을 맡았습니다.

### 04 · 생활습관이 학생 BMI에 미치는 영향 분석
**"아침식사를 자주 하는 학생은 BMI가 낮을까?"**
- 정규성과 등분산 검정 결과로 <b>비모수 검정(Kruskal-Wallis + Dunn)</b>을 선택하고, 6개 그룹별로 회귀분석을 했습니다.
- *통계적으로 유의(β < 0)하지만 설명력(R²)은 1% 남짓*이라는 점까지 구분해 해석했습니다. GitHub Flow(브랜치 → PR → 머지)로 협업했습니다.

<br>

## 그 밖의 활동

| 구분 | 내용 |
|---|---|
| [**Coursework**](coursework) | [**머신러닝**](coursework/machine-learning): 타이타닉 피처 실험(85.5%), 불균형 갑상선암 분류(SMOTEENN · F1 0.861), 80만 건 항공 지연 예측(XGBoost · Log-Loss 0.4376)<br>[**딥러닝**](coursework/deep-learning): MNIST → FashionMNIST → IMDB 감성분석, LSTM에서 RoBERTa 파인튜닝까지(Test Acc 94.2%)<br>[**빅데이터 프로그래밍**](coursework/bigdata-programming): 피처 선택 6종 비교(Test Acc 99.3%), 협업 필터링 8가지 조합 RMSE 비교 |
| [**NYPC Master 예선**](activities/nypc-master) | 규칙 기반 전략 게임 AI 봇: 다익스트라 사전 계산, 러시 감지 상태 기계 (2026.07 · 팀 2인) |
| [**서울시 의료 공백 분석**](activities/seoul-medical-gap) | 행정동 × 진료과 취약 지수와 클러스터링으로 의료 공백 패턴 4가지 도출 (2026.06 · 팀 3인) |

<br>

## 기술 스택

| 분야 | 기술 |
|---|---|
| **Language** | Python · JavaScript / TypeScript · SQL(HiveQL · SQLite) |
| **AI / LLM** | LLM Tool-calling Agent · Gemini · OpenAI(GPT-4o, TTS) · Claude API · PyTorch · Hugging Face(RoBERTa) |
| **Data Engineering** | Apache Spark · Apache Hive · HDFS · Parquet · 공공데이터 API 연동(SGIS · 소상공인365 · R-ONE) |
| **Data Analysis / ML** | pandas · NumPy · SciPy · statsmodels · scikit-learn · XGBoost · LightGBM · imbalanced-learn · Spark MLlib · Matplotlib · Seaborn |
| **Backend / Frontend** | Node.js · React · Vite · Three.js · Tailwind CSS · Vercel |
| **Collaboration** | Git · GitHub (Branch / PR) · Jupyter · Colab · VS Code |

<br>

## 저장소 안내
- 각 프로젝트 폴더의 `README.md`에 **배경 · 목표 · 담당 역할 · 결과 · 한계**를 정리했습니다.
- 용량이 큰 원본 데이터와 DB, API 키는 저장소에서 제외했습니다. 각 프로젝트 README에 재현 방법을 적어 두었습니다.
