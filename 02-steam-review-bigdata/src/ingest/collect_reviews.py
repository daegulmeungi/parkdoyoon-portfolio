"""
[수집] Steam 공개 리뷰 API → CSV

사용법: python3 src/ingest/collect_reviews.py [저장 폴더]   (기본값: 현재 폴더)
  - cursor 기반 페이지네이션으로 게임별 목표 건수까지 수집
  - 일시적 오류(비정상 응답·네트워크 오류)는 대기 후 재시도, 연속 실패 시 해당 게임 수집 중단
"""
import csv
import os
import sys
import time

import requests

GAMES = {
    "crimson_desert": (3321460, 200000),  # (Steam App ID, 수집 목표 건수)
    "black_desert": (582660, 50000),
}
API_URL = "https://store.steampowered.com/appreviews/{app_id}"
PAGE_SIZE = 100
REQUEST_INTERVAL = 0.5   # 정상 요청 간 대기(초)
MAX_RETRIES = 10         # 연속 실패 허용 횟수
TIMEOUT = 30             # 요청 타임아웃(초)

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(OUT_DIR, exist_ok=True)


def fetch_page(app_id, cursor):
    """리뷰 한 페이지를 가져온다. 실패하면 지수적으로 대기하며 재시도한다."""
    params = {
        "json": 1,
        "num_per_page": PAGE_SIZE,
        "language": "all",
        "cursor": cursor,
        "review_type": "all",
        "purchase_type": "all",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(API_URL.format(app_id=app_id), params=params, timeout=TIMEOUT)
            if response.status_code == 200 and response.text.strip():
                return response.json()
            reason = f"HTTP {response.status_code}"
        except (requests.RequestException, ValueError) as e:
            reason = type(e).__name__
        wait = min(2 ** attempt, 60)
        print(f"  재시도 {attempt}/{MAX_RETRIES} ({reason}) - {wait}s 대기")
        time.sleep(wait)
    return None


for game_title, (app_id, limit) in GAMES.items():
    cursor = "*"
    total = 0
    filename = os.path.join(OUT_DIR, f"{game_title}_reviews.csv")

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["review_id", "language", "voted_up", "playtime_forever",
                         "timestamp_created", "review", "game_title"])
        while total < limit:
            data = fetch_page(app_id, cursor)
            if data is None:
                print(f"[{game_title}] 연속 실패로 수집 중단 (현재 {total}건)")
                break
            reviews = data.get("reviews", [])
            if not reviews:
                break
            for r in reviews:
                writer.writerow([
                    r["recommendationid"],
                    r["language"],
                    r["voted_up"],
                    r["author"]["playtime_forever"],
                    r["timestamp_created"],
                    r["review"].replace("\n", " "),
                    game_title,
                ])
            total += len(reviews)
            next_cursor = data.get("cursor")
            if not next_cursor or next_cursor == cursor:  # 마지막 페이지
                break
            cursor = next_cursor
            if total % 10000 < PAGE_SIZE:
                print(f"[{game_title}] {total:,}건 수집 중...")
            time.sleep(REQUEST_INTERVAL)

    print(f"[{game_title}] 완료! 총 {total:,}건 → {filename}")
