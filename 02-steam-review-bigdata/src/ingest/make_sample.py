"""
[샘플] 원본 데이터의 형태를 보여주기 위한 소량 샘플 생성

사용법: python3 src/ingest/make_sample.py [저장 폴더]   (기본값: data/sample)
  - collect_reviews.py와 같은 API · 같은 컬럼으로 게임별 10건(영어 6 · 한국어 2 · 중국어 2)을 받는다.
  - 리뷰 본문은 작성자의 저작물이므로 저장하지 않고 글자 수만 남긴다.
  - sample_raw.csv(수집 직후)와 sample_processed.csv(preprocess.py 규칙 적용 후)를 만든다.
"""
import csv, json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join("data", "sample")
GAMES = {"crimson_desert": 3321460, "black_desert": 582660}
EAST = {"koreana", "schinese", "tchinese", "japanese"}
PER_GAME = 10

def fetch(app_id, language):
    q = urllib.parse.urlencode({"json": 1, "num_per_page": 100, "language": language,
                                "cursor": "*", "review_type": "all", "purchase_type": "all"})
    req = urllib.request.Request(f"https://store.steampowered.com/appreviews/{app_id}?{q}",
                                 headers={"User-Agent": "review-sample-script"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["reviews"]

rows = []
for game, app in GAMES.items():
    # 동/서양이 모두 보이도록 언어별로 나눠서 받는다 (영어 6 + 동양권 언어 4)
    picked = []
    for lang, n in [("english", 6), ("koreana", 2), ("schinese", 2)]:
        rs = fetch(app, lang)
        time.sleep(0.5)
        # 플레이타임 구간이 고르게 보이도록 정렬 후 고르게 추출
        rs.sort(key=lambda r: r["author"]["playtime_forever"])
        step = max(1, len(rs) // n)
        picked += rs[::step][:n]
    for r in picked[:PER_GAME]:
        rows.append({
            "review_id": r["recommendationid"],
            "language": r["language"],
            "voted_up": r["voted_up"],
            "playtime_forever": r["author"]["playtime_forever"],
            "timestamp_created": r["timestamp_created"],
            "review": f"(본문 생략 · {len(r['review'])}자)",
            "game_title": game,
        })

os.makedirs(OUT, exist_ok=True)
raw_cols = ["review_id", "language", "voted_up", "playtime_forever", "timestamp_created", "review", "game_title"]
with open(os.path.join(OUT, "sample_raw.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, raw_cols); w.writeheader(); w.writerows(rows)

def prange(m):
    return "0~10h" if m < 600 else ("10~100h" if m < 6000 else "100h+")

with open(os.path.join(OUT, "sample_processed.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, raw_cols + ["region", "playtime_range"]); w.writeheader()
    for r in rows:
        p = dict(r)
        # Spark from_unixtime은 세션 타임존 기준 — 샘플은 UTC로 표기
        p["timestamp_created"] = datetime.fromtimestamp(int(r["timestamp_created"]), timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        p["voted_up"] = str(r["voted_up"]).lower()
        p["region"] = "East" if r["language"] in EAST else "West"
        p["playtime_range"] = prange(int(r["playtime_forever"]))
        w.writerow(p)
print(len(rows), "rows; max review_id =", max(int(r["review_id"]) for r in rows))
