# Coursework — 수업 과제

전공 수업 과제 중 **머신러닝·딥러닝 실습** 코드를 모았습니다.
각 과제는 단순 구현에서 그치지 않고 *왜 성능이 이렇게 나오는지*를 실험으로 확인하고 개선하는 데 초점을 두었습니다.

## 머신러닝 (scikit-learn · XGBoost)

예측 대회 형식의 과제 3개입니다. 자세한 실험 과정은 [machine-learning/README.md](machine-learning)에 정리했습니다.

| 과제 | 주제 | 주요 내용 | 결과 |
|:-:|---|---|---|
| [HW1](machine-learning/hw1) | 타이타닉 생존 예측 | 로지스틱 회귀 하나로 피처를 바꿔 가며 5단계 실험을 했습니다. 결측치는 train 통계로만 채웠습니다. **이름의 호칭 추출**이 가장 효과적이었습니다 | Val Acc **85.5%** |
| [HW2](machine-learning/hw2) | 갑상선암 분류 (양성 12%) | 각 fold 안에서만 SMOTEENN을 적용하고 6개 모델을 비교했습니다. 트리 중요도로 피처를 선택하고, PR 곡선으로 임계값을 조정했습니다 | Weighted F1 **0.861** |
| [HW3](machine-learning/hw3) | 항공편 지연 확률 예측 (80만 건) | 같은 노선의 평균 비행 시간으로 결측 시각을 복원했습니다. RF·XGBoost·LightGBM을 비교하고, XGBoost를 조기 종료로 학습했습니다 | Log-Loss **0.4376** |

## 딥러닝 (PyTorch · Colab GPU)

| 과제 | 주제 | 주요 내용 | 결과 |
|:-:|---|---|---|
| [HW1](deep-learning/hw1) | MNIST 로지스틱 회귀 | PyTorch로 다중 분류를 구현했습니다. 표준화와 *CrossEntropyLoss 내부 softmax 중복* 제거로 정확도를 개선했습니다 | Test Acc **91.9%** |
| [HW2](deep-learning/hw2) | Perceptron · Logistic · MLP | 선형 분리 가능 데이터와 XOR 데이터에서 세 모델의 결정 경계를 비교했습니다. *"sigmoid를 쓰는데 왜 선형 분류기인가"*도 분석했습니다 | 선형 데이터 98.3% / XOR에서 선형 모델 50%의 한계 확인 |
| [HW3](deep-learning/hw3) | FashionMNIST MLP 최적화 | Mini-batch SGD, 정규화, optimizer 6종 비교, Dropout, BatchNorm의 효과를 실험으로 비교했습니다 | Val Acc **≈ 90.5%** |
| [HW4](deep-learning/hw4) | IMDB 감성 분류 | LSTM, GloVe 임베딩, Transformer를 거쳐 **사전학습 RoBERTa 파인튜닝**까지 진행했고, 추론 스크립트(`test.py`)를 분리했습니다 | Test Acc **94.21%** |

**HW4 개선 과정**
1. 기본 LSTM(≈72%)에 GloVe 임베딩을 적용했습니다.
2. BiLSTM과 Max Pooling을 시도했는데 과적합이 생겨, hidden 차원과 구조를 조정해 87% 목표를 맞췄습니다.
3. Transformer를 구현하면서 `num_heads` 차원 오류와 `pad_idx` 버그로 학습이 멈추는 문제를 디버깅했습니다. 과적합은 weight decay로 제어했습니다.
4. BERT는 Test Acc 92.8%에서 더 오르지 않아 RoBERTa로 바꿔 파인튜닝했고, <b>Test Acc 94.2%</b>까지 올렸습니다.

같은 시드에서도 GPU 연산이 비결정적이라 결과가 조금씩 달라진다는 점도 PyTorch 공식 문서로 원인을 확인했습니다.

## 빅데이터 프로그래밍 (scikit-learn)

| 과제 | 주제 | 주요 내용 | 결과 |
|:-:|---|---|---|
| [Assignment 1](bigdata-programming/assn01) | 피처 선택 비교 | Mobile Price 데이터로 Variance Threshold, SelectKBest, RFE, SelectFromModel(L1·Tree), 상관계수 등 6가지 방법을 비교하고 로지스틱 회귀 하이퍼파라미터를 튜닝했습니다 | 상관계수 상위 10개 피처 → Test Acc **99.3%** |
| [Assignment 2](bigdata-programming/assn02) | 협업 필터링 추천 | Cosine/Pearson 유사도 × Simple/Weighted 평균 × User/Item 기반, 8가지 조합의 평점 예측 RMSE를 비교했습니다 | RMSE ≈ 0.93 수준 비교 |

## 실행
- 딥러닝과 빅데이터 노트북은 Google Colab에서, 머신러닝 노트북은 로컬 Jupyter에서 실행했습니다. 딥러닝의 `.py`는 Colab에서 내보낸 같은 코드입니다.
- 데이터셋은 저장소에 넣지 않았습니다.
  - 딥러닝: 코드가 공개 데이터셋(FashionMNIST, IMDB)을 실행할 때 자동으로 내려받습니다.
  - 머신러닝: 수업에서 배포한 데이터라 재배포하지 않았습니다.
  - 빅데이터: MovieLens와 Mobile Price 데이터는 각 출처에서 받으면 됩니다.
- 노트북에는 실행 결과가 남아 있어서, 데이터 없이도 결과를 확인할 수 있습니다.
- HW4 추론: `python test.py [data_dir] my_model` (학습한 가중치 `./my_model` 필요, 용량 문제로 미포함)
