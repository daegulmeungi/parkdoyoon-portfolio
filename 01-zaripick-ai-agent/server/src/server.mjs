/* ============================================================
 *  자리픽 API 서버 (의존성 0, Node 내장 모듈만 사용)
 *
 *  GET  /api/health
 *  GET  /api/meta                업종·목적·운영형태·데이터 출처·AI 상태·에이전트 도구
 *  GET  /api/areas?limit=        상권 목록(요약)
 *  POST /api/analyze             조건 → 적합도 랭킹 (+AI 근거)
 *  POST /api/deep                선택 상권 → 자금계획·금융조합 (+AI 인사이트)
 *  POST /api/chat                AI 상담 에이전트 (tool-use 루프)
 *  GET  /api/scope               지원 지역 범위 + 분석 등급
 *  그 외                          STATIC_DIR 정적 파일 서빙
 * ============================================================ */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { config } from './config.mjs';
import { INDUSTRIES, GOALS, MODES, COST_ASSUMPTIONS, normCond } from './model.mjs';
import { score, financePlan, estimate } from './scoring.mjs';
import { getRent, getKeyMoney, estimateKeyMoney, roneStatus } from './rone.mjs';
import { reasonFor, deepInsight, aiStatus } from './ai.mjs';
import { CACHE, AREAS, NORM, byId, GU_LIST } from './store.mjs';
import { runAgent, SUGGESTIONS } from './agent.mjs';
import { TOOL_DEFS, TOOL_LABELS } from './tools.mjs';
import { listRegions, findRegions, getRegionSummary, sgisStatus } from './sgis.mjs';
import { localdataStatus, getOpenCloseStats } from './localdata.mjs';
import { getMarketStats, getDongMarket, getDongStats, getDongMetrics, findRegion,
         listScreens, sbizStatus } from './sbiz.mjs';
import { rankDongs, AXIS_LABEL, AXIS_HELP } from './national.mjs';
import { SIDO, TIERS, DEFAULT_SIDO, sidoByCode, isFullTier } from './scope.mjs';

console.log(`[server] 상권 ${AREAS.length}개 로드 (생성 ${CACHE.meta.generatedAt})`);

/* 서울 상권의 임대료를 행정동 키로 옮겨 둔다.
   상권 캐시의 admCd 가 소상공인365 행정동코드와 같은 체계라 그대로 맞물린다.

   주의: seoul_db 의 임대료는 상권별이 아니라 '자치구' 단위다
   (성동구 29개 상권이 전부 18만원, 중구는 전부 26.7만원).
   그래서 행정동을 갈라 주지는 못하고, 서울 시도 평균(17.4)보다 자치구에 맞는 값을 쓸 뿐이다. */
const RENT_BY_DONG = (() => {
  const acc = new Map();
  for (const a of AREAS) {
    if (!a.admCd || !a.rentPerPy) continue;
    const cur = acc.get(a.admCd) || { sum: 0, n: 0 };
    cur.sum += a.rentPerPy; cur.n++;
    acc.set(a.admCd, cur);
  }
  return new Map([...acc].map(([cd, v]) => [cd, Math.round(v.sum / v.n * 10) / 10]));
})();
console.log(`[server] 행정동 임대료 ${RENT_BY_DONG.size}곳 (서울 상권 실측 평균)`);

/* ---------- 유틸 ---------- */
const json = (res, code, body) => {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(buf);
};

async function readJsonBody(req, limit = 1e6) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const num = (v, d, lo, hi) => {
  // Number(null)은 0이므로 빈 값은 먼저 걸러야 한다
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
};

/* 조건 정규화(normCond)는 model.mjs 에 있다.
   AI 에이전트 도구도 같은 규칙을 써야 하므로 단일 출처로 뒀다. */

/** 응답용 상권 요약 (해당 업종 지표만 펼쳐 전달) */
function slim(r, cond, rank) {
  const a = r.area, ind = a.ind?.[cond.industry] || {};
  return {
    rank,
    id: a.id, name: a.name, type: a.type, gu: a.gu, admNm: a.admNm,
    lat: a.lat, lng: a.lng,
    foot: a.foot, footGrowth: a.footGrowth, peak: a.peak,
    weekendRatio: a.weekendRatio, ageMix: a.ageMix,
    resident: a.resident, worker: a.worker,
    subway: a.subway, bus: a.bus,
    rentPerPy: a.rentPerPy, vacancy: a.vacancy,
    changeNm: a.changeNm, avgOperateMonths: a.avgOperateMonths,
    seoulAvgOperateMonths: a.seoulAvgOperateMonths,
    tags: a.tags,
    industry: {
      id: cond.industry,
      storeCnt: ind.storeCnt ?? null,
      salesIdx: ind.salesIdx ?? null, salesIdxSource: ind.salesIdxSource ?? null,
      closeRate: ind.closeRate ?? null, openRate: ind.openRate ?? null,
      competition: ind.competition ?? null, densityPerHa: ind.densityPerHa ?? null,
      fit: ind.fit ?? null,
    },
    score: { total: r.total, ...r.sub },
    cost: r.est,
    affordable: r.affordable,
  };
}

/* ---------- 라우트 ---------- */
async function api(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') {
    return json(res, 200, { ok: true, areas: AREAS.length, ai: aiStatus().mode });
  }

  if (p === '/api/meta') {
    return json(res, 200, {
      industries: INDUSTRIES, goals: GOALS, modes: MODES,
      ai: aiStatus(),
      costAssumptions: COST_ASSUMPTIONS,
      data: {
        source: 'SEOUL DB (서울 열린데이터광장 · 한국부동산원 · 소상공인시장진흥공단 등)',
        generatedAt: CACHE.meta.generatedAt,
        quarters: CACHE.meta.quarters,
        areaCount: AREAS.length,
        areaTypes: CACHE.meta.filters.areaTypes,
        guList: GU_LIST,
      },
      agent: {
        suggestions: SUGGESTIONS,
        tools: TOOL_DEFS.map(t => ({ name: t.name, label: TOOL_LABELS[t.name] || t.name })),
      },
      sgis: sgisStatus(),
      localdata: localdataStatus(),
      sbiz: { ...sbizStatus(), screenList: listScreens() },
      rone: roneStatus(),
    });
  }

  if (p === '/api/areas') {
    const limit = num(url.searchParams.get('limit'), 100, 1, 2000);
    const gu = url.searchParams.get('gu');
    let list = AREAS;
    if (gu) list = list.filter(a => a.gu === gu);
    return json(res, 200, {
      total: list.length,
      areas: list.slice(0, limit).map(a => ({
        id: a.id, name: a.name, type: a.type, gu: a.gu, foot: a.foot,
        footGrowth: a.footGrowth, rentPerPy: a.rentPerPy, vacancy: a.vacancy,
        subway: a.subway, tags: a.tags,
      })),
    });
  }

  if (p === '/api/analyze' && req.method === 'POST') {
    const cond = normCond(await readJsonBody(req));
    // 기본값은 화면의 TOP_N(10)과 맞춘다
    const topN = num(url.searchParams.get('top'), 10, 1, 30);

    let pool = AREAS;
    if (cond.gu) pool = pool.filter(a => a.gu === cond.gu);

    /* 권리금은 한국부동산원 시도×업종 값이라 서울 전체가 한 번의 조회로 끝난다.
       목록과 심층 리포트가 같은 총액을 쓰도록 여기서도 반드시 넣는다 —
       한쪽에만 넣으면 같은 상권의 개설비용이 화면마다 달라진다. */
    const 권리 = roneStatus().enabled
      ? await getKeyMoney('서울특별시', cond.industry).catch(() => null)
      : null;
    const keyMoneyMan = estimateKeyMoney(권리, cond.area);

    const ranked = pool
      .map(a => score({ ...a, keyMoneyMan }, cond, NORM))
      .sort((x, y) => y.total - x.total)
      .slice(0, topN);

    // 상위 결과의 추천 근거 (AI 또는 규칙 기반)
    const reasons = await Promise.all(ranked.map(r => reasonFor(r, cond)));

    return json(res, 200, {
      cond,
      generatedBy: reasons[0]?.by || 'rule',
      ai: aiStatus(),
      poolSize: pool.length,
      권리금: 권리,
      results: ranked.map((r, i) => ({ ...slim(r, cond, i + 1), reason: reasons[i].text })),
    });
  }

  /* ---------- 전국 입지 분석 (행정동 랭킹) ----------
     서울 6축과 다른 산식이다. 같은 점수로 비교하지 않도록 응답에 계속 적어 보낸다. */
  if (p === '/api/national/analyze' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const cond = normCond(body);
    const sggName = String(body.region || '').trim();
    if (!sggName) return json(res, 400, { error: 'region(시군구 이름)이 필요합니다' });
    if (!sbizStatus().enabled) return json(res, 503, { error: 'sbiz disabled' });

    const reg = findRegion(sggName);
    if (!reg?.bbox) return json(res, 404, { error: 'region not found', region: sggName });

    /* 시군구 단위 맥락(임대료·권리금·폐업률)과 행정동 지표를 함께 받는다 */
    const [dongs, rent, km, oc] = await Promise.all([
      getDongMetrics(reg.bbox, cond.industry, reg.ctyCd),
      roneStatus().enabled ? getRent(reg.fullName).catch(() => null) : null,
      roneStatus().enabled ? getKeyMoney(reg.fullName, cond.industry).catch(() => null) : null,
      localdataStatus().enabled ? getOpenCloseStats(reg.fullName, cond.industry).catch(() => null) : null,
    ]);
    if (!dongs?.length) return json(res, 404, { error: 'no data', region: reg.fullName });

    /* 서울은 seoul_db 의 자치구 임대료가 한국부동산원 시도 평균보다 정확하다.
       실제 계산에 쓴 값을 그대로 '맥락'에도 실어야 화면의 공통 조건과 카드가 어긋나지 않는다.
       (17.4만원으로 안내하고 18만원으로 계산하던 문제) */
    const covered = dongs.map(d => RENT_BY_DONG.get(d.행정동코드)).filter(v => v != null);
    const 적용임대료 = covered.length >= dongs.length / 2
      ? Math.round(covered.reduce((a, b) => a + b, 0) / covered.length * 10) / 10
      : rent?.임대료_만원_평 ?? null;
    const 임대료출처 = covered.length >= dongs.length / 2
      ? '서울시 상권 임대료 (자치구 단위)'
      : rent?.기준 ?? null;

    const ctx = {
      임대료_만원_평: 적용임대료,
      권리금_만원: estimateKeyMoney(km, cond.area),
      rentByDong: RENT_BY_DONG,
    };
    const ranked = rankDongs(dongs, ctx, cond);
    const topN = num(url.searchParams.get('top'), 10, 1, 50);

    return json(res, 200, {
      cond,
      지역: reg.fullName,
      단위: '행정동',
      행정동수: dongs.length,
      맥락: {
        임대료_만원_평: 적용임대료,
        임대료_기준: 임대료출처,
        공실률_퍼센트: rent?.공실률_퍼센트 ?? null,
        임대료_시점: rent?.시점 ?? null,
        권리금_만원: ctx.권리금_만원,
        권리금_기준: km?.기준 ?? null,
        폐업률_퍼센트: oc && !oc.조회실패 ? oc.폐업률_퍼센트 : null,
        폐업률_기준: oc && !oc.조회실패 ? `${oc.자치단체} ${oc.기준연도}년` : null,
      },
      비용: ranked.비용,
      조달: ranked.조달,
      예산내: ranked.예산내,
      축: AXIS_LABEL,
      축설명: AXIS_HELP,
      results: ranked.list.slice(0, topN),
      한계: '서울 6축 적합도 점수와 산식이 다릅니다. 점수는 선택한 시군구 안에서의 상대 순위이며, '
          + '다른 시군구의 점수와 직접 비교할 수 없습니다. 임대료·폐업률은 시군구 단위라 '
          + '행정동 간 순위를 가르지 않습니다.',
    });
  }

  if (p === '/api/deep' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const cond = normCond(body);
    const area = byId.get(String(body.areaId));
    if (!area) return json(res, 404, { error: 'area not found', areaId: body.areaId });

    /* 권리금은 한국부동산원 시도×업종 값이다. 실제로 나가는 목돈이라
       총 소요자금에 넣는다 — 빼 두면 자금 계획이 그만큼 헐거워진다.
       점수(6축)에는 넣지 않는다. 산식이 이미 확정돼 있고 지역 평균이라 해상도가 다르다. */
    /* 권리금은 시도 단위 값이라 자치구를 넘겨도 같은 결과다.
       /api/analyze 와 같은 인자를 써야 목록과 리포트의 총액이 어긋나지 않는다. */
    const 권리 = roneStatus().enabled
      ? await getKeyMoney('서울특별시', cond.industry).catch(() => null)
      : null;

    const r = score({ ...area, keyMoneyMan: estimateKeyMoney(권리, cond.area) }, cond, NORM);
    const fin = financePlan(r, cond);

    /* 서울 상권 캐시의 admCd 가 소상공인365 행정동코드와 같은 체계라
       실제 '점포당 월매출'도 그대로 붙일 수 있다. 이쪽도 참고 수치다. */
    const [insight, 시장] = await Promise.all([
      deepInsight(r, cond, fin),
      sbizStatus().enabled && area.admCd
        ? getDongMarket(area.admCd, cond.industry).catch(() => null)
        : null,
    ]);

    return json(res, 200, {
      cond,
      area: slim(r, cond, null),
      finance: fin,
      insight,
      시장,
      권리금: 권리,
      assumptions: COST_ASSUMPTIONS,
      ai: aiStatus(),
    });
  }

  /* ---------- 지원 지역 범위 ----------
     화면이 지역 목록을 하드코딩하지 않도록 서버가 내려준다.
     서울은 seoul_db 의 자치구를, 광역시는 SGIS 시군구를 쓴다. */
  if (p === '/api/scope') {
    /* 17개 시도를 순서대로 돌면 첫 호출이 느리다. SGIS 쪽에 캐시가 있으니 같이 던진다. */
    const out = await Promise.all(SIDO.map(async s => {
      if (s.tier === 'full') return { ...s, children: GU_LIST.map(g => ({ code: g, name: g })) };
      if (!sgisStatus().enabled) return { ...s, children: [], disabled: true };
      try {
        const sgg = await listRegions(s.code);
        return { ...s, children: sgg.map(g => ({ code: g.code, name: g.name })) };
      } catch {
        return { ...s, children: [], error: 'SGIS 조회 실패' };
      }
    }));
    return json(res, 200, { tiers: TIERS, sido: out, defaultSido: DEFAULT_SIDO });
  }

  /* ---------- SGIS 전국 통계 ---------- */
  if (p === '/api/regions') {
    if (!sgisStatus().enabled) return json(res, 503, { error: 'sgis disabled', ...sgisStatus() });
    const cd = url.searchParams.get('cd') || undefined;   // 미지정=시도, 2자리=시군구, 5자리=읍면동
    return json(res, 200, { cd: cd || null, regions: await listRegions(cd) });
  }

  if (p === '/api/region') {
    if (!sgisStatus().enabled) return json(res, 503, { error: 'sgis disabled', ...sgisStatus() });
    const q = url.searchParams.get('q');
    let admCd = url.searchParams.get('admCd');
    let matches = [];
    if (!admCd && q) {
      matches = await findRegions(q, 5);
      if (!matches.length) return json(res, 404, { error: 'region not found', query: q });
      admCd = matches[0].code;
    }
    if (!admCd) return json(res, 400, { error: 'q 또는 admCd 가 필요합니다' });

    const industry = INDUSTRIES.some(i => i.id === url.searchParams.get('industry'))
      ? url.searchParams.get('industry') : null;
    const summary = await getRegionSummary(admCd, industry);
    if (!summary) return json(res, 404, { error: 'no data', admCd });

    /* 8자리면 읍면동, 5자리면 시군구다.
       읍면동일 때는 부모 시군구를 알아야 한다 — 개·폐업은 시군구 단위로만 있고,
       소상공인365 로 넘어가는 다리도 '시군구 + 동 이름'으로 놓기 때문이다. */
    const isDong = String(admCd).length >= 8;
    let sggName = matches[0]?.fullName || summary.지역?.name;
    let dongName = null;
    if (isDong) {
      const sggCd = String(admCd).slice(0, 5);
      const sgg = (await listRegions(String(admCd).slice(0, 2)).catch(() => []))
        .find(r => r.code === sggCd);
      if (sgg) sggName = sgg.fullName;

      /* SGIS 는 읍면동 이름을 '서울특별시중구명동' 처럼 상위 지역까지 붙여 준다.
         앞에 붙은 시도·시군구 표기를 떼야 '명동' 이 남는다. */
      dongName = matches[0]?.name || summary.지역?.name || '';
      const strip = String(sggName).replace(/\s+/g, '');
      if (strip && dongName.startsWith(strip)) dongName = dongName.slice(strip.length);
      /* 없는 코드를 주면 SGIS 가 상위 지역 이름을 그대로 돌려준다.
         그때는 동 이름이 남지 않으니 시군구 단위로 되돌린다. */
      if (!dongName || strip.endsWith(dongName)) { dongName = null; }
    }
    const asDong = isDong && Boolean(dongName);

    /* 시도 전체(2자리)는 인허가·매출 모두 시군구 아래 단위라 붙일 수 없다.
       '코드가 없다'는 실패 메시지를 띄우면 데이터가 빠진 것처럼 읽히므로 아예 묻지 않는다. */
    const isSido = String(admCd).length <= 2;

    /* SGIS 에 없는 축을 붙인다. 한쪽이 실패해도 나머지는 살아야 하므로 개별로 받는다. */
    const [개폐업, 시장, 임대, 권리] = await Promise.all([
      industry && !isSido && localdataStatus().enabled ? getOpenCloseStats(sggName, industry) : null,
      industry && !isSido && sbizStatus().enabled
        ? (asDong ? getDongStats(sggName, dongName, industry) : getMarketStats(sggName, industry))
            .catch(() => null)
        : null,
      !isSido && roneStatus().enabled ? getRent(sggName).catch(() => null) : null,
      industry && !isSido && roneStatus().enabled ? getKeyMoney(sggName, industry).catch(() => null) : null,
    ]);

    /* 임대료가 생기면 초기비용과 자금 계획을 만들 수 있다.
       적합도 6축 점수는 여전히 서울만이다 — 교통·생활인프라 지표가 서울에만 있다. */
    let 자금 = null;
    if (industry && 임대?.임대료_만원_평) {
      const cond = normCond({ industry, ...Object.fromEntries(url.searchParams) });
      const est = estimate(
        { rentPerPy: 임대.임대료_만원_평, keyMoneyMan: estimateKeyMoney(권리, cond.area) },
        cond);
      자금 = {
        조건: { 업종: industry, 면적_평: cond.area, 자기자본_만원: cond.equity },
        비용: est,
        조달: financePlan({ est }, cond),
        기준: `임대료는 ${임대.기준}, 권리금은 ${권리?.기준 ?? '자료 없음'}`,
        주의: '지역 평균 임대료로 계산한 추정치입니다. 실제 계약 조건에 따라 크게 달라집니다.',
      };
    }

    return json(res, 200, {
      ...summary,
      단위: isSido ? '시도' : asDong ? '행정동' : '시군구',
      하위안내: isSido ? '매출·개폐업 통계는 시군구를 선택해야 볼 수 있습니다.' : null,
      상위지역: asDong ? sggName : null,
      개폐업,
      /* 인허가 데이터에는 행정동 구분이 없다. 동을 봐도 개·폐업은 구 전체 값이라
         그 사실을 값과 함께 실어 보낸다 — 화면이 따로 판단하지 않도록. */
      개폐업_기준: 개폐업 && !개폐업.조회실패 && asDong
        ? `${sggName} 전체 (행정동 단위 인허가 데이터 없음)` : null,
      시장,
      부동산: 임대 ? { ...임대, 권리금: 권리 } : null,
      자금,
      후보: matches.slice(1).map(m => ({ code: m.code, name: m.fullName })),
    });
  }

  /* ---------- AI 상담 에이전트 ---------- */
  if (p === '/api/chat' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return json(res, 400, { error: 'messages required' });

    // 화면에서 설정한 조건이 있으면 에이전트 기본값으로 넘긴다
    const context = body.context && typeof body.context === 'object'
      ? { cond: body.context.cond ? normCond(body.context.cond) : null,
          topAreas: Array.isArray(body.context.topAreas) ? body.context.topAreas.slice(0, 5) : [] }
      : null;

    const t0 = Date.now();
    const r = await runAgent({ messages, context });
    return json(res, 200, { ...r, elapsedMs: Date.now() - t0 });
  }

  return json(res, 404, { error: 'not found', path: p });
}

/* ---------- 정적 파일 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

async function serveStatic(req, res, url) {
  if (!config.staticDir) return json(res, 404, { error: 'static disabled' });
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = normalize(join(config.staticDir, rel));
  // 디렉터리 탈출 방지
  if (!full.startsWith(config.staticDir + sep) && full !== config.staticDir) {
    return json(res, 403, { error: 'forbidden' });
  }
  try {
    const st = await stat(full);
    if (st.isDirectory()) return json(res, 404, { error: 'not found' });
    const buf = await readFile(full);
    res.writeHead(200, {
      'content-type': MIME[extname(full).toLowerCase()] || 'application/octet-stream',
      'content-length': buf.length,
      'cache-control': 'no-cache',
    });
    res.end(buf);
  } catch {
    json(res, 404, { error: 'not found', path: rel });
  }
}

/* ---------- 서버 ---------- */
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serveStatic(req, res, url);
  } catch (e) {
    console.error('[server]', e);
    json(res, 500, { error: 'internal', message: e.message });
  }
}).listen(config.port, () => {
  const s = aiStatus();
  console.log(`[server] http://localhost:${config.port}`);
  if (s.enabled) {
    console.log(`[server] AI: ${s.providerLabel} (${s.model})`
      + (s.failover ? ` · 폴백 체인 ${s.chain.map(c => c.label).join(' → ')}` : ''));
  } else {
    console.log('[server] AI: 꺼짐 — 규칙 기반으로 동작합니다.');
    console.log('[server]     .env 에 GEMINI_API_KEY 또는 OPENAI_API_KEY 를 넣으면 자동 전환됩니다.');
  }
  console.log(`[server] 에이전트 도구 ${TOOL_DEFS.length}개: ${TOOL_DEFS.map(t => t.name).join(', ')}`);
  if (config.staticDir) console.log(`[server] 정적 파일: ${config.staticDir}`);
});
