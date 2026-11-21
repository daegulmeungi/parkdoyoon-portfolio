/* ============================================================
 *  사전 집계 캐시 로더 (단일 인스턴스)
 *  server.mjs 와 tools.mjs 가 같은 데이터를 봐야 하므로 여기서 한 번만 읽는다.
 * ============================================================ */
import { existsSync, readFileSync } from 'node:fs';
import { config } from './config.mjs';

if (!existsSync(config.cachePath)) {
  console.error(`\n[!] 캐시가 없습니다: ${config.cachePath}`);
  console.error('    먼저 실행하세요:  npm run build:cache\n');
  process.exit(1);
}

export const CACHE = JSON.parse(readFileSync(config.cachePath, 'utf8'));
export const AREAS = CACHE.areas;
export const NORM = CACHE.meta.normalizers || {};
export const byId = new Map(AREAS.map(a => [a.id, a]));
export const GU_LIST = [...new Set(AREAS.map(a => a.gu))].sort();

/* ---------- 상권명 검색 ----------
 * 사용자는 "성수", "강남역", "홍대" 처럼 부정확하게 말한다.
 * 정확일치 → 시작일치 → 부분일치 → 공백/구두점 제거 후 부분일치 순으로 찾는다. */
const squash = s => String(s || '').replace(/[\s·・,()]/g, '').toLowerCase();

export function rankAreas(query, limit = 5) {
  const q = squash(query);
  if (!q || q.length < 2) return [];
  const scored = [];
  for (const a of AREAS) {
    const n = squash(a.name);
    let s = 0;
    if (n === q) s = 100;
    else if (n.startsWith(q)) s = 80;
    else if (n.includes(q)) s = 60;
    else if (squash(a.admNm).includes(q)) s = 40;
    else if (squash(a.gu).includes(q)) s = 25;
    // 동점일 때는 큰 상권을 우선한다
    if (s) scored.push({ a, s: s + Math.min(9, (a.foot || 0) / 20000) });
  }
  return scored.sort((x, y) => y.s - x.s).slice(0, limit);
}

export const findAreas = (query, limit = 5) => rankAreas(query, limit).map(x => x.a);

/** 단건 해석: 못 찾으면 null, 여러 개면 가장 그럴듯한 것 */
export const findArea = q => findAreas(q, 1)[0] || null;

/* ---------- 자치구 해석 ----------
 * 사용자는 "강남에서" 처럼 '구'를 빼고 말한다.
 * 접미사 '구'를 뗀 이름도 허용하되, 한 글자가 되는 구(중구)는 오탐이 많아 제외한다. */
export function detectGu(text = '') {
  const t = squash(text);
  for (const g of GU_LIST) {
    if (t.includes(squash(g))) return g;
    const base = g.replace(/구$/, '');
    if (base.length >= 2 && t.includes(squash(base))) return g;
  }
  return null;
}
