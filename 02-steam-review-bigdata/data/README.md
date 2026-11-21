## Source
- Steam Public Review API
  - Crimson Desert (App ID: 3321460)
  - Black Desert (App ID: 582660)

## Raw Schema (`collect_reviews.py` 출력)
| Column | Type | Description |
|--------|------|-------------|
| review_id | INT | Steam recommendation ID |
| language | STRING | Review language |
| voted_up | BOOLEAN | Positive(true) / Negative(false) |
| playtime_forever | INT | Total playtime (minutes) |
| timestamp_created | LONG | Review creation time (epoch seconds) |
| review | STRING | Review text |
| game_title | STRING | crimson_desert / black_desert |

## Processed Schema (`preprocess.py` 출력, HDFS Parquet)
위 컬럼에 아래 파생 컬럼이 추가되고, `timestamp_created`는 `yyyy-MM-dd HH:mm:ss` 문자열로 변환된다.

| Column | Type | Description |
|--------|------|-------------|
| region | STRING | East(koreana·schinese·tchinese·japanese) / West |
| playtime_range | STRING | 0~10h / 10~100h / 100h+ |

## 데이터 흐름 예시
한 리뷰가 단계를 거치며 어떻게 바뀌는지 보여주는 형식 예시입니다. 값은 설명용이고, 본문은 생략했습니다.

| 단계 | review_id | language | voted_up | playtime_forever | timestamp_created | review | game_title | region | playtime_range |
|---|---|---|---|---|---|---|---|---|---|
| Raw (CSV) | `2001234567` | `english` | `True` | `4521` | `1774000000` | (본문) | `crimson_desert` | – | – |
| Processed (Parquet) | `2001234567` | `english` | `true` | `4521` | `2026-03-20 09:46:40` | (본문) | `crimson_desert` | `West` | `10~100h` |

- `playtime_forever`의 단위는 **분**입니다. 4,521분은 약 75시간이라 `10~100h` 구간에 들어갑니다.
- `region`은 리뷰 언어로 정했습니다. `koreana · schinese · tchinese · japanese`이면 East, 나머지는 West입니다.

## 실제 샘플 만들기
```bash
python3 src/ingest/make_sample.py   # → data/sample/sample_raw.csv, sample_processed.csv
```
- `collect_reviews.py`와 같은 API, 같은 컬럼으로 게임별 10건만 받습니다.
- **리뷰 본문은 작성자의 저작물이라 저장하지 않고 글자 수만 남깁니다.**

## Files
- 원본 데이터(249,542건)는 용량 문제와 리뷰 본문의 저작권 때문에 저장소에서 뺐습니다. 다시 받으려면 `python3 src/ingest/collect_reviews.py data/raw`를 실행하세요.
- 저장소에는 집계된 분석 결과 CSV(`results/csv/`)만 넣었습니다. 이것만으로 `visualization.py`를 실행해 차트 7종을 다시 만들 수 있습니다.
