/* ============================================================
 *  자리픽 API 클라이언트
 *
 *  서버(server/)가 떠 있으면 seoul_db.db 기반 실데이터를 쓰고,
 *  없으면 assets/js/data.js 의 목업으로 자동 폴백한다.
 *  → 어느 쪽이든 app.js 는 동일한 형태의 데이터를 받는다.
 * ============================================================ */
(function () {
  // 같은 오리진에 API가 있으면 그걸 쓰고, 아니면 로컬 개발 서버를 시도한다
  const CANDIDATES = [
    '',                                   // 서버가 정적 파일까지 서빙하는 경우
    'http://localhost:8787',
    'http://127.0.0.1:8787',
  ];

  const state = {
    base: null,
    online: false,
    meta: null,
  };

  async function tryFetch(url, opt = {}, ms = 4000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opt, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  /** 서버 탐색 + 메타 로드. 실패하면 online=false 로 두고 조용히 넘어간다. */
  async function connect() {
    for (const base of CANDIDATES) {
      // file:// 로 열었을 때 상대경로는 의미가 없으므로 건너뛴다
      if (base === '' && location.protocol === 'file:') continue;
      try {
        const h = await tryFetch(`${base}/api/health`, {}, 2500);
        if (!h?.ok) continue;
        state.base = base;
        state.meta = await tryFetch(`${base}/api/meta`);
        state.online = true;
        console.info('[api] 연결됨:', base || location.origin,
          `· 상권 ${state.meta.data.areaCount}개 · AI ${state.meta.ai.mode}`);
        return state.meta;
      } catch (e) { /* 다음 후보 */ }
    }
    console.info('[api] 서버를 찾지 못했습니다. 목업 데이터로 동작합니다.');
    return null;
  }

  const post = (path, body) => tryFetch(`${state.base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, 40000);   // AI 해설 생성 시간을 감안

  window.ZP_API = {
    state,
    connect,
    isOnline: () => state.online,
    meta: () => state.meta,
    analyze: (cond, top = 10) => post(`/api/analyze?top=${top}`, cond),
    deep: payload => post('/api/deep', payload),
    /* 입지 어드바이저 에이전트. messages 는 [{role:'user'|'assistant', content}] */
    chat: (messages, context) => post('/api/chat', { messages, context }),

    /* 지원 지역 범위 + 분석 등급 */
    scope: () => tryFetch(`${state.base}/api/scope`, {}, 15000),

    /** 하위 행정구역 목록. cd 없으면 시도, 2자리면 시군구, 5자리면 읍면동. */
    regions: cd => tryFetch(`${state.base}/api/regions${cd ? `?cd=${cd}` : ''}`, {}, 15000),

    /** 전국 행정동 입지 랭킹 (서울 6축과 다른 5축 산식) */
    nationalAnalyze: body => post('/api/national/analyze', body),

    /** 서울 외 지역 통계.
     *  admCd 가 있으면 그것으로, 없으면 지역명(q)으로 찾는다. */
    region: (q, industry, admCd, cond) => {
      const p = new URLSearchParams();
      if (admCd) p.set('admCd', admCd); else p.set('q', q);
      if (industry) p.set('industry', industry);
      /* 면적·자기자본이 있으면 서버가 초기비용과 자금 조달까지 계산해 준다 */
      if (cond?.area) p.set('area', cond.area);
      if (cond?.equity) p.set('equity', cond.equity);
      if (cond?.budget) p.set('budget', cond.budget);
      if (cond?.ageBand) p.set('ageBand', cond.ageBand);
      return tryFetch(`${state.base}/api/region?${p}`, {}, 25000);
    },
  };
})();
