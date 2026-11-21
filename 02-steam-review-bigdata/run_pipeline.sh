#!/bin/bash
# =============================================================================
#  Steam 리뷰 빅데이터 파이프라인 전체 실행
#  수집(로컬) → HDFS 적재 → Spark 전처리(Parquet) → Hive 집계 → Spark 분석·MLlib
#  → 결과 다운로드 → 시각화(로컬)
#
#  접속 정보는 환경 변수로 덮어쓸 수 있다.
#    SANDBOX_USER=maria_dev SANDBOX_HOST=localhost SANDBOX_PORT=2222 ./run_pipeline.sh
# =============================================================================
set -euo pipefail

SANDBOX_USER="${SANDBOX_USER:-maria_dev}"
SANDBOX_HOST="${SANDBOX_HOST:-localhost}"
SANDBOX_PORT="${SANDBOX_PORT:-2222}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAW_DIR="$ROOT_DIR/data/raw"           # 수집한 원본 CSV (git 미포함)
OUTPUT_DIR="$ROOT_DIR/results/output"  # 클러스터에서 내려받은 분석 결과 (git 미포함)
HDFS_BASE="/user/${SANDBOX_USER}"
REMOTE_DIR="~/steam_pipeline"

SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -p $SANDBOX_PORT $SANDBOX_USER@$SANDBOX_HOST"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no -P $SANDBOX_PORT"
REMOTE="$SANDBOX_USER@$SANDBOX_HOST"

echo "[1/7] 데이터 수집 (Steam API)..."
python3 "$ROOT_DIR/src/ingest/collect_reviews.py" "$RAW_DIR"

echo "[2/7] 원본 CSV · 분석 스크립트 업로드 → HDFS 적재..."
$SSH_CMD "mkdir -p $REMOTE_DIR"
$SCP_CMD "$RAW_DIR"/*_reviews.csv \
         "$ROOT_DIR/src/pipeline/preprocess.py" \
         "$ROOT_DIR/src/pipeline/hive_setup.hql" \
         "$ROOT_DIR/src/pipeline/spark_analysis.py" \
         "$REMOTE:$REMOTE_DIR/"
$SSH_CMD "hdfs dfs -mkdir -p $HDFS_BASE/steam/raw $HDFS_BASE/results \
       && hdfs dfs -put -f $REMOTE_DIR/*_reviews.csv $HDFS_BASE/steam/raw/ \
       && hdfs dfs -chmod -R 777 $HDFS_BASE/steam $HDFS_BASE/results"

echo "[3/7] Spark 전처리 (CSV → Parquet, 파생 컬럼 생성)..."
$SSH_CMD "spark-submit $REMOTE_DIR/preprocess.py"

echo "[4/7] Hive 집계..."
$SSH_CMD "hive -f $REMOTE_DIR/hive_setup.hql"

echo "[5/7] Spark 분석 + MLlib..."
$SSH_CMD "spark-submit $REMOTE_DIR/spark_analysis.py"

echo "[6/7] 결과 다운로드..."
$SSH_CMD "rm -rf $REMOTE_DIR/output && mkdir -p $REMOTE_DIR/output \
       && hdfs dfs -get $HDFS_BASE/results/* $REMOTE_DIR/output/ \
       && hdfs dfs -get /tmp/hive_result1_region_rate /tmp/hive_result2_playtime_rate \
                        /tmp/hive_result3_playtime_dist $REMOTE_DIR/output/"
rm -rf "$OUTPUT_DIR" && mkdir -p "$OUTPUT_DIR"
$SCP_CMD -r "$REMOTE:$REMOTE_DIR/output/*" "$OUTPUT_DIR/"

echo "[7/7] 시각화..."
python3 "$ROOT_DIR/src/analyze/visualization.py" "$ROOT_DIR/results"

echo "파이프라인 완료! results/charts/ 에서 결과를 확인하세요."
