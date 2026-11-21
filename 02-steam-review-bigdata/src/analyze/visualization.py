"""
[시각화] 분석 결과 CSV → 차트 7종

사용법: python3 src/analyze/visualization.py [결과 폴더]   (기본값: results)
  - 결과 폴더 아래에서 Spark(part-*.csv) / Hive(000000_0 …) 출력이나
    정리된 CSV(results/csv/*.csv)를 재귀적으로 찾는다.
  - 차트는 <결과 폴더>/charts/ 에 저장한다.
"""
import sys
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # 서버(GUI 없음) 환경에서도 동작
import matplotlib.pyplot as plt
import numpy as np
import os
import glob

RESULT_DIR = sys.argv[1] if len(sys.argv) > 1 else 'results'
os.chdir(RESULT_DIR)
os.makedirs('charts', exist_ok=True)
BLACK_COLOR = '#3A86FF'
CRIMSON_COLOR = '#FF006E'
EAST_COLOR = '#FB5607'
WEST_COLOR = '#8338EC'
playtime_order = ['0~10h', '10~100h', '100h+']
width = 0.35
def find_csv(name):
    """결과 파일 목록을 찾는다. Spark/Hive 출력은 여러 part 파일로 나뉠 수 있어 전부 반환한다."""
    patterns = [
        f"**/{name}/part-*.csv",      # Spark 출력 디렉토리
        f"**/{name}/0*_0",            # Hive INSERT OVERWRITE DIRECTORY 출력 (000000_0, 000001_0 …)
        f"**/{name}.csv",             # 정리된 결과 CSV (results/csv/)
    ]
    for pattern in patterns:
        files = sorted(glob.glob(pattern, recursive=True))
        if files:
            return files
    raise FileNotFoundError(f"'{name}' 결과 파일을 {os.getcwd()} 아래에서 찾지 못했습니다.")


def load_result(name, names=None):
    """
    결과를 DataFrame으로 읽는다.
    names를 주면 Hive 출력처럼 헤더가 없는 파일로 보고 컬럼명을 붙이되,
    헤더 행이 있는 파일(정리된 CSV)이면 그 행은 건너뛴다.
    """
    frames = []
    for path in find_csv(name):
        if names is None:
            frames.append(pd.read_csv(path))
            continue
        df = pd.read_csv(path, header=None, names=names)
        if not df.empty and str(df.iloc[0, 0]).strip() == names[0]:
            df = df.iloc[1:]
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    if names is not None:
        numeric = [c for c in names if c not in ('playtime_range', 'language_region', 'game_title')]
        df[numeric] = df[numeric].apply(pd.to_numeric)
    return df


df1 = load_result('result6_game_comparison')
fig, ax = plt.subplots(figsize=(9, 6))
x = np.arange(len(df1))
bars1 = ax.bar(x - width/2, df1['black_rate'], width, label='Black Desert', color=BLACK_COLOR, alpha=0.85)
bars2 = ax.bar(x + width/2, df1['crimson_rate'], width, label='Crimson Desert', color=CRIMSON_COLOR, alpha=0.85)
for bar in bars1:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
            f'{bar.get_height()}%', ha='center', fontsize=10, fontweight='bold')
for bar in bars2:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
            f'{bar.get_height()}%', ha='center', fontsize=10, fontweight='bold')
for i, row in df1.iterrows():
    ax.annotate(f'+{row["change"]}%p',
                xy=(i + width/2, row['crimson_rate']),
                xytext=(i + width/2 + 0.15, row['crimson_rate'] + 3),
                fontsize=9, color='green', fontweight='bold')
ax.set_title('Positive Rate by Region: Black Desert vs Crimson Desert', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Language Region', fontsize=11)
ax.set_ylabel('Positive Rate (%)', fontsize=11)
ax.set_xticks(x)
ax.set_xticklabels(df1['language_region'], fontsize=11)
ax.set_ylim(0, 105)
ax.legend(fontsize=10)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart1_region_comparison.png', dpi=150)
plt.close()

df2 = load_result('hive_result2_playtime_rate',
                  names=['playtime_range', 'total', 'positive', 'positive_rate'])
df2 = df2.drop_duplicates(subset=['playtime_range'])
df2 = df2.set_index('playtime_range').reindex(playtime_order).reset_index()
colors2 = ['#FF6B6B', '#FFA94D', '#51CF66']
fig, ax = plt.subplots(figsize=(8, 6))
bars = ax.bar(df2['playtime_range'], df2['positive_rate'], color=colors2, alpha=0.85, width=0.5)
for bar, rate in zip(bars, df2['positive_rate']):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
            f'{rate}%', ha='center', fontsize=11, fontweight='bold')
ax.set_title('Crimson Desert: Positive Rate by Playtime', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Playtime Range', fontsize=11)
ax.set_ylabel('Positive Rate (%)', fontsize=11)
ax.set_ylim(0, 105)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart2_playtime_rate.png', dpi=150)
plt.close()
df3 = load_result('hive_result3_playtime_dist',
                  names=['language_region', 'playtime_range', 'total', 'ratio'])
df3 = df3.drop_duplicates(subset=['language_region', 'playtime_range'])
east = df3[df3['language_region'] == 'East'].set_index('playtime_range').reindex(playtime_order).reset_index()
west = df3[df3['language_region'] == 'West'].set_index('playtime_range').reindex(playtime_order).reset_index()
x = np.arange(3)
fig, ax = plt.subplots(figsize=(9, 6))
bars1 = ax.bar(x - width/2, east['ratio'], width, label='East', color=EAST_COLOR, alpha=0.85)
bars2 = ax.bar(x + width/2, west['ratio'], width, label='West', color=WEST_COLOR, alpha=0.85)
for bar in bars1:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{bar.get_height()}%', ha='center', fontsize=9, fontweight='bold')
for bar in bars2:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{bar.get_height()}%', ha='center', fontsize=9, fontweight='bold')
ax.set_title('Crimson Desert: Playtime Distribution by Region', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Playtime Range', fontsize=11)
ax.set_ylabel('Ratio (%)', fontsize=11)
ax.set_xticks(x)
ax.set_xticklabels(playtime_order, fontsize=11)
ax.set_ylim(0, 65)
ax.legend(fontsize=10)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart3_playtime_dist.png', dpi=150)
plt.close()

df4 = load_result('result3_playtime_pattern')
df4 = df4.drop_duplicates(subset=['playtime_range'])
df4 = df4.set_index('playtime_range').reindex(playtime_order).reset_index()
x = np.arange(3)
fig, ax = plt.subplots(figsize=(9, 6))
bars1 = ax.bar(x - width/2, df4['black_ratio'], width, label='Black Desert', color=BLACK_COLOR, alpha=0.85)
bars2 = ax.bar(x + width/2, df4['crimson_ratio'], width, label='Crimson Desert', color=CRIMSON_COLOR, alpha=0.85)
for bar in bars1:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{bar.get_height()}%', ha='center', fontsize=9, fontweight='bold')
for bar in bars2:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{bar.get_height()}%', ha='center', fontsize=9, fontweight='bold')
ax.set_title('Playtime Pattern: Black Desert vs Crimson Desert', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Playtime Range', fontsize=11)
ax.set_ylabel('Ratio (%)', fontsize=11)
ax.set_xticks(x)
ax.set_xticklabels(playtime_order, fontsize=11)
ax.set_ylim(0, 65)
ax.legend(fontsize=10)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart4_playtime_pattern.png', dpi=150)
plt.close()

df5 = load_result('result5_avg_playtime')
east_hours = df5[df5['language_region'] == 'East']['avg_playtime_hours'].values
west_hours = df5[df5['language_region'] == 'West']['avg_playtime_hours'].values
games = ['Black Desert', 'Crimson Desert']
x = np.arange(2)
fig, ax = plt.subplots(figsize=(9, 6))
bars1 = ax.bar(x - width/2, east_hours, width, label='East', color=EAST_COLOR, alpha=0.85)
bars2 = ax.bar(x + width/2, west_hours, width, label='West', color=WEST_COLOR, alpha=0.85)
for bar in bars1:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5,
            f'{bar.get_height():.0f}h', ha='center', fontsize=9, fontweight='bold')
for bar in bars2:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5,
            f'{bar.get_height():.0f}h', ha='center', fontsize=9, fontweight='bold')
ax.set_title('Average Playtime by Region (hours)', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Game', fontsize=11)
ax.set_ylabel('Average Playtime (hours)', fontsize=11)
ax.set_xticks(x)
ax.set_xticklabels(games, fontsize=11)
ax.legend(fontsize=10)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart5_avg_playtime.png', dpi=150)
plt.close()

df6 = load_result('result4_timeline')
fig, ax = plt.subplots(figsize=(8, 6))
colors_tl = ['#FF6B6B', '#51CF66']
bars = ax.bar(df6['period'], df6['total_reviews'], color=colors_tl, alpha=0.85, width=0.4)
for bar, val in zip(bars, df6['total_reviews']):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1000,
            f'{val:,}', ha='center', fontsize=11, fontweight='bold')
ax.set_title('Crimson Desert: Review Count (Early vs Later)', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Period', fontsize=11)
ax.set_ylabel('Number of Reviews', fontsize=11)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart6_timeline.png', dpi=150)
plt.close()

df7 = load_result('result7_model_auc')
fig, ax = plt.subplots(figsize=(8, 6))
colors_auc = [CRIMSON_COLOR, BLACK_COLOR]
bars = ax.bar(df7['game_title'], df7['auc_score'], color=colors_auc, alpha=0.85, width=0.4)
for bar, val in zip(bars, df7['auc_score']):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.005,
            f'{val:.3f}', ha='center', fontsize=11, fontweight='bold')
ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.7, label='Random (0.5)')
ax.set_title('Logistic Regression AUC: Black Desert vs Crimson Desert', fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Game', fontsize=11)
ax.set_ylabel('AUC Score', fontsize=11)
ax.set_ylim(0, 0.85)
ax.legend(fontsize=10)
ax.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.savefig('charts/chart7_model_auc.png', dpi=150)
plt.close()