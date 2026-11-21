# -*- coding: utf-8 -*-
"""
서울 부동산 컨설팅 프로젝트 - DB 구축 스크립트 (1단계)
- SQLite DB 생성
- 스키마(테이블) 생성
- 상권정보(점포-행정동) CSV 적재

실행 방법: python build_db.py
"""

import sqlite3
import pandas as pd
import os

DB_PATH = "seoul_realestate.db"
SANGWON_CSV = "sangwon/data.csv"  # 상권분석서비스(점포-행정동) CSV 경로


def create_connection():
    """DB 연결 (없으면 파일 자동 생성)"""
    conn = sqlite3.connect(DB_PATH)
    return conn


def create_tables(conn):
    """전체 스키마 생성"""
    cur = conn.cursor()

    # 1. 행정동 마스터 (모든 테이블의 기준점)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS dong_master (
        adm_cd      TEXT PRIMARY KEY,
        adm_nm      TEXT,
        sigungu_cd  TEXT,
        sigungu_nm  TEXT,
        center_lat  REAL,
        center_lng  REAL
    );
    """)

    # 2. 법정동-행정동 매핑 (실거래가 연결용, 나중에 채움)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bjd_adm_mapping (
        bjd_cd  TEXT PRIMARY KEY,
        bjd_nm  TEXT,
        adm_cd  TEXT,
        FOREIGN KEY (adm_cd) REFERENCES dong_master(adm_cd)
    );
    """)

    # 3. 유동인구 (월별, 12개월치 파일 적재 예정)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS floating_population (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        adm_cd      TEXT,
        base_ym     TEXT,
        time_slot   TEXT,
        population  INTEGER,
        FOREIGN KEY (adm_cd) REFERENCES dong_master(adm_cd)
    );
    """)

    # 4. 상권정보 (점포수 / 개폐업률 / 프랜차이즈 - 이번에 바로 적재)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS commercial_store (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        adm_cd          TEXT,
        adm_nm          TEXT,
        base_qtr        TEXT,
        industry_cd     TEXT,
        industry_nm     TEXT,
        store_cnt       INTEGER,
        similar_cnt     INTEGER,
        open_rate       REAL,
        open_cnt        INTEGER,
        close_rate      REAL,
        close_cnt       INTEGER,
        franchise_cnt   INTEGER,
        FOREIGN KEY (adm_cd) REFERENCES dong_master(adm_cd)
    );
    """)

    # 5. 거주인구 (SGIS API로 나중에 채움)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS resident_population (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        adm_cd          TEXT,
        base_year       TEXT,
        population      INTEGER,
        male_ratio      REAL,
        female_ratio    REAL,
        FOREIGN KEY (adm_cd) REFERENCES dong_master(adm_cd)
    );
    """)

    # 6. 임대료/공실률 (KOSIS API - 서울 전체 참조값, adm_cd 없음)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS rent_index (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        building_type   TEXT,
        tbl_id          TEXT,
        item_nm         TEXT,
        base_qtr        TEXT,
        value           REAL,
        unit            TEXT
    );
    """)

    # 7. 실거래가 (bjd_cd 기준)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS real_estate_transaction (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        bjd_cd          TEXT,
        building_nm     TEXT,
        deal_ym         TEXT,
        deal_amount     INTEGER,
        area            REAL,
        building_use    TEXT,
        FOREIGN KEY (bjd_cd) REFERENCES bjd_adm_mapping(bjd_cd)
    );
    """)

    conn.commit()
    print("[OK] 테이블 7개 생성 완료")


def load_dong_master_from_sangwon(conn):
    """
    상권정보 CSV 안에 행정동_코드 / 행정동_코드_명이 이미 있으므로
    여기서 행정동 마스터 목록을 먼저 뽑아 dong_master에 채운다.
    (자치구 구분은 나중에 매핑 파일로 보강 예정)
    """
    df = pd.read_csv(SANGWON_CSV, encoding="cp949")

    dong_df = df[["행정동_코드", "행정동_코드_명"]].drop_duplicates()
    dong_df = dong_df.rename(columns={"행정동_코드": "adm_cd", "행정동_코드_명": "adm_nm"})
    dong_df["adm_cd"] = dong_df["adm_cd"].astype(str)

    dong_df.to_sql("dong_master", conn, if_exists="append", index=False,
                    method="multi", chunksize=500)
    print(f"[OK] dong_master {len(dong_df)}건 적재 완료 (행정동 목록)")


def load_commercial_store(conn):
    """상권정보(점포-행정동) CSV를 commercial_store 테이블에 그대로 적재"""
    df = pd.read_csv(SANGWON_CSV, encoding="cp949")

    df = df.rename(columns={
        "기준_년분기_코드": "base_qtr",
        "행정동_코드": "adm_cd",
        "행정동_코드_명": "adm_nm",
        "서비스_업종_코드": "industry_cd",
        "서비스_업종_코드_명": "industry_nm",
        "점포_수": "store_cnt",
        "유사_업종_점포_수": "similar_cnt",
        "개업_율": "open_rate",
        "개업_점포_수": "open_cnt",
        "폐업_률": "close_rate",
        "폐업_점포_수": "close_cnt",
        "프랜차이즈_점포_수": "franchise_cnt",
    })

    df["adm_cd"] = df["adm_cd"].astype(str)
    df["base_qtr"] = df["base_qtr"].astype(str)

    cols = ["adm_cd", "adm_nm", "base_qtr", "industry_cd", "industry_nm",
            "store_cnt", "similar_cnt", "open_rate", "open_cnt",
            "close_rate", "close_cnt", "franchise_cnt"]
    df[cols].to_sql("commercial_store", conn, if_exists="append",
                     index=False, method="multi", chunksize=1000)
    print(f"[OK] commercial_store {len(df)}건 적재 완료")


def sanity_check(conn):
    """적재 확인용 샘플 쿼리"""
    print("\n--- 확인: 행정동 개수 ---")
    print(pd.read_sql("SELECT COUNT(*) AS dong_count FROM dong_master", conn))

    print("\n--- 확인: 카페(커피-음료) 업종 상위 5개 동 (점포수 기준) ---")
    q = """
    SELECT adm_nm, store_cnt, close_rate, franchise_cnt
    FROM commercial_store
    WHERE industry_nm = '커피-음료'
    ORDER BY store_cnt DESC
    LIMIT 5;
    """
    print(pd.read_sql(q, conn))


if __name__ == "__main__":
    if not os.path.exists(SANGWON_CSV):
        print(f"[ERROR] {SANGWON_CSV} 파일을 찾을 수 없습니다. 경로를 확인하세요.")
        exit(1)

    conn = create_connection()
    create_tables(conn)
    load_dong_master_from_sangwon(conn)
    load_commercial_store(conn)
    sanity_check(conn)
    conn.close()

    print(f"\n완료. DB 파일 위치: {os.path.abspath(DB_PATH)}")
