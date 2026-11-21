/* ============================================================
 *  ZARIPICK console logic (prototype)
 *  · 로그인 미연동: 데모 계정 고정. 추후 Firebase Auth 연결
 *  · 코인/기록: localStorage. 추후 Firestore 연결
 *  · 상권 데이터: assets/js/data.js 목업. 추후 API 연결
 * ============================================================ */
(function () {
  /* 목업은 항상 로드해 두고, 서버가 있으면 서버 메타로 교체한다.
   * let 으로 선언해 API 연결 시 재바인딩할 수 있게 한다. */
  let { INDUSTRIES, GOALS, MODES, AREAS, FIN_PRODUCTS } = window.MOCK;

  /* 데이터 소스 상태: 'mock' | 'api' */
  const source = { mode: 'mock', ai: null, data: null };

  /* ---------- 상태 ---------- */
  const state = {
    goal: 'traffic',
    serviceMode: 'visit',
    industry: 'cafe',
    budget: 15000,   // 만원
    area: 15,        // 평
    equity: 8000,    // 만원
    ageBand: 'normal',
    /* 지역. sido 는 시도 코드('11'=서울), region 은 하위 선택값.
       서울은 자치구명('강남구'), 광역시는 SGIS 시군구 코드를 담는다. */
    sido: '11',
    region: '',      // 빈 값 = 전체
    /* 무엇을 순위로 볼지. 'area' = 서울 상권(6축) / 'dong' = 행정동(5축).
       두 산식은 축이 달라 점수를 서로 비교하면 안 된다. */
    unit: 'area',
    ranked: [],
    selected: null,
    deepUnlocked: {},   // { areaId: true }
    deepData: {},       // { areaId: /api/deep 응답 }
    pdfPaid: {},        // { areaId: true }
    docSeq: 0,
  };

  /* ---------- 코인 지갑 (월 10코인 자동 충전) ---------- */
  const WALLET_KEY = 'zaripick_wallet_v1';
  const MONTHLY_FREE = 10;

  function thisMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function loadWallet() {
    let w;
    try { w = JSON.parse(localStorage.getItem(WALLET_KEY)); } catch (e) { w = null; }
    if (!w || w.month !== thisMonth()) {
      w = { month: thisMonth(), balance: MONTHLY_FREE, log: [] };
      saveWallet(w);
    }
    return w;
  }
  function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
  function getCoins() { return loadWallet().balance; }
  function spendCoins(n, memo) {
    const w = loadWallet();
    if (w.balance < n) return false;
    w.balance -= n;
    w.log.unshift({ t: Date.now(), n: -n, memo });
    saveWallet(w);
    renderCoins();
    return true;
  }
  function renderCoins() {
    const n = getCoins();
    document.getElementById('coinCount').textContent = n;
    const note = document.getElementById('noteCoin');
    if (note) note.textContent = n;
  }

  /* ---------- 유틸 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const num = v => Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
  const comma = n => Math.round(n).toLocaleString('ko-KR');

  // 만원 단위 → "1억 2,000만원"
  function won(man) {
    man = Math.round(man);
    if (Math.abs(man) >= 10000) {
      const eok = Math.floor(man / 10000);
      const rest = man % 10000;
      return rest ? `${eok}억 ${comma(rest)}만원` : `${eok}억원`;
    }
    return `${comma(man)}만원`;
  }
  const pct = n => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

  function toast(msg, warn) {
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.innerHTML = `${icon(warn ? 'warn' : 'check', 'icon icon-sm')}<span>${msg}</span>`;
    $('#toastWrap').appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  const ind = () => INDUSTRIES.find(i => i.id === state.industry);

  /* ---------- 점수 등급 (모든 지표에 동일 적용)
   *  s1 매우 낮음 → s5 매우 높음. 색상은 CSS 변수 --sc 로 전달된다. ---------- */
  const GRADES = [
    { min: 85, cls: 's5', label: '매우 높음' },
    { min: 70, cls: 's4', label: '높음' },
    { min: 55, cls: 's3', label: '보통' },
    { min: 40, cls: 's2', label: '낮음' },
    { min: -Infinity, cls: 's1', label: '매우 낮음' },
  ];
  const grade = v => GRADES.find(g => v >= g.min);

  // 값이 작을수록 좋은 지표(폐업률·경쟁밀도 등)를 0~100 '좋음 점수'로 뒤집는다
  const invert = (v, worst, best) => clamp((worst - v) / (worst - best) * 100);

  /* ---------- 앱 내 확인 모달 (브라우저 confirm 대체) ---------- */
  function appConfirm({ title, msg, cost, okText = '확인', icon: ico = 'coin' }) {
    return new Promise(resolve => {
      const bd = $('#appModal');
      $('#amIcon').innerHTML = icon(ico);
      $('#amTitle').textContent = title;
      $('#amMsg').innerHTML = msg;

      const costBox = $('#amCost');
      if (cost > 0) {
        const bal = getCoins();
        costBox.style.display = 'grid';
        costBox.innerHTML = `
          <div><span>보유 코인</span><b>${bal}코인</b></div>
          <div><span>차감 코인</span><b class="minus">- ${cost}코인</b></div>
          <div class="total"><span>차감 후 잔여</span><b>${bal - cost}코인</b></div>`;
      } else {
        costBox.style.display = 'none';
        costBox.innerHTML = '';
      }
      $('#amOk').textContent = okText;

      bd.classList.add('open');
      const done = v => {
        bd.classList.remove('open');
        $('#amOk').onclick = $('#amCancel').onclick = bd.onclick = null;
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = e => {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter') done(true);
      };
      $('#amOk').onclick = () => done(true);
      $('#amCancel').onclick = () => done(false);
      bd.onclick = e => { if (e.target === bd) done(false); };
      document.addEventListener('keydown', onKey);
    });
  }

  /* ---------- PDF 생성 (html2pdf) ---------- */
  /* 클론 내 <use> 참조를 심볼 원본으로 인라인.
   * html2canvas는 SVG를 XMLSerializer로 직렬화해 이미지로 그리므로
   * 바깥 문서의 CSS(.icon의 크기·stroke·fill)가 전달되지 않는다.
   * → 계산된 스타일을 SVG '속성'으로 구워 넣어야 형태가 보인다.
   * getComputedStyle을 쓰므로 반드시 DOM에 붙인 뒤 호출할 것. */
  function inlineIcons(root) {
    root.querySelectorAll('svg').forEach(svg => {
      const use = svg.querySelector('use');
      if (!use) return;
      const id = (use.getAttribute('href') || '').slice(1);
      const sym = document.getElementById(id);
      if (!sym) return;

      const cs = getComputedStyle(svg);
      const w = Math.round(parseFloat(cs.width)) || 16;
      const h = Math.round(parseFloat(cs.height)) || 16;
      const sw = parseFloat(cs.strokeWidth) || 1.7;

      svg.setAttribute('viewBox', sym.getAttribute('viewBox') || '0 0 24 24');
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', cs.color || '#26282b');
      svg.setAttribute('stroke-width', sw);
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.style.width = w + 'px';
      svg.style.height = h + 'px';
      svg.style.verticalAlign = 'middle';
      svg.innerHTML = sym.innerHTML;
    });
  }

  async function exportPdf(r) {
    const src = document.getElementById('reportDoc');
    if (!src) return;

    // 오프라인 등으로 라이브러리 로드 실패 시 인쇄 대화상자로 폴백
    if (typeof html2pdf === 'undefined') {
      toast('PDF 모듈을 불러오지 못해 인쇄 창으로 대체합니다', true);
      setTimeout(() => window.print(), 400);
      return;
    }

    const btn = $('#btnPdf');
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icon('clock', 'icon icon-sm')} PDF 생성 중…`;
    toast('PDF를 생성하고 있습니다. 잠시만 기다려 주세요');

    // html2canvas 제약 2가지를 모두 피해야 한다.
    //  1) DOM에서 분리된 노드는 폭이 0으로 측정돼 백지로 렌더된다 → 실제로 붙여야 한다.
    //  2) 뷰포트 밖(left:-10000px 등)에 두면 캡처 영역을 벗어나 역시 백지가 된다.
    //     → 화면 좌상단에 두되 z-index로 뒤에 숨긴다.
    // 또한 html2canvas에 windowWidth/scrollX/scrollY를 넘기면 html2pdf가 만드는
    // 내부 컨테이너의 좌표계와 어긋나 좌측이 잘린다. 넘기지 않는다.
    const PDF_W = 794;   // px. html2pdf가 만드는 A4 컨테이너 폭과 동일하게 맞춘다
    const holder = document.createElement('div');
    holder.style.cssText =
      `position:absolute;left:0;top:0;width:${PDF_W}px;background:#fff;z-index:-1;pointer-events:none;`;
    let scrollY0 = window.scrollY;
    try {
      const el = src.cloneNode(true);
      el.querySelectorAll('.no-print').forEach(n => n.remove());
      el.classList.add('pdf-doc');
      holder.appendChild(el);
      document.body.appendChild(holder);
      // 붙인 뒤에 호출해야 getComputedStyle로 아이콘 크기·색을 읽을 수 있다
      inlineIcons(el);

      // 스크롤된 상태에서는 문서 최상단의 holder가 뷰포트를 벗어나 백지로 캡처된다
      scrollY0 = window.scrollY;
      window.scrollTo(0, 0);

      // 웹폰트가 로드되기 전에 캡처하면 폴백 폰트로 그려진다
      if (document.fonts && document.fonts.ready) await document.fonts.ready;

      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const fname = `자리픽_입지분석_${r.area.name.replace(/\s+/g, '')}_${ymd}.pdf`;

      await html2pdf().set({
        margin: [12, 10, 14, 10],
        filename: fname,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.stat', '.fin', '.tl', '.callout', '.stat-grid'] },
      }).from(el).save();

      toast(`${fname} 저장 완료`);
    } catch (err) {
      toast('PDF 생성에 실패했습니다. 인쇄 창으로 대체합니다', true);
      setTimeout(() => window.print(), 400);
    } finally {
      holder.remove();
      window.scrollTo(0, scrollY0);
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  }

  function docNo(areaId) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `ZP-${ymd}-${areaId.toUpperCase().slice(0, 4)}`;
  }

  /* ---------- 비용 추정 모델 (시세 기반 목업 계산식)
   *  매출·수익 예측은 편차가 커서 제공하지 않는다.
   *  비용 항목(보증금·권리금·임차료 등)은 상권 시세 데이터에서 환산한다. ---------- */
  function estimate(a) {
    const I = ind();
    const areaFactor = 0.55 + 0.45 * (state.area / 15);   // 면적 스케일
    const depositMan = Math.round(a.deposit * areaFactor);
    const premiumMan = Math.round(a.premium * areaFactor);
    const interiorMan = Math.round(I.interiorPerPy * state.area / 10) * 10;
    const equipMan = Math.round(interiorMan * 0.35);
    const rentMonth = Math.round(a.rentPerPy * state.area);
    const opMonth = Math.round(I.monthlyCost * areaFactor);
    const openingCost = depositMan + premiumMan + interiorMan + equipMan;
    const reserve = Math.round((rentMonth + opMonth) * 3);
    const contingency = Math.round((openingCost + reserve) * 0.05);
    const total = openingCost + reserve + contingency;
    return {
      depositMan, premiumMan, interiorMan, equipMan, rentMonth, opMonth,
      openingCost, reserve, contingency, total,
    };
  }

  /* ---------- 적합도 스코어링 ---------- */
  const WEIGHTS = {
    traffic: { foot: .30, biz: .24, transit: .14, infra: .12, cost: .10, risk: .10 },
    safe:    { foot: .16, biz: .20, transit: .10, infra: .14, cost: .16, risk: .24 },
    cost:    { foot: .14, biz: .18, transit: .08, infra: .10, cost: .38, risk: .12 },
  };
  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

  function score(a) {
    const e = estimate(a);
    const W = { ...WEIGHTS[state.goal] };

    // 수요 지표: 운영 형태에 따라 유동인구 vs 배후 인구 비중이 달라진다
    const walkin = clamp(a.foot / 1600 + a.footGrowth * 1.4);                 // 방문 수요(유동인구+추세)
    const backfill = clamp((a.resident * 1.1 + a.office * 0.7) / 1200);      // 배달 수요(배후 주거·직장)
    let sFoot;
    if (state.serviceMode === 'delivery') {
      sFoot = backfill;
      W.transit *= 0.5;   // 배달은 역세권 의존도 낮음
      W.cost *= 1.3;      // 임대료 부담이 더 중요
    } else if (state.serviceMode === 'hybrid') {
      sFoot = clamp(walkin * 0.5 + backfill * 0.5);
    } else {
      sFoot = walkin;
    }
    // 가중치 재정규화
    const wsum = Object.values(W).reduce((s, x) => s + x, 0);
    Object.keys(W).forEach(k => W[k] /= wsum);

    const sBiz = clamp(a.fit[state.industry] * .6 + a.salesIdx[state.industry] * .4);
    const sTransit = a.transit;
    const sInfra = a.infra;

    // 예산 적합도: 필요자금 대비 예산 여유
    const ratio = state.budget / Math.max(e.openingCost, 1);
    let sCost;
    if (ratio >= 1.6) sCost = 92;                    // 과하게 여유 → 기회비용
    else if (ratio >= 1.0) sCost = 70 + (ratio - 1) * 36;
    else sCost = clamp(ratio * 62);                  // 예산 미달 → 급감

    // 리스크: 폐업률·경쟁밀도 낮을수록, 성장성 높을수록
    const sRisk = clamp(100 - a.closeRate * 4.2 - (a.competition - 60) * .55 + (a.growth - 70) * .35);

    let total =
      sFoot * W.foot + sBiz * W.biz + sTransit * W.transit +
      sInfra * W.infra + sCost * W.cost + sRisk * W.risk;

    // 예산 미달 상권은 실행 가능성이 낮으므로 총점에 페널티
    const affordable = state.budget >= e.openingCost;
    if (!affordable) total *= 0.62 + 0.28 * Math.min(1, ratio);

    return {
      area: a, est: e, affordable,
      sub: { foot: sFoot, biz: sBiz, transit: sTransit, infra: sInfra, cost: sCost, risk: sRisk },
      total: Math.round(clamp(total) * 10) / 10,
    };
  }

  function reasonText(r) {
    // 서버가 생성한 근거(AI 또는 서버측 규칙)가 있으면 그대로 사용
    if (r.apiReason) return r.apiReason;
    const a = r.area, s = r.sub, I = ind();
    const bits = [];
    const top = Object.entries(s).sort((x, y) => y[1] - x[1])[0][0];
    const LABEL = { foot: '수요 기반', biz: '업종 적합도', transit: '교통 접근성', infra: '생활 인프라', cost: '예산 적합도', risk: '안정성' };
    // 한글 받침 유무로 조사 선택
    const label = LABEL[top];
    const code = label.charCodeAt(label.length - 1) - 0xac00;
    const josa = (code >= 0 && code <= 11171 && code % 28 !== 0) ? '이' : '가';
    bits.push(`<b>${label}</b>${josa} 가장 강한 상권입니다.`);
    // '기타 업종'처럼 이름이 이미 '업종'으로 끝나면 중복을 피한다
    const bizLabel = I.name.endsWith('업종') ? I.name : `${I.name} 업종`;
    bits.push(`일 평균 유동인구 ${(a.foot / 10000).toFixed(1)}만 명(전년 대비 ${pct(a.footGrowth)}), ${bizLabel} 매출지수 ${a.salesIdx[state.industry]}(서울 평균 100)으로 집계됩니다.`);
    if (state.serviceMode === 'delivery')
      bits.push(`배달 중심 조건에 따라 유동인구보다 배후 주거·직장 인구(${comma(a.resident + a.office)}명)와 임대료 부담을 높게 반영했습니다.`);
    if (a.competition >= 85) bits.push(`다만 동일 업종 경쟁 밀도가 ${a.competition}점으로 높아 차별화 전략이 필요합니다.`);
    else if (a.competition <= 60) bits.push(`경쟁 밀도가 ${a.competition}점으로 낮아 선점 여지가 있습니다.`);
    if (!r.affordable) bits.push(`<b>현재 예산으로는 초기 개설비용 ${won(r.est.openingCost)}을 충당하기 어렵습니다.</b>`);
    else bits.push(`초기 개설비용은 약 ${won(r.est.openingCost)}으로 입력 예산 범위 내입니다.`);
    return bits.join(' ');
  }

  /* ---------- 뷰 전환 ---------- */
  const VIEW_TITLES = { analyze: '입지 분석', region: '지역 통계',
                        archive: '리포트 보관함', wallet: '코인 사용 내역' };
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + name));
    document.querySelectorAll('.side-item[data-view]').forEach(b =>
      b.classList.toggle('on', b.dataset.view === name));
    $('#crumbTitle').textContent = VIEW_TITLES[name];
    if (name === 'archive') renderArchive();
    if (name === 'wallet') renderWallet();
    if (name === 'region') buildRegionView();
    window.scrollTo({ top: 0 });
  }

  /* ---------- 조건 입력 UI ---------- */
  function buildOptions() {
    $('#goalGrid').innerHTML = GOALS.map(g =>
      `<button class="seg-item ${g.id === state.goal ? 'on' : ''}" data-goal="${g.id}" title="${g.desc}">
         ${icon(g.icon)}${g.name}</button>`).join('');
    $('#modeGrid').innerHTML = MODES.map(m =>
      `<button class="seg-item ${m.id === state.serviceMode ? 'on' : ''}" data-mode="${m.id}" title="${m.desc}">
         ${icon(m.icon)}${m.name}</button>`).join('');
    $('#industryGrid').innerHTML = INDUSTRIES.map((i, idx) => {
      const wide = INDUSTRIES.length % 2 === 1 && idx === INDUSTRIES.length - 1;
      return `<button class="ind-item ${i.id === state.industry ? 'on' : ''}${wide ? ' wide' : ''}" data-ind="${i.id}">
         ${icon(i.icon)}${i.name}</button>`;
    }).join('');

    $('#goalGrid').onclick = e => {
      const b = e.target.closest('[data-goal]'); if (!b) return;
      state.goal = b.dataset.goal; buildOptions();
    };
    $('#modeGrid').onclick = e => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      state.serviceMode = b.dataset.mode; buildOptions();
    };
    $('#industryGrid').onclick = e => {
      const b = e.target.closest('[data-ind]'); if (!b) return;
      state.industry = b.dataset.ind; buildOptions();
    };
  }

  function syncBudgetLabel() {
    $('#budgetLabel').textContent = won(state.budget);
  }

  function bindInputs() {
    const budget = $('#budget'), range = $('#budgetRange');
    budget.addEventListener('input', () => {
      state.budget = num(budget.value);
      range.value = Math.min(60000, Math.max(3000, state.budget));
      syncBudgetLabel();
    });
    budget.addEventListener('blur', () => { budget.value = comma(state.budget); });
    range.addEventListener('input', () => {
      state.budget = num(range.value);
      budget.value = comma(state.budget);
      syncBudgetLabel();
    });
    $('#area').addEventListener('input', e => state.area = Math.max(1, num(e.target.value)));
    $('#equity').addEventListener('input', e => state.equity = num(e.target.value));
    $('#equity').addEventListener('blur', e => e.target.value = comma(state.equity));
    $('#ageBand').addEventListener('change', e => state.ageBand = e.target.value);
    $('#btnAnalyze').addEventListener('click', startAnalysis);

    $('#sidoSel').addEventListener('change', e => {
      state.sido = e.target.value;
      state.region = '';            // 시도가 바뀌면 하위 선택은 초기화
      buildRegionOptions();
    });
    $('#gugunSel').addEventListener('change', e => {
      state.region = e.target.value;
      renderTierNote();
    });

    /* ── 지역 통계 화면 ── */
    $('#rgSido').addEventListener('change', e => {
      rg.sido = e.target.value; rg.region = ''; rg.dong = '';
      buildRegionView();
    });
    $('#rgGugun').addEventListener('change', e => {
      rg.region = e.target.value; rg.dong = '';
      loadRegionDongs();
    });
    $('#rgDong').addEventListener('change', e => { rg.dong = e.target.value; });
    $('#rgArea').addEventListener('input', e => rg.area = Math.max(1, num(e.target.value) || 15));
    $('#rgEquity').addEventListener('input', e => rg.equity = num(e.target.value));
    $('#rgEquity').addEventListener('blur', e => e.target.value = comma(rg.equity));
    $('#btnRegion').addEventListener('click', runRegionStats);

    $('#btnResetCoin').addEventListener('click', () => {
      const w = loadWallet(); w.balance = MONTHLY_FREE; w.log = []; saveWallet(w); renderCoins();
      toast('데모 상태를 초기화했습니다 (10코인)');
      if ($('#view-wallet').classList.contains('on')) renderWallet();
    });
    $('#btnLogout').addEventListener('click', () =>
      toast('베타 버전에서는 로그아웃이 비활성화되어 있습니다', true));
    $('#btnTopup').addEventListener('click', openTopup);

    document.querySelectorAll('.side-item[data-view]').forEach(b =>
      b.addEventListener('click', () => showView(b.dataset.view)));
  }

  /* ---------- 분석 실행 ---------- */
  const PROGRESS_STEPS = [
    '유동인구 데이터 수집',
    '동일 업종 점포 밀도·매출지수 대조',
    '교통 접근성·생활 인프라 가중치 적용',
    '부동산 시세 대비 예산 적합도 산출',
    '적합도 랭킹 생성',
  ];

  /** 현재 입력값을 서버 요청 조건으로 변환 */
  const conditions = () => ({
    industry: state.industry, goal: state.goal, mode: state.serviceMode,
    budget: state.budget, area: state.area, equity: state.equity, ageBand: state.ageBand,
    // 서울일 때만 자치구 필터가 의미 있다 (광역시는 별도 경로로 조회)
    gu: currentTier() === 'full' && state.region ? state.region : null,
  });

  /* ---------- 지역 범위 ----------
     서버(/api/scope)가 지원 지역과 분석 등급을 내려준다.
     full = 서울(상권 단위 6축 적합도) / basic = 광역시(시군구 단위 통계)
     서버가 없으면 서울만 노출한다. */
  const scope = { tiers: null, sido: [], loaded: false };

  const sidoOf = st => scope.sido.find(s => s.code === st.sido) || null;
  const currentSido = () => sidoOf(state);
  const currentTier = () => currentSido()?.tier || 'full';

  /** 선택 상태 → 사람이 읽는 이름 */
  function labelOf(st, dongList) {
    const s = sidoOf(st);
    if (!s) return '서울';
    if (!st.region) return `${s.short} 전체`;
    const c = s.children.find(c => c.code === st.region);
    const d = st.dong && dongList ? dongList.find(x => x.code === st.dong) : null;
    return `${s.short} ${c ? c.name : ''}${d ? ` ${d.name}` : ''}`.trim();
  }
  const regionLabel = () => labelOf(state);
  /** 서버에 넘길 시군구 전체 이름 */
  function fullRegionName(st) {
    const s = sidoOf(st);
    if (!s || !st.region) return null;
    const c = s.children.find(c => c.code === st.region);
    return c ? `${s.name} ${c.name}` : null;
  }

  /* 읍면동 목록 캐시. 시군구 코드로 키를 잡아 두 화면이 함께 쓴다. */
  const dongCache = new Map();
  async function fetchDongs(sggCode) {
    if (!sggCode || !window.ZP_API?.isOnline()) return [];
    if (dongCache.has(sggCode)) return dongCache.get(sggCode);
    try {
      const j = await window.ZP_API.regions(sggCode);
      const list = j.regions || [];
      dongCache.set(sggCode, list);
      return list;
    } catch { dongCache.set(sggCode, []); return []; }
  }

  async function loadScope() {
    if (!window.ZP_API?.isOnline()) {
      // 오프라인(목업)에서는 서울만 지원
      scope.sido = [{ code: '11', name: '서울특별시', short: '서울', tier: 'full', children: [] }];
      scope.tiers = null;
      scope.loaded = true;
      buildRegionOptions();
      return;
    }
    try {
      const j = await window.ZP_API.scope();
      scope.tiers = j.tiers;
      scope.sido = j.sido || [];
      scope.loaded = true;
    } catch {
      scope.sido = [{ code: '11', name: '서울특별시', short: '서울', tier: 'full', children: [] }];
      scope.loaded = true;
    }
    buildRegionOptions();
  }

  /** 시도·시군구 <select> 두 개를 상태에 맞춰 채운다 (두 화면이 함께 쓴다) */
  function fillRegionSelects(sidoId, gugunId, st) {
    const sidoSel = $(sidoId), gugunSel = $(gugunId);
    if (!sidoSel || !gugunSel) return;
    sidoSel.innerHTML = scope.sido.map(s =>
      `<option value="${s.code}"${s.code === st.sido ? ' selected' : ''}>${s.name}</option>`).join('');
    const kids = sidoOf(st)?.children || [];
    gugunSel.innerHTML = `<option value="">전체</option>` + kids.map(c =>
      `<option value="${c.code}"${c.code === st.region ? ' selected' : ''}>${c.name}</option>`).join('');
    gugunSel.disabled = !kids.length;
  }

  function buildRegionOptions() {
    fillRegionSelects('#sidoSel', '#gugunSel', state);
    buildUnitOptions();
    renderTierNote();
  }

  /* 분석 단위 — 서울만 '상권'을 고를 수 있다.
     서울 밖에는 상권 경계 데이터가 없어 행정동이 가장 작은 단위다. */
  function unitChoices() {
    const seoul = currentTier() === 'full';
    return [
      ...(seoul ? [{ id: 'area', name: '상권', icon: 'store', desc: '서울시가 정의한 상권 1,030곳 · 6축 적합도' }] : []),
      { id: 'dong', name: '행정동', icon: 'map',
        desc: seoul ? '자치구 안의 행정동 순위 · 5축 입지 점수' : '시군구 안의 행정동 순위 · 5축 입지 점수' },
    ];
  }

  function buildUnitOptions() {
    const box = $('#unitGrid');
    if (!box) return;
    const list = unitChoices();
    if (!list.some(u => u.id === state.unit)) state.unit = list[0].id;
    box.innerHTML = list.map(u =>
      `<button class="seg-item ${u.id === state.unit ? 'on' : ''}" data-unit="${u.id}" title="${u.desc}">
         ${icon(u.icon)}${u.name}</button>`).join('');
    box.onclick = e => {
      const b = e.target.closest('[data-unit]'); if (!b) return;
      state.unit = b.dataset.unit;
      buildUnitOptions(); renderTierNote();
    };
  }

  function renderTierNote() {
    const note = $('#tierNote'), btn = $('#btnAnalyze'), sub = $('#analyzeNote');
    if (!note) return;
    const seoul = currentTier() === 'full';
    const byArea = seoul && state.unit === 'area';

    if (byArea) {
      note.className = 'tier-note tier-full';
      note.innerHTML = `${icon('check', 'icon icon-sm')}<b>정밀 분석 · 상권 단위</b>` +
        `<span>유동인구·교통·생활인프라까지 반영한 6축 적합도와 자금 계획을 제공합니다.</span>`;
    } else if (!state.region) {
      note.className = 'tier-note tier-basic';
      note.innerHTML = `${icon('info', 'icon icon-sm')}<b>시군구를 골라 주세요</b>` +
        `<span>행정동 순위는 시군구 하나를 정해야 매길 수 있습니다.</span>`;
    } else {
      note.className = 'tier-note tier-basic';
      note.innerHTML = `${icon('info', 'icon icon-sm')}<b>입지 점수 · 행정동 단위</b>` +
        `<span>수요·배후·매출력·경쟁·구매력 5축입니다. 교통·생활인프라 지표가 없어 `
        + `<b>서울 상권 6축 점수와 비교할 수 없습니다.</b></span>`;
    }
    if (btn) btn.textContent = '입지 분석 실행';
    if (sub) sub.innerHTML = `실행 시 <b>${COST.analyze}코인</b>이 차감됩니다 · 보유 <b id="noteCoin">${getCoins()}</b>코인`;
    renderCoins();
  }

  /** API 응답 1건 → 화면이 쓰는 내부 형태로 변환 (목업 경로와 동일 스키마) */
  function fromApi(r) {
    const iid = state.industry;
    return {
      area: {
        id: r.id, name: r.name, gu: r.gu, type: r.type, admNm: r.admNm,
        station: [r.subway ? `지하철 ${r.subway}개역` : null,
                  r.bus ? `버스 ${r.bus}개소` : null].filter(Boolean).join(' · ') || r.admNm,
        peak: r.peak, foot: r.foot, footGrowth: r.footGrowth ?? 0,
        resident: r.resident ?? 0, office: r.worker ?? 0,
        ageMix: r.ageMix || {}, tags: r.tags || [],
        rentPerPy: r.rentPerPy, vacancy: r.vacancy,
        /* 목업 경로가 쓰던 이름들. 서버 응답에는 점수로만 들어와 여기서 옮겨 준다
           (안 옮기면 리포트 02번 표가 'undefined점'으로 나온다) */
        transit: r.score?.transit, infra: r.score?.infra, growth: r.score?.foot,
        changeNm: r.changeNm, avgOperateMonths: r.avgOperateMonths,
        seoulAvgOperateMonths: r.seoulAvgOperateMonths,
        weekendRatio: r.weekendRatio,
        competition: r.industry.competition ?? 50,
        closeRate: r.industry.closeRate ?? 0,
        storeCnt: r.industry.storeCnt ?? 0,
        salesIdxSource: r.industry.salesIdxSource,
        salesIdx: { [iid]: r.industry.salesIdx },
        fit: { [iid]: r.industry.fit },
      },
      est: r.cost,
      affordable: r.affordable,
      sub: { foot: r.score.foot, biz: r.score.biz, transit: r.score.transit,
             infra: r.score.infra, cost: r.score.cost, risk: r.score.risk },
      total: r.score.total,
      apiReason: r.reason,
    };
  }

  /* 코인 정책: 분석 1 · PDF 1 · 심층 5 */
  const COST = { analyze: 1, pdf: 1, deep: 5 };
  /* 추천 결과 개수 */
  const TOP_N = 10;

  /** 코인 부족 시 충전 안내 (결제 미연동 프로토타입) */
  async function openTopup() {
    const ok = await appConfirm({
      title: '코인이 부족합니다',
      msg: '요금 안내에서 코인 팩을 충전하거나 구독 플랜으로 전환할 수 있습니다.<br>' +
           '<span style="color:var(--g500);font-size:12.5px">베타 기간에는 결제가 연동되어 있지 않습니다.</span>',
      cost: 0, okText: '요금 안내 보기', icon: 'coin',
    });
    if (ok) window.open('index.html#pricing', '_blank');
  }

  /** 분석 실행: 코인 확인 → 확인 모달 → 차감 → 실행 */
  async function startAnalysis() {
    const byArea = currentTier() === 'full' && state.unit === 'area';

    /* 행정동 순위는 시군구 하나를 정해야 매길 수 있다.
       시도 전체를 훑으려면 시군구 수만큼 조회가 필요해 응답이 너무 느려진다. */
    if (!byArea && !state.region) {
      toast('행정동 순위는 시군구를 먼저 골라 주세요', true);
      return;
    }
    if (!byArea && !window.ZP_API?.isOnline()) {
      toast('행정동 분석은 분석 서버가 실행 중일 때만 가능합니다', true);
      return;
    }

    if (getCoins() < COST.analyze) {
      toast(`코인이 부족합니다. (필요 ${COST.analyze}코인)`, true);
      return openTopup();
    }
    const I = ind(), G = GOALS.find(g => g.id === state.goal);
    const poolLabel = byArea
      ? (state.region ? `서울 ${state.region}`
         : (source.mode === 'api' ? `서울 ${comma(source.data.areaCount)}개 상권` : '서울 상권'))
      : `${regionLabel()}의 행정동`;
    const ok = await appConfirm({
      title: '입지 분석 실행',
      msg: `<b>${I.name} · ${state.area}평 · ${won(state.budget)}</b> 조건으로<br>` +
           `${poolLabel}을 분석합니다. (${G.name} 기준)`,
      cost: COST.analyze, okText: `${COST.analyze}코인 차감하고 실행`, icon: 'search',
    });
    if (!ok) return;
    spendCoins(COST.analyze, `입지 분석 · ${I.name}`);
    if (byArea) runAnalysis(); else runDongAnalysis();
  }

  /* ---------- 행정동 입지 분석 (전국) ----------
     서울 6축과 산식이 다르다. 화면에도 그렇게 적는다. */
  async function runDongAnalysis() {
    const box = $('#resultArea');
    closeDocModal();
    box.innerHTML = `<div class="panel progress-card">
        <div class="progress-head">${regionLabel()}의 행정동을 분석하고 있습니다</div>
        <div class="progress-sub">${ind().name} · 매출·유동인구·배후인구·임대료 수집 중</div>
      </div>`;
    try {
      const r = await window.ZP_API.nationalAnalyze({
        region: fullRegionName(state),
        industry: state.industry, goal: state.goal, mode: state.serviceMode,
        budget: state.budget, area: state.area, equity: state.equity, ageBand: state.ageBand,
      });
      if (r.error) throw new Error(r.error);
      state.dongResult = r;
      renderDongRanking(r);
    } catch (e) {
      box.innerHTML = `<div class="empty">
          <div class="empty-ico">${icon('warn')}</div>
          <h3>분석하지 못했습니다</h3>
          <p>${(e.message || '네트워크 오류')}</p>
        </div>`;
    }
  }

  function renderDongRanking(r) {
    const AX = r.축 || {};
    const keys = Object.keys(AX);
    const m = r.맥락 || {};
    const row = x => {
      const s = x.점수 || {};
      return `
      <div class="panel rank-card">
        <div class="rank-head">
          <div class="rank-no">${x.순위}</div>
          <div class="rank-title">
            <h3>${x.행정동}</h3>
            <p>${comma(x.지표.유동인구)}명 유동 · ${x.지표.해당업종_점포수}개 점포
               ${x.예산내 ? '' : '· <b style="color:var(--red)">예산 초과</b>'}</p>
          </div>
          <div class="rank-score"><b>${s.total ?? '-'}</b><span>입지 점수</span></div>
        </div>
        <div class="rs-stats">
          <div class="rs-stat"><b>${comma(x.지표.점포당_월매출_만원)}<small>만원</small></b><span>점포당 월매출</span></div>
          <div class="rs-stat"><b>${comma(x.지표.점포당_배후인구)}<small>명</small></b><span>점포당 배후인구</span></div>
          <div class="rs-stat"><b>${comma(x.지표.주거인구)}<small>명</small></b><span>주거인구</span></div>
          <div class="rs-stat"><b>${comma(x.지표.직장인구)}<small>명</small></b><span>직장인구</span></div>
        </div>
        <div class="rs-ages">${keys.map(k => `
          <div class="vrow"><span class="n">${AX[k]}</span>
            <span class="vbar"><i style="width:${s[k] ?? 0}%"></i></span>
            <span class="v">${s[k] ?? '-'}</span></div>`).join('')}</div>
      </div>`;
    };

    $('#resultArea').innerHTML = `
      <div class="rs-head">
        <div>
          <h2>${r.지역} 행정동 순위</h2>
          <p>${ind().name} · ${r.행정동수}개 행정동 중 상위 ${r.results.length}곳</p>
        </div>
        <span class="tier-badge basic">${icon('info', 'icon icon-sm')} 입지 점수 (5축)</span>
      </div>

      <div class="callout" style="margin-bottom:16px">
        ${icon('info')}
        <span><b>서울 상권 6축 적합도 점수와 다른 산식입니다.</b>
        점수는 <b>${r.지역} 안에서의 상대 순위</b>이며 다른 지역의 점수와 비교할 수 없습니다.
        교통·생활인프라 지표가 없어 6축을 그대로 쓸 수 없습니다.</span>
      </div>

      <div class="panel rs-panel">
        <div class="panel-head"><h3>이 지역의 공통 조건</h3>
          <span class="sub">행정동 순위를 가르지 않고 수준을 정합니다</span></div>
        <div class="rs-stats">
          <div class="rs-stat"><b>${m.임대료_만원_평 ?? '-'}<small>만원/평</small></b><span>임대료</span></div>
          <div class="rs-stat"><b>${m.공실률_퍼센트 ?? '-'}<small>%</small></b><span>공실률</span></div>
          <div class="rs-stat"><b>${comma(m.권리금_만원)}<small>만원</small></b><span>권리금(${state.area}평)</span></div>
          <div class="rs-stat"><b>${m.폐업률_퍼센트 ?? '-'}<small>%</small></b><span>폐업률</span></div>
          <div class="rs-stat"><b>${comma(r.비용?.total)}<small>만원</small></b><span>총 소요자금</span></div>
          <div class="rs-stat"><b>${comma(Math.max(0, (r.비용?.total || 0) - state.equity))}<small>만원</small></b><span>조달 필요</span></div>
        </div>
        <p class="rs-foot">임대료 ${m.임대료_기준 || '-'} · ${m.임대료_시점 || ''}
        ${m.폐업률_기준 ? ` · 폐업률 ${m.폐업률_기준}` : ''}
        ${m.권리금_기준 ? ` · 권리금 ${m.권리금_기준}` : ''}</p>
      </div>

      ${r.results.map(row).join('')}

      <div class="callout" style="margin-top:16px">
        ${icon('warn')}
        <span>${r.한계}</span>
      </div>`;
    window.scrollTo({ top: 0 });
  }

  /* ---------- 기본 통계 (광역시) ----------
     적합도 점수를 만들지 않는다. 관측된 수치만 보여주고
     무엇이 없는지 화면에 분명히 적는다. */
  /* SGIS 는 '부산광역시해운대구' 처럼 시도·시군구를 붙여 준다. 읽기 좋게 띄운다. */
  const prettyRegion = nm => !nm ? '' :
    String(nm).replace(/^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시)(?=\S)/, '$1 ');

  /* ---------- 지역 통계 화면 ----------
     입지 분석과 목적이 다르다. 여기서는 순위를 매기지 않고
     고른 지역 하나의 지표만 펼쳐 본다. */
  const rg = { sido: '11', region: '', dong: '', industry: 'cafe', area: 15, equity: 8000, list: [] };

  function buildRegionView() {
    if (!$('#rgSido')) return;
    fillRegionSelects('#rgSido', '#rgGugun', rg);
    $('#rgIndustryGrid').innerHTML = INDUSTRIES.map((i, idx) => {
      const wide = INDUSTRIES.length % 2 === 1 && idx === INDUSTRIES.length - 1;
      return `<button class="ind-item ${i.id === rg.industry ? 'on' : ''}${wide ? ' wide' : ''}" data-rgind="${i.id}">
         ${icon(i.icon)}${i.name}</button>`;
    }).join('');
    $('#rgIndustryGrid').onclick = e => {
      const b = e.target.closest('[data-rgind]'); if (!b) return;
      rg.industry = b.dataset.rgind; buildRegionView();
    };
    loadRegionDongs();
  }

  async function loadRegionDongs() {
    const sel = $('#rgDong');
    if (!sel) return;
    if (!rg.region) { rg.list = []; sel.style.display = 'none'; return; }
    sel.style.display = '';
    sel.disabled = true;
    sel.innerHTML = '<option value="">읍면동 불러오는 중…</option>';
    rg.list = await fetchDongs(rg.region);
    sel.disabled = false;
    sel.style.display = rg.list.length ? '' : 'none';
    sel.innerHTML = '<option value="">시군구 전체</option>' + rg.list.map(d =>
      `<option value="${d.code}"${d.code === rg.dong ? ' selected' : ''}>${d.name}</option>`).join('');
  }

  async function runRegionStats() {
    const box = $('#regionArea');
    const label = labelOf(rg, rg.list);
    const I = INDUSTRIES.find(i => i.id === rg.industry) || INDUSTRIES[0];
    box.innerHTML = `<div class="panel progress-card">
        <div class="progress-head">${label} 통계를 조회하고 있습니다</div>
        <div class="progress-sub">${I.name} 기준</div>
      </div>`;

    if (!window.ZP_API?.isOnline()) {
      box.innerHTML = `<div class="empty">
          <div class="empty-ico">${icon('warn')}</div>
          <h3>서버 연결이 필요합니다</h3>
          <p>지역 통계는 분석 서버가 실행 중일 때만 조회할 수 있습니다.</p>
        </div>`;
      return;
    }

    try {
      const s = sidoOf(rg);
      const q = rg.region
        ? (s.children.find(c => c.code === rg.region)?.name || s.name)
        : s.name;
      /* 행정동을 골랐으면 그 코드로 내려간다. 서버가 8자리를 보고 단위를 판단한다.
         면적·자기자본을 같이 넘기면 초기비용과 자금 조달까지 계산돼 온다. */
      const r = await window.ZP_API.region(q, rg.industry, rg.dong || rg.region || null, {
        area: rg.area, equity: rg.equity,
      });
      renderRegionStats(r, label, I);
    } catch (e) {
      box.innerHTML = `<div class="empty">
          <div class="empty-ico">${icon('warn')}</div>
          <h3>통계를 가져오지 못했습니다</h3>
          <p>${(e.message || '네트워크 오류')}</p>
        </div>`;
    }
  }

  function renderRegionStats(r, label, I) {
    const p = r.인구 || {}, ind0 = r.업종 || {}, oc = r.개폐업, mk = r.시장;
    const re = r.부동산, fin = r.자금;
    const isDong = r.단위 === '행정동';
    const ages = r.연령구성 || {};
    const ageRows = ['10대', '20대', '30대', '40대', '50대', '60대', '70대이상']
      .filter(k => ages[k]?.비율 != null)
      .map(k => {
        const v = ages[k].비율;
        return `<div class="vrow"><span class="n">${k}</span>
          <span class="vbar"><i style="width:${Math.min(100, v * 3.2)}%"></i></span>
          <span class="v">${v}%</span></div>`;
      }).join('');

    /* comma() 는 반올림하므로 소수가 의미 있는 값(평균나이 43.6 등)은 그대로 쓴다 */
    const fmt = (v, dec) => v == null ? '-'
      : (dec ? Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
             : comma(v));
    const stat = (label, val, unit = '', dec = false) =>
      `<div class="rs-stat"><b>${fmt(val, dec)}<small>${unit}</small></b><span>${label}</span></div>`;

    $("#regionArea").innerHTML = `
      <div class="rs-head">
        <div>
          <h2>${prettyRegion(r.지역?.name) || label}</h2>
          <p>${I.name} 기준 · ${r.단위 || '시군구'} 단위 통계${
            r.상위지역 ? ` <span class="dim">(${r.상위지역})</span>` : ''}</p>
        </div>
        <span class="tier-badge basic">${icon('info', 'icon icon-sm')} 기본 통계</span>
      </div>

      <div class="panel rs-panel">
        <div class="panel-head"><h3>인구</h3><span class="sub">통계청 인구주택총조사 ${p.year || ''}</span></div>
        <div class="rs-stats">
          ${stat('총인구', p.총인구, '명')}
          ${stat('총가구', p.총가구, '가구')}
          ${stat('평균나이', p.평균나이, '세', true)}
          ${stat('인구밀도', p.인구밀도, '명/㎢')}
        </div>
        ${ageRows ? `<div class="rs-sub">연령 구성</div><div class="rs-ages">${ageRows}</div>` : ''}
      </div>

      <div class="panel rs-panel">
        <div class="panel-head"><h3>${I.name} 현황</h3><span class="sub">전국사업체조사 ${ind0.year || ''}</span></div>
        <div class="rs-stats">
          ${stat('사업체 수', ind0.사업체수, '개')}
          ${stat('종사자 수', ind0.종사자수, '명')}
          ${stat('점포당 배후인구', r.점포당_배후인구, '명')}
        </div>
      </div>

      ${mk?.점포당_월매출_만원 ? (isDong ? `
      <div class="panel rs-panel">
        <div class="panel-head"><h3>매출·수요</h3>
          <span class="sub">소상공인시장진흥공단 · ${mk.시군구 || ''} 내 ${mk.매출순위}/${mk.매출순위_모수}위</span></div>
        <div class="rs-stats">
          ${stat('점포당 월매출', mk.점포당_월매출_만원, '만원')}
          ${stat('해당 업종 점포', mk.점포수, '개')}
          ${stat('유동인구', mk.유동인구, '명')}
          ${stat('직장인구', mk.직장인구, '명')}
          ${stat('주거인구', mk.주거인구, '명')}
          ${stat('월평균 소득', mk.월평균소득_만원, '만원')}
          ${stat('월평균 소비', mk.월평균소비_만원, '만원')}
          ${stat('세대수', mk.세대수, '세대')}
        </div>
        <p class="rs-foot">점포당 월매출은 카드매출 기반 <b>이 행정동의 평균 추정치</b>입니다.
        개별 점포의 예상 매출이 아니며, 임대료·인건비를 뺀 이익이 아닙니다.
        같은 동 안에서도 입지·규모에 따라 편차가 큽니다.</p>
      </div>` : `
      <div class="panel rs-panel">
        <div class="panel-head"><h3>매출·수요</h3><span class="sub">소상공인시장진흥공단 · 행정동 ${mk.행정동수}곳</span></div>
        <div class="rs-stats">
          ${stat('점포당 월매출', mk.점포당_월매출_만원, '만원')}
          ${stat('유동인구', mk.유동인구, '명')}
          ${stat('월평균 소득', mk.월평균소득_만원, '만원')}
          ${stat('월평균 소비', mk.월평균소비_만원, '만원')}
        </div>
        ${mk.상위_행정동?.length ? `<div class="rs-sub">매출 상위 행정동</div>
        <div class="rs-ages">${mk.상위_행정동.map(d => `
          <div class="vrow"><span class="n">${d.행정동}</span>
            <span class="vbar"><i style="width:${Math.min(100, d.점포당_월매출_만원 / (mk.상위_행정동[0].점포당_월매출_만원 || 1) * 100)}%"></i></span>
            <span class="v">${comma(d.점포당_월매출_만원)}만원</span></div>`).join('')}</div>
        <p class="rs-foot" style="padding-bottom:0">행정동을 고르면 그 동만 따로 볼 수 있습니다.</p>` : ''}
        <p class="rs-foot">점포당 월매출은 카드매출 기반 <b>행정동 평균 추정치</b>입니다.
        개별 점포의 예상 매출이 아니며, 임대료·인건비를 뺀 이익이 아닙니다.${
          mk.매출제외_행정동수
            ? ` 원자료에 점포당 월매출이 3억원을 넘는 비상식적인 값이 있어
                <b>${mk.매출제외_행정동수}개 행정동</b>은 평균 계산에서 제외했습니다.`
            : ''}</p>
      </div>`) : ''}

      ${re?.임대료_만원_평 ? `
      <div class="panel rs-panel">
        <div class="panel-head"><h3>임대료·권리금</h3>
          <span class="sub">한국부동산원 · ${re.시점} · 소규모 상가</span></div>
        <div class="rs-stats">
          ${stat('임대료(평당)', re.임대료_만원_평, '만원', true)}
          ${stat('공실률', re.공실률_퍼센트, '%', true)}
          ${stat('권리금 중위', re.권리금?.권리금_중위_만원, '만원')}
          ${stat('권리금 있는 점포', re.권리금?.권리금_있는_비율_퍼센트, '%', true)}
        </div>
        <p class="rs-foot">${re.기준} 기준입니다.
        ${re.해상도 === '시도'
          ? '이 시군구를 직접 조사한 상권이 없어 <b>시도 평균</b>을 썼습니다.'
          : `조사 상권: ${re.상권.join(', ')}`}
        ${re.권리금 ? `권리금은 ${re.권리금.기준} 기준입니다.` : ''}</p>
      </div>` : ''}

      ${fin ? `
      <div class="panel rs-panel">
        <div class="panel-head"><h3>초기비용·자금 조달</h3>
          <span class="sub">${I.name} · ${fin.조건.면적_평}평 기준</span></div>
        <div class="rs-stats">
          ${stat('월 임차료', fin.비용.rentMonth, '만원')}
          ${stat('보증금', fin.비용.depositMan, '만원')}
          ${stat('권리금', fin.비용.premiumMan, '만원')}
          ${stat('인테리어·설비', (fin.비용.interiorMan || 0) + (fin.비용.equipMan || 0), '만원')}
          ${stat('총 소요자금', fin.비용.total, '만원')}
          ${stat('조달 필요', Math.max(0, fin.비용.total - fin.조건.자기자본_만원), '만원')}
        </div>
        ${fin.조달?.products?.length ? `<div class="rs-sub">추천 금융 조합</div>
        <div class="rs-ages">${fin.조달.products.map(x => `
          <div class="vrow"><span class="n">${x.name}</span>
            <span class="vbar"><i style="width:${Math.min(100, x.amt / (fin.비용.total || 1) * 100)}%"></i></span>
            <span class="v">${comma(x.amt)}만원</span></div>`).join('')}</div>
        <p class="rs-foot" style="padding-bottom:0">조달 합계 <b>${comma(fin.조달.raised)}</b>만원 ·
        원리금 상환 월 <b>${comma(fin.조달.monthlyRepay)}</b>만원(거치 중 ${comma(fin.조달.graceRepay)}만원)</p>` : ''}
        <p class="rs-foot">${fin.기준}. ${fin.주의}
        인테리어·설비·운영비는 업종별 표준 가정값입니다.</p>
      </div>` : ''}

      ${r.하위안내 ? `
      <div class="callout" style="margin-top:18px">
        ${icon('info')}
        <span>${r.하위안내}</span>
      </div>` : ''}

      ${oc && !oc.조회실패 ? `
      <div class="panel rs-panel">
        <div class="panel-head"><h3>개업·폐업</h3>
          <span class="sub">행정안전부 인허가 · ${oc.기준연도}년 기준</span></div>
        ${r.개폐업_기준 ? `<p class="rs-foot" style="padding-top:0">
          인허가 데이터에는 행정동 구분이 없어 <b>${r.개폐업_기준}</b> 값입니다.</p>` : ''}
        <div class="rs-stats">
          ${stat('영업 중', oc.영업중, '곳')}
          ${stat(`${oc.기준연도}년 개업`, oc.기준연도_개업, '곳')}
          ${stat(`${oc.기준연도}년 폐업`, oc.기준연도_폐업, '곳')}
          ${stat('폐업률', oc.폐업률_퍼센트, '%', true)}
        </div>
        ${oc.올해 ? `<p class="rs-foot" style="padding-bottom:0">
          ${oc.올해.연도}년 진행 중 · 개업 <b>${comma(oc.올해.개업)}</b>곳 · 폐업 <b>${comma(oc.올해.폐업)}</b>곳
        </p>` : ''}
        <p class="rs-foot">${oc.산출식}. ${oc.주의}</p>
      </div>` : oc?.조회실패 ? `
      <div class="callout" style="margin-top:18px">
        ${icon('warn')}
        <span><b>개업·폐업 통계를 붙이지 못했습니다.</b> ${oc.사유 || ''}</span>
      </div>` : ''}

      <div class="callout" style="margin-top:18px">
        ${icon('info')}
        <span><b>이 지역은 적합도 점수를 산출하지 않습니다.</b>
        교통·생활인프라 지표가 서울에만 있어 6축 점수를 만들 수 없습니다.
        위 수치는 서울 상권 분석과 산출 기준이 달라 직접 비교할 수 없습니다.
        상권 단위 정밀 분석이 필요하면 지역을 <b>서울</b>로 바꿔 주세요.</span>
      </div>`;
    window.scrollTo({ top: 0 });
  }

  function runAnalysis() {
    const box = $('#resultArea');
    // 이전 리포트 정리. display 는 건드리지 않는다
    // (리포트는 팝업 안에서 그려지므로 여기서 숨기면 본문이 통째로 사라진다)
    closeDocModal();
    const scopeLabel = source.mode === 'api'
      ? `서울 ${comma(source.data.areaCount)}개 상권` : '서울 15개 상권';
    box.innerHTML = `
      <div class="panel progress-card">
        <div class="progress-head">${scopeLabel}을 분석하고 있습니다</div>
        <div class="progress-sub">${ind().name} · ${won(state.budget)} · ${GOALS.find(g => g.id === state.goal).name} 기준</div>
        <div class="progress-list">
          ${PROGRESS_STEPS.map((s, i) =>
            `<div class="progress-item ${i === 0 ? 'run' : ''}" data-step="${i}"><span class="st"></span>${s}</div>`).join('')}
        </div>
      </div>`;

    let i = 0;
    const timer = setInterval(() => {
      const cur = box.querySelector(`[data-step="${i}"]`);
      if (cur) { cur.className = 'progress-item done'; cur.querySelector('.st').innerHTML = icon('check', 'icon'); }
      i++;
      const next = box.querySelector(`[data-step="${i}"]`);
      if (next) next.classList.add('run');
      else clearInterval(timer);
    }, 340);

    const finish = () => { clearInterval(timer); renderRanking(); };

    if (source.mode === 'api') {
      // 실데이터 경로: 스코어링은 서버가 수행
      const started = Date.now();
      window.ZP_API.analyze(conditions(), TOP_N)
        .then(res => {
          state.ranked = res.results.map(fromApi);
          source.ai = res.ai;
          // 진행 표시가 너무 빨리 사라지지 않도록 최소 노출 시간 확보
          setTimeout(finish, Math.max(0, 1500 - (Date.now() - started)));
        })
        .catch(err => {
          console.warn('[api] 분석 실패, 목업으로 폴백:', err);
          toast('서버 응답이 없어 목업 데이터로 분석했습니다', true);
          source.mode = 'mock';
          renderSourceBadge();
          state.ranked = AREAS.map(score).sort((a, b) => b.total - a.total);
          finish();
        });
    } else {
      setTimeout(() => {
        state.ranked = AREAS.map(score).sort((a, b) => b.total - a.total);
        finish();
      }, 1900);
    }
  }

  function barItem(label, val) {
    const g = grade(val);
    return `<div class="lb ${g.cls}" title="${label} ${Math.round(val)}점 · ${g.label}">
      <div class="t"><span>${label}</span><b>${Math.round(val)}</b></div>
      <div class="track"><div class="fill" style="width:${clamp(val)}%"></div></div>
    </div>`;
  }

  function renderRanking() {
    const I = ind(), G = GOALS.find(g => g.id === state.goal);
    const list = state.ranked.slice(0, TOP_N);
    $('#resultArea').innerHTML = `
      <div class="result-toolbar">
        <h2>추천 입지 <span class="cnt">TOP ${list.length}</span></h2>
        <div class="result-conds">
          <span class="chip">${icon(I.icon, 'icon icon-sm')} ${I.name}</span>
          <span class="chip">${state.area}평</span>
          <span class="chip">예산 ${won(state.budget)}</span>
          <span class="chip">${G.name}</span>
          <span class="chip">${MODES.find(m => m.id === state.serviceMode).name}</span>
        </div>
        <div class="right">
          <span class="sc-legend"><span>낮음</span><span class="ramp"></span><span>높음</span></span>
          <button class="btn btn-line btn-sm" id="btnRedo">${icon('refresh', 'icon icon-sm')} 조건 변경</button>
        </div>
      </div>
      ${list.map((r, idx) => cardHTML(r, idx)).join('')}
      <div class="list-note">
        ${icon('info')}
        <span>적합도 점수는 유동인구·업종적합도·교통·인프라·예산적합도·안정성 6개 지표에
        '${G.name}' 가중치를 적용해 산출합니다.
        <b>색상은 모든 지표에서 동일한 기준</b>을 따릅니다. 초록에 가까울수록 유리하고 빨강에 가까울수록 불리하며,
        임대료·경쟁밀도·폐업률처럼 낮을수록 좋은 지표는 뒤집어 적용합니다.
        베타 기간에는 검증용 표본 데이터가 사용됩니다.</span>
      </div>`;

    $('#btnRedo').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cardHTML(r, idx) {
    const a = r.area, s = r.sub, e = r.est;
    const g = grade(r.total);

    // 값이 낮을수록 좋은 지표는 뒤집어서 같은 색 기준을 적용
    const gComp = grade(invert(a.competition, 95, 45));     // 경쟁 밀도
    const gClose = grade(invert(a.closeRate, 14, 6));       // 폐업률
    const gRent = grade(invert(a.rentPerPy, 78, 26));       // 임대료
    const gCost = grade(s.cost);                            // 예산 대비 개설비용

    return `
    <article class="loc ${g.cls} ${idx === 0 ? 'top' : ''}">
      <div class="loc-head">
        <div class="loc-rank">${idx + 1}</div>
        <div>
          <div class="loc-name">${a.name}
            ${idx === 0 ? '<span class="badge badge-dark">BEST</span>' : ''}
            ${r.affordable ? '' : '<span class="badge badge-red">예산 초과</span>'}
          </div>
          <div class="loc-sub">${a.gu} · ${a.station} · 피크 ${a.peak}</div>
        </div>
        <div class="loc-score">
          <div class="n">${r.total}<small> /100</small></div>
          <div class="l">적합도</div>
          <div class="grade">${g.label}</div>
        </div>
      </div>

      <div class="loc-metrics">
        <div class="lm ${grade(s.foot).cls}"><div class="k">일 유동인구</div><div class="v graded">${comma(a.foot)}명</div></div>
        <div class="lm"><div class="k">배후 인구</div><div class="v">${comma(a.resident + a.office)}명</div></div>
        <div class="lm ${gRent.cls}"><div class="k">임대료(평당)</div><div class="v graded">${a.rentPerPy}만원</div></div>
        <div class="lm ${gCost.cls}"><div class="k">초기 개설비용</div><div class="v graded">${won(e.openingCost)}</div></div>
        <div class="lm ${gComp.cls}"><div class="k">경쟁 밀도</div><div class="v graded">${a.competition}점</div></div>
        <div class="lm ${gClose.cls}"><div class="k">폐업률</div><div class="v graded">${a.closeRate}%</div></div>
      </div>

      <div class="loc-bars">
        ${barItem(state.serviceMode === 'delivery' ? '배후수요' : '유동인구', s.foot)}
        ${barItem('업종적합', s.biz)}
        ${barItem('교통', s.transit)}
        ${barItem('인프라', s.infra)}
        ${barItem('안정성', s.risk)}
      </div>

      <div class="loc-reason">${icon('bulb')}<span>${reasonText(r)}</span></div>

      <div class="loc-foot">
        <button class="btn btn-dark btn-sm" data-report="${a.id}">${icon('file', 'icon icon-sm')} 분석 리포트</button>
        <div class="loc-tags">${a.tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>
      </div>
    </article>`;
  }

  /* ---------- 리포트 문서 ---------- */
  function openReport(areaId) {
    const r = state.ranked.find(x => x.area.id === areaId);
    if (!r) return;
    state.selected = r;
    const a = r.area;
    $('#reportModalSub').textContent =
      `${a.name} · ${a.gu} · ${ind().name} · 문서번호 ${docNo(a.id)}`;
    const wrap = $('#reportWrap');
    wrap.innerHTML = reportHTML(r);
    wrap.scrollTop = 0;
    bindReport(r);
    openDocModal();
  }

  /* ---------- 리포트 팝업 열고 닫기 ---------- */
  function onDocKey(e) { if (e.key === 'Escape') closeDocModal(); }

  function openDocModal() {
    const m = $('#reportModal');
    m.classList.add('open');
    // 뒤 페이지가 같이 스크롤되지 않도록 잠근다
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onDocKey);
    $('#btnCloseReport').focus();
  }

  function closeDocModal() {
    const m = $('#reportModal');
    m.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onDocKey);
    $('#reportWrap').innerHTML = '';
  }

  function reportHTML(r) {
    const a = r.area, e = r.est, I = ind();
    const rank = state.ranked.indexOf(r) + 1;
    const today = new Date().toLocaleDateString('ko-KR');
    const deep = !!state.deepUnlocked[a.id];

    return `
    <div class="doc" id="reportDoc">
      <div class="doc-brand">
        <span class="logo-mark">${icon('pin')}</span>
        <b>ZARIPICK · AI 입지 분석 리포트</b>
        <span class="docno">문서번호 ${docNo(a.id)}</span>
      </div>

      <div class="doc-title">
        <h2>${a.name}</h2>
        <div class="sub">${a.gu} · ${a.station} 일대 상권 분석</div>
      </div>
      <div class="doc-meta">
        <div><span>발행일</span><b>${today}</b></div>
        <div><span>추천 순위</span><b>${rank}위 / ${state.ranked.length}개 상권</b></div>
        <div><span>분석 업종</span><b>${I.name}</b></div>
        <div><span>운영 형태</span><b>${MODES.find(m => m.id === state.serviceMode).name}</b></div>
        <div><span>면적 / 예산</span><b>${state.area}평 · ${won(state.budget)}</b></div>
      </div>

      <!-- 1. 요약 -->
      <div class="doc-sec">
        <h3><span class="no">01</span> 종합 요약</h3>
        <div class="stat-grid">
          <div class="stat ${grade(r.total).cls}"><div class="l">AI 적합도 점수</div><div class="v graded">${r.total}</div><div class="d">100점 만점 · ${rank}위 · ${grade(r.total).label}</div></div>
          <div class="stat ${grade(r.sub.foot).cls}"><div class="l">일 평균 유동인구</div><div class="v graded">${comma(a.foot)}</div><div class="d ${a.footGrowth >= 0 ? 'up' : 'down'}">전년 대비 ${pct(a.footGrowth)}</div></div>
          <div class="stat ${grade(invert(a.closeRate, 14, 6)).cls}"><div class="l">${I.name} 폐업률</div><div class="v graded">${a.closeRate}%</div><div class="d">서울 평균 9.6%</div></div>
          <div class="stat ${grade(r.sub.cost).cls}"><div class="l">초기 개설비용</div><div class="v graded">${won(e.openingCost)}</div><div class="d">${r.affordable ? '예산 범위 내' : '예산 초과'}</div></div>
        </div>
        <div class="callout blue">${icon('bulb')}<span>${reasonText(r)}</span></div>
        <div class="callout">
          ${icon('info')}
          <span>본 리포트는 <b>관측된 상권 지표</b>와 <b>시세 기반 비용 추정</b>만 제공합니다.
          매출·수익 예측은 개별 점포의 운영 역량과 콘셉트에 따른 편차가 커 신뢰구간을 제시하기 어렵다고 판단해 포함하지 않았습니다.
          AI는 지표를 종합한 <b>추천 적합도 점수 산출</b>에만 사용됩니다.</span>
        </div>
      </div>

      <!-- 2. 지표 -->
      <div class="doc-sec">
        <h3><span class="no">02</span> 상권 지표 상세</h3>
        <table class="tbl">
          <tr><th style="width:84px">구분</th><th>지표</th><th class="num">값</th><th>해석</th></tr>
          <tr><td>유동인구</td><td>일 평균 통행량</td><td class="num">${comma(a.foot)}명</td><td class="dim">피크 ${a.peak}</td></tr>
          <tr><td>유동인구</td><td>배후 거주 / 직장 인구</td><td class="num">${comma(a.resident)} / ${comma(a.office)}명</td><td class="dim">${a.office > a.resident ? '오피스 중심 상권' : '주거 배후 중심 상권'}${state.serviceMode === 'delivery' ? ' · 배달 수요 기반' : ''}</td></tr>
          <tr><td>유동인구</td><td>주 연령대</td><td class="num">${Object.entries(a.ageMix).sort((x, y) => y[1] - x[1])[0][0]}</td><td class="dim">${Object.entries(a.ageMix).map(([k, v]) => `${k} ${v}%`).join(' · ')}</td></tr>
          <tr><td>상권</td><td>${I.name} 업종 적합도</td><td class="num">${a.fit[state.industry]}점</td><td class="dim">업종-상권 매칭 지수</td></tr>
          <tr><td>상권</td><td>${I.name} 매출지수</td><td class="num">${a.salesIdx[state.industry]}</td><td class="dim">서울 평균 = 100</td></tr>
          <tr><td>상권</td><td>경쟁 밀도 / 폐업률</td><td class="num">${a.competition}점 / ${a.closeRate}%</td><td class="dim">${a.competition >= 85 ? '경쟁 과열 구간' : a.competition <= 60 ? '진입 여지 있음' : '보통 수준'}</td></tr>
          <tr><td>교통</td><td>접근성 점수</td><td class="num">${a.transit}점</td><td class="dim">${a.station}</td></tr>
          <tr><td>인프라</td><td>생활 인프라 점수</td><td class="num">${a.infra}점</td><td class="dim">집객시설·공공시설 밀도</td></tr>
          <tr><td>부동산</td><td>평당 임대료</td><td class="num">${a.rentPerPy}만원</td><td class="dim">${state.area}평 기준 월 ${won(e.rentMonth)}</td></tr>
          <tr><td>부동산</td><td>보증금 / 권리금</td><td class="num">${won(e.depositMan)} / ${won(e.premiumMan)}</td><td class="dim">보증금은 월세×10 가정 · 권리금은 한국부동산원</td></tr>
          <tr><td>성장성</td><td>상권 성장 지수</td><td class="num">${a.growth}점</td><td class="dim">${a.growth >= 85 ? '확장 국면' : a.growth >= 70 ? '안정 국면' : '조정 국면'}</td></tr>
        </table>
      </div>

      <!-- 3. 개설비용 -->
      <div class="doc-sec">
        <h3><span class="no">03</span> 초기 개설비용 추정</h3>
        <table class="tbl">
          <tr><th>항목</th><th class="num">금액</th><th>산출 근거</th></tr>
          <tr><td>임차 보증금</td><td class="num">${won(e.depositMan)}</td><td class="dim">상권 평균 보증금 × 면적 환산</td></tr>
          <tr><td>권리금</td><td class="num">${won(e.premiumMan)}</td><td class="dim">한국부동산원 시도·업종 권리금 × 면적 환산</td></tr>
          <tr><td>인테리어</td><td class="num">${won(e.interiorMan)}</td><td class="dim">${I.name} 평당 ${I.interiorPerPy}만원 × ${state.area}평</td></tr>
          <tr><td>설비·집기</td><td class="num">${won(e.equipMan)}</td><td class="dim">인테리어비의 35% 적용</td></tr>
          <tr class="total"><td>초기 개설비용 합계</td><td class="num">${won(e.openingCost)}</td><td>${r.affordable ? '입력 예산 범위 내' : '입력 예산 초과'}</td></tr>
        </table>
        <div class="callout">
          ${icon('info')}
          <span>입력 예산 ${won(state.budget)} 대비 ${r.affordable
        ? `<b style="color:var(--green)">${won(state.budget - e.openingCost)} 여유</b>가 있습니다. 초기 운영자금으로 확보해 두는 것을 권장합니다.`
        : `<b style="color:var(--red)">${won(e.openingCost - state.budget)} 부족</b>합니다. 면적 축소 또는 자금 조달 계획이 필요합니다.`}</span>
        </div>
      </div>

      <!-- 4. 월 고정비 -->
      <div class="doc-sec">
        <h3><span class="no">04</span> 월 고정비 구조</h3>
        <table class="tbl">
          <tr><th>항목</th><th class="num">월 금액</th><th>산출 근거</th></tr>
          <tr><td>임차료</td><td class="num">${won(e.rentMonth)}</td><td class="dim">평당 ${a.rentPerPy}만원 × ${state.area}평 (상권 시세)</td></tr>
          <tr><td>인건비·재료비·기타 운영비</td><td class="num">${won(e.opMonth)}</td><td class="dim">${I.name} 업종 평균 운영비 × 면적 환산</td></tr>
          <tr class="total"><td>월 고정비 합계</td><td class="num">${won(e.rentMonth + e.opMonth)}</td><td>손익분기 판단 기준선</td></tr>
        </table>
        <div class="callout">
          ${icon('info')}
          <span>매출이 월 <b>${won(e.rentMonth + e.opMonth)}</b>을 넘어야 손익분기에 도달합니다.
          매출 추정치는 제공하지 않으므로, 이 고정비 수준을 감당할 수 있는지는
          동일 업종 실제 사례와 본인의 운영 계획을 기준으로 판단하세요.</span>
        </div>
      </div>

      <!-- 5. 심층 (5코인) -->
      <div class="doc-sec" id="deepSection">
        ${deep ? deepHTML(r) : lockedHTML()}
      </div>

      <div class="callout">
        ${icon('info')}
        <span>본 리포트의 상권 지표는 베타 검증용 표본 데이터이며, 비용 항목은 상권 시세에서 환산한 추정치로 실제 계약 조건과 다를 수 있습니다.
        매출·수익 예측은 제공하지 않습니다. 자리픽은 금융상품 판매·중개 및 투자 자문을 제공하지 않으며, 최종 의사결정의 책임은 이용자 본인에게 있습니다.</span>
      </div>
    </div>`;
  }

  function lockedHTML() {
    return `
    <div class="locked no-print">
      <div class="locked-ico">${icon('lock')}</div>
      <h3>심층 분석 리포트</h3>
      <p>자금 계획과 금융 수요를 함께 계산해 조달 조합과 상환 시나리오까지 설계합니다.</p>
      <div class="locked-feats">
        <span>${icon('wallet', 'icon icon-sm')} 총 소요자금 산출</span>
        <span>${icon('trenddown', 'icon icon-sm')} 부족자금 진단</span>
        <span>${icon('bank', 'icon icon-sm')} 금융상품 조합 추천</span>
        <span>${icon('calendar', 'icon icon-sm')} 상환 시뮬레이션</span>
        <span>${icon('clock', 'icon icon-sm')} 손익분기 예측</span>
        <span>${icon('map', 'icon icon-sm')} 실행 로드맵</span>
      </div>
      <button class="btn btn-brand btn-lg" id="btnUnlock">${icon('coin')} 5코인으로 열기</button>
      <p class="hint">보유 코인 ${getCoins()}개 · 열람 후 같은 세션에서는 재차감 없음</p>
    </div>`;
  }

  /* ---------- 심층 분석: 자금계획 + 금융 추천 ---------- */
  function financePlan(r) {
    const e = r.est;
    const need = e.total;                       // 총 소요자금
    const shortfall = Math.max(0, need - state.equity);
    const products = [];

    if (shortfall > 0) {
      const policyAmt = Math.min(7000, Math.round(shortfall * 0.5 / 100) * 100);
      products.push({ p: FIN_PRODUCTS[0], amt: policyAmt, rate: 3.4, months: 60, grace: 24, why: '업력 3년 미만 창업자 대상 최저금리 구간. 부족자금의 절반을 정책자금으로 우선 충당합니다.' });

      const rest1 = Math.max(0, shortfall - policyAmt);
      if (rest1 > 0) {
        const gAmt = Math.min(10000, Math.round(rest1 * (state.ageBand === 'young' ? 0.6 : 1) / 100) * 100);
        products.push({ p: FIN_PRODUCTS[1], amt: gAmt, rate: 4.6, months: 60, grace: 12, why: '담보 없이 보증서 발급으로 한도를 확보합니다. 보증료(연 0.8~1.2%)가 추가됩니다.' });

        const rest2 = Math.max(0, rest1 - gAmt);
        if (state.ageBand === 'young') {
          const yAmt = Math.min(10000, Math.max(rest2, Math.round(e.depositMan * 0.5 / 100) * 100));
          products.push({ p: FIN_PRODUCTS[3], amt: yAmt, rate: 1.5, months: 48, grace: 0, why: '만 39세 이하 청년 창업자 임차보증금 이자지원 대상입니다. 보증금 부담을 크게 낮출 수 있습니다.' });
        } else if (rest2 > 0) {
          products.push({ p: FIN_PRODUCTS[2], amt: Math.min(5000, Math.round(rest2 / 100) * 100), rate: 6.2, months: 36, grace: 0, why: '잔여 부족분 보완용. 금리가 높으므로 최소 한도로 활용하고 조기 상환을 권장합니다.' });
        }
      }
    }
    if (shortfall === 0) {
      products.push({ p: FIN_PRODUCTS[4], amt: 1000, rate: 7.5, months: 12, grace: 0, why: '자기자본으로 개설이 가능한 상태입니다. 운영 변동에 대비한 예비 한도만 확보해 두는 것을 권장합니다.' });
    }

    // 원리금 균등 월 상환액
    products.forEach(x => {
      const i = x.rate / 100 / 12, n = x.months - x.grace;
      x.monthly = Math.round(x.amt * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1));
      x.graceMonthly = Math.round(x.amt * i);
      x.interestTotal = Math.round(x.monthly * n - x.amt + x.graceMonthly * x.grace);
    });

    const raised = products.reduce((s, x) => s + x.amt, 0);
    const monthlyRepay = products.reduce((s, x) => s + x.monthly, 0);
    const graceRepay = products.reduce((s, x) => s + (x.grace > 0 ? x.graceMonthly : x.monthly), 0);
    return { need, shortfall, products, raised, monthlyRepay, graceRepay };
  }

  /** 서버 /api/deep 의 finance 응답을 화면이 쓰는 형태로 맞춘다 */
  function adaptFinance(fin) {
    return {
      ...fin,
      products: fin.products.map(p => ({
        p: { logo: p.logo, name: p.name, org: p.org, type: p.type, desc: p.desc, term: p.term, grace: p.grace },
        amt: p.amt, rate: p.rate, monthly: p.monthly,
        graceMonthly: p.graceMonthly, interestTotal: p.interestTotal, why: p.why,
      })),
    };
  }

  function deepHTML(r) {
    const a = r.area, e = r.est;
    // 서버 응답이 있으면 그 자금계획을 쓰고, 없으면 로컬 계산으로 폴백
    const api = state.deepData[a.id];
    const f = api ? adaptFinance(api.finance) : financePlan(r);
    const insight = api?.insight || null;
    const fixedCost = e.rentMonth + e.opMonth;
    // 매출을 예측하지 않으므로, 상환액을 포함한 '필요 손익분기 매출'로 표현
    const bepBefore = fixedCost;
    const bepGrace = fixedCost + f.graceRepay;
    const bepFull = fixedCost + f.monthlyRepay;
    const covered = f.raised + state.equity >= f.need;

    return `
    <h3><span class="no">05</span> 심층 분석 · 자금 계획과 금융 설계 <span class="badge badge-brand">PREMIUM</span>
      ${insight?.by === 'ai' ? '<span class="badge badge-blue">AI 해설</span>' : ''}</h3>

    ${insight?.summary ? `<div class="callout blue">${icon('sparkle')}<span>${insight.summary}</span></div>` : ''}

    <div class="doc-sub">5-1. 총 소요자금</div>
    <table class="tbl">
      <tr><th style="width:72px">구분</th><th>항목</th><th class="num">금액</th></tr>
      <tr><td rowspan="${e.premiumMan != null ? 4 : 3}">개설</td><td>임차 보증금 <span class="dim">(회수 가능)</span></td><td class="num">${won(e.depositMan)}</td></tr>
      ${e.premiumMan != null ? `<tr><td>권리금</td><td class="num">${won(e.premiumMan)}</td></tr>` : ''}
      <tr><td>인테리어</td><td class="num">${won(e.interiorMan)}</td></tr>
      <tr><td>설비·집기</td><td class="num">${won(e.equipMan)}</td></tr>
      <tr><td rowspan="2">운영</td><td>초기 운영자금 <span class="dim">(3개월 고정비)</span></td><td class="num">${won(e.reserve)}</td></tr>
      <tr><td>예비비 <span class="dim">(5%)</span></td><td class="num">${won(e.contingency)}</td></tr>
      <tr class="total"><td colspan="2">총 소요자금</td><td class="num">${won(f.need)}</td></tr>
      <tr><td colspan="2">보유 자기자본</td><td class="num">- ${won(state.equity)}</td></tr>
      <tr class="total"><td colspan="2">조달 필요 금액</td><td class="num" style="color:${f.shortfall > 0 ? 'var(--red)' : 'var(--green)'}">${f.shortfall > 0 ? won(f.shortfall) : '없음 (자기자본 충당 가능)'}</td></tr>
    </table>

    <div class="doc-sub">5-2. 맞춤형 금융서비스 추천</div>
    <p style="font-size:13px;color:var(--g600);margin-bottom:12px">
      ${f.shortfall > 0
        ? `조달 필요 금액 <b>${won(f.shortfall)}</b>을 금리가 낮은 순서로 배분한 조합입니다.
           ${state.ageBand === 'young' ? '만 39세 이하 청년 창업 요건을 반영했습니다.' : ''}`
        : '자기자본으로 개설이 가능합니다. 운영 리스크 대비 한도만 제안합니다.'}
    </p>
    ${f.products.map((x, i) => `
      <div class="fin ${i === 0 ? 'rec' : ''}">
        <div class="fin-logo">${x.p.logo}</div>
        <div style="flex:1;min-width:0">
          <div class="fin-name">
            ${x.p.name}
            ${i === 0 ? '<span class="badge badge-green">1순위 추천</span>' : ''}
            <span class="badge badge-blue">${x.p.type}</span>
          </div>
          <div class="fin-desc">${x.p.desc}</div>
          <div class="fin-why">${icon('arrow')}<span>${x.why}</span></div>
          <div class="fin-nums">
            <div><span>취급</span><b>${x.p.org}</b></div>
            <div><span>추천 실행액</span><b>${won(x.amt)}</b></div>
            <div><span>적용 금리</span><b>연 ${x.rate}%</b></div>
            <div><span>기간</span><b>${x.p.term}</b></div>
            <div><span>월 상환액</span><b>${comma(x.monthly)}만원</b>${x.grace ? ` <span>(거치 중 ${comma(x.graceMonthly)}만원)</span>` : ''}</div>
            <div><span>총 이자</span><b>${won(x.interestTotal)}</b></div>
          </div>
        </div>
      </div>`).join('') || '<div class="callout">추천할 금융상품이 없습니다.</div>'}

    <table class="tbl" style="margin-top:12px">
      <tr><th>합계</th><th class="num">금액</th><th>비고</th></tr>
      <tr><td>총 조달 금액</td><td class="num">${won(f.raised)}</td><td class="dim">${covered ? '총 소요자금 충당 가능' : '추가 자금 계획 필요'}</td></tr>
      <tr><td>거치기간 중 월 상환액</td><td class="num">${comma(f.graceRepay)}만원</td><td class="dim">이자만 납입하는 구간</td></tr>
      <tr class="total"><td>원리금 상환 시 월 부담</td><td class="num">${comma(f.monthlyRepay)}만원</td><td>거치 종료 후</td></tr>
    </table>
    ${insight?.funding ? `<div class="callout blue">${icon('bulb')}<span>${insight.funding}</span></div>` : ''}

    <div class="doc-sub">5-3. 상환 부담과 손익분기 매출</div>
    <div class="stat-grid">
      <div class="stat"><div class="l">월 고정비</div><div class="v">${won(bepBefore)}</div><div class="d">임차료 + 운영비</div></div>
      <div class="stat"><div class="l">거치기간 필요 매출</div><div class="v">${won(bepGrace)}</div><div class="d">이자만 납입 구간</div></div>
      <div class="stat"><div class="l">원리금 상환 필요 매출</div><div class="v">${won(bepFull)}</div><div class="d">거치 종료 후</div></div>
      <div class="stat"><div class="l">상환 부담 증가폭</div><div class="v">+${Math.round(f.monthlyRepay / bepBefore * 100)}%</div><div class="d">고정비 대비</div></div>
    </div>
    <div class="callout blue">
      ${icon('info')}
      <span>${insight?.breakEven || `차입을 반영하면 월 <b>${won(bepFull)}</b> 이상의 매출이 있어야 적자를 면합니다
      (거치기간에는 <b>${won(bepGrace)}</b>). 이는 상환 계획에서 역산한 <b>목표 매출선</b>이며,
      실제 달성 여부를 예측한 값이 아닙니다.
      ${f.monthlyRepay / bepBefore > 0.35
        ? '상환액이 고정비의 35%를 넘어 부담이 큰 구조입니다. 거치기간 연장이나 조달 규모 축소를 검토하세요.'
        : '상환액이 고정비 대비 안정적인 범위입니다.'}`}</span>
    </div>

    ${(() => {
      /* 필요 매출선 옆에 '실제로 이 동네 점포들이 얼마나 파는지'를 놓는다.
         예측이 아니라 대조다 — 목표선이 현실적인지 스스로 판단할 근거가 된다. */
      const mk = api?.시장;
      if (!mk?.점포당_월매출_만원) return '';
      const 평균 = mk.점포당_월매출_만원;
      const 배수 = bepFull / 평균;
      const 판정 = 배수 <= 0.7 ? ['green', '동네 평균 매출이 필요 매출선을 여유 있게 웃돕니다.']
                 : 배수 <= 1   ? ['blue',  '동네 평균 매출이 필요 매출선을 조금 웃도는 수준입니다.']
                 :               ['red',   '동네 평균 매출로는 필요 매출선에 못 미칩니다. 조달 규모나 임차 조건을 다시 보세요.'];
      return `
      <div class="doc-sub">5-3-1. 인근 실제 매출과 대조</div>
      <div class="stat-grid">
        <div class="stat"><div class="l">${mk.행정동} 점포당 월매출</div><div class="v">${won(평균)}</div><div class="d">카드매출 기반 추정</div></div>
        <div class="stat"><div class="l">필요 매출선</div><div class="v">${won(bepFull)}</div><div class="d">원리금 상환 포함</div></div>
        <div class="stat"><div class="l">필요/평균</div><div class="v">${Math.round(배수 * 100)}%</div><div class="d">100% 미만이면 여유</div></div>
        <div class="stat"><div class="l">행정동 내 점포</div><div class="v">${comma(mk.행정동_점포수 ?? mk.점포수)}개</div><div class="d">동일 업종</div></div>
      </div>
      <div class="callout ${판정[0] === 'red' ? 'red' : 'blue'}">
        ${icon(판정[0] === 'red' ? 'warn' : 'info')}
        <span>${판정[1]} 이 값은 <b>${mk.행정동} 전체 평균</b>이며 개별 점포의 예상 매출이 아닙니다.
        같은 동 안에서도 입지·규모에 따라 편차가 큽니다. (출처: 소상공인시장진흥공단)</span>
      </div>`;
    })()}

    <div class="doc-sub">5-4. 리스크 점검</div>
    ${insight?.risks?.length ? `<ul class="risk-list">
      ${insight.risks.map(t => `<li>${icon('warn', 'icon icon-sm')}<span>${t}</span></li>`).join('')}
    </ul>` : ''}
    <table class="tbl">
      <tr><th>리스크</th><th style="width:74px">수준</th><th>대응 제안</th></tr>
      ${[
        { n: '경쟁 심화', lv: a.competition >= 85 ? 2 : a.competition >= 70 ? 1 : 0,
          d: a.competition >= 85 ? '동일 업종 밀도가 높아 콘셉트·가격 차별화 없이는 초기 3개월 진입이 어렵습니다.' : '진입 여지가 있어 선점 전략이 유효합니다.' },
        { n: '임대료 상승', lv: a.rentPerPy >= 55 ? 2 : a.rentPerPy >= 38 ? 1 : 0,
          d: a.rentPerPy >= 55 ? '계약 시 임대료 인상률 상한 특약을 반드시 확인하세요.' : '고정비 부담이 상대적으로 낮아 방어력이 있습니다.' },
        { n: '수요 변동성', lv: a.footGrowth < 0 ? 2 : a.footGrowth < 4 ? 1 : 0,
          d: a.footGrowth < 0 ? '유동인구가 감소 추세입니다. 단기 계약 후 재평가를 권장합니다.' : '유동인구가 증가 추세로 수요 기반이 견고합니다.' },
        { n: '금리 변동', lv: f.raised > f.need * 0.5 ? 2 : f.raised > f.need * 0.3 ? 1 : 0,
          d: `차입 비중 ${Math.round(f.raised / f.need * 100)}%. 고정금리 상품 비중을 높이고 변동금리 1%p 상승 시 월 ${comma(Math.round(f.raised * 0.01 / 12))}만원 추가 부담을 감안하세요.` },
      ].map(x => {
        // 리스크는 낮을수록 좋으므로 색 기준을 뒤집는다
        const cls = ['s5', 's3', 's1'][x.lv], lab = ['낮음', '보통', '높음'][x.lv];
        return `<tr><td>${x.n}</td>
          <td><span class="lvl ${cls}">${lab}</span></td>
          <td class="dim">${x.d}</td></tr>`;
      }).join('')}
    </table>

    <div class="doc-sub">5-5. 실행 로드맵</div>
    <div class="timeline">
      <div class="tl"><h4>D-90 · 자금 조달 신청</h4><p>${f.products[0] ? f.products[0].p.org : '금융기관'} 상담 예약 및 사업계획서 준비. 정책자금은 접수 후 실행까지 4~8주가 소요됩니다.</p></div>
      <div class="tl"><h4>D-60 · 점포 실사 및 계약</h4><p>${a.name} 내 후보 점포 3곳 이상 임장. 요일·시간대별 실측 통행량을 데이터와 대조한 뒤 계약합니다.</p></div>
      <div class="tl"><h4>D-45 · 인허가 및 인테리어</h4><p>영업신고·위생교육 이수 후 시공 착수. 인테리어 예산 ${won(e.interiorMan)} 기준 3~5주 소요.</p></div>
      <div class="tl"><h4>D-14 · 시운영 및 마케팅</h4><p>${Object.entries(a.ageMix).sort((x, y) => y[1] - x[1])[0][0]} 비중이 높은 상권으로, 해당 연령대 채널 중심의 사전 홍보를 권장합니다.</p></div>
      <div class="tl"><h4>D-Day · 개업</h4><p>초기 운영자금 ${won(e.reserve)} 확보 상태 유지. 월 매출이 손익분기선 ${won(bepFull)}에 도달할 때까지 예비비를 소진하지 않도록 관리하세요.</p></div>
    </div>

    <div class="callout" style="margin-top:16px">
      ${icon('info')}
      <span>금리·한도·거치조건은 베타 검증용 가정값입니다. 실제 조건은 기관 심사 결과에 따라 결정되며,
      본 리포트는 금융상품 판매·중개나 투자 자문을 위한 자료가 아닙니다.</span>
    </div>`;
  }

  /* ---------- 리포트 액션 ---------- */
  function bindReport(r) {
    const a = r.area;
    $('#btnPdf').onclick = async () => {
      if (!state.pdfPaid[a.id]) {
        if (getCoins() < COST.pdf) {
          toast(`코인이 부족합니다. (필요 ${COST.pdf}코인)`, true);
          return openTopup();
        }
        const ok = await appConfirm({
          title: '리포트 PDF 저장',
          msg: `<b>${a.name}</b> 분석 리포트를 PDF 파일로 저장합니다.<br>같은 리포트는 이후 추가 차감 없이 다시 저장할 수 있습니다.`,
          cost: COST.pdf, okText: `${COST.pdf}코인 차감하고 저장`, icon: 'download',
        });
        if (!ok) return;
        spendCoins(COST.pdf, `PDF 저장 · ${a.name}`);
        state.pdfPaid[a.id] = true;
      } else {
        toast('이미 결제한 리포트입니다. 추가 차감 없이 저장합니다');
      }
      exportPdf(r);
    };

    const unlock = $('#btnUnlock');
    if (unlock) {
      unlock.onclick = async () => {
        if (getCoins() < COST.deep) {
          toast(`코인이 부족합니다. (필요 ${COST.deep}코인)`, true);
          return openTopup();
        }
        const ok = await appConfirm({
          title: '심층 분석 리포트 열람',
          msg: `<b>${a.name}</b>의 자금 계획·금융 조합·상환 시뮬레이션을 포함한 심층 분석을 엽니다.<br>같은 세션에서는 재차감 없이 다시 볼 수 있습니다.`,
          cost: COST.deep, okText: `${COST.deep}코인 차감하고 열람`, icon: 'lock',
        });
        if (!ok) return;
        spendCoins(COST.deep, `심층 분석 · ${a.name}`);
        state.deepUnlocked[a.id] = true;

        const sec = $('#deepSection');
        if (source.mode === 'api') {
          // 서버에서 자금계획 + (AI 또는 규칙) 인사이트를 받아온다
          sec.innerHTML = `<div class="loading" style="padding:48px 20px;text-align:center">
            <div class="progress-head">심층 분석을 생성하고 있습니다</div>
            <div class="progress-sub">${source.ai?.enabled ? 'AI가 자금 계획을 해석하는 중…' : '자금 계획을 계산하는 중…'}</div>
          </div>`;
          sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          try {
            const res = await window.ZP_API.deep({ areaId: a.id, ...conditions() });
            state.deepData[a.id] = res;
            sec.innerHTML = deepHTML(r);
            toast(res.insight.by === 'ai' ? 'AI 심층 분석이 생성되었습니다' : '심층 분석 리포트가 열렸습니다');
          } catch (err) {
            console.warn('[api] 심층 분석 실패, 로컬 계산으로 폴백:', err);
            sec.innerHTML = deepHTML(r);
            toast('서버 응답이 없어 로컬 계산 결과를 표시합니다', true);
          }
        } else {
          sec.innerHTML = deepHTML(r);
          toast('심층 분석 리포트가 열렸습니다');
          sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    }
  }

  /* ---------- 보관함 / 코인 내역 ---------- */
  function renderArchive() {
    const box = $('#archiveList');
    const ids = [...new Set([...Object.keys(state.deepUnlocked), ...Object.keys(state.pdfPaid)])];
    if (!ids.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="empty-ico">${icon('folder')}</div>
          <h3>보관된 리포트가 없습니다</h3>
          <p>입지 분석에서 리포트를 열람하거나 PDF로 저장하면 이곳에 표시됩니다.</p>
        </div>`;
      return;
    }
    box.innerHTML = ids.map(id => {
      const a = AREAS.find(x => x.id === id);
      const deep = state.deepUnlocked[id], pdf = state.pdfPaid[id];
      return `
      <div class="arch-item">
        <div class="arch-ico">${icon('file')}</div>
        <div>
          <div class="an">${a.name}</div>
          <div class="am">문서번호 ${docNo(id)} · ${deep ? '심층 분석 포함' : '기본 리포트'}${pdf ? ' · PDF 저장됨' : ''}</div>
        </div>
        <div class="right">
          ${deep ? '<span class="badge badge-brand">PREMIUM</span>' : ''}
          <button class="btn btn-line btn-sm" data-open="${id}">${icon('external', 'icon icon-sm')} 열기</button>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-open]').forEach(b =>
      b.addEventListener('click', () => {
        showView('analyze');
        openReport(b.dataset.open);
      }));
  }

  function renderWallet() {
    const w = loadWallet();
    const box = $('#walletList');
    const rows = w.log.map(l => `
      <tr>
        <td>${new Date(l.t).toLocaleString('ko-KR')}</td>
        <td>${l.memo}</td>
        <td class="num" style="color:var(--red)">${l.n}</td>
      </tr>`).join('');
    box.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div><h3>${w.month} 내역</h3><div class="sub">잔액 ${w.balance}코인 / 월 ${MONTHLY_FREE}코인</div></div>
        </div>
        <table class="tbl">
          <tr><th>일시</th><th>내역</th><th class="num" style="width:70px">코인</th></tr>
          <tr>
            <td>${w.month}-01 00:00</td>
            <td>월간 무료 코인 지급</td>
            <td class="num" style="color:var(--green)">+${MONTHLY_FREE}</td>
          </tr>
          ${rows}
        </table>
      </div>`;
  }

  /* ---------- 데이터 소스 배지 ---------- */
  function renderSourceBadge() {
    const el = $('#dataStamp');
    if (!el) return;
    if (source.mode === 'api') {
      const d = source.data, ai = source.ai || {};
      el.className = 'data-stamp';
      el.innerHTML = `<span class="dot"></span>
        <b>실데이터</b> SEOUL DB · 상권 ${comma(d.areaCount)}개 · ${d.quarters.foot?.slice(0, 4)}년 ${d.quarters.foot?.slice(4)}분기
        <span class="badge ${ai.enabled ? 'badge-blue' : 'badge-gray'}" style="margin-left:6px">
          ${ai.enabled ? 'AI 해설 ON' : '규칙 기반'}</span>`;
      el.title = ai.note || '';
    } else {
      el.className = 'data-stamp offline';
      el.innerHTML = `<span class="dot"></span>
        <b>목업 데이터</b> · 서버 미연결
        <span class="badge badge-gray" style="margin-left:6px">규칙 기반</span>`;
      el.title = 'server 폴더에서 npm start 를 실행하면 SEOUL DB 실데이터로 전환됩니다.';
    }
    const scope = $('#scopeNote');
    if (scope) {
      scope.textContent = source.mode === 'api'
        ? `서울 ${comma(source.data.areaCount)}개 상권 (${source.data.areaTypes.join('·')})`
        : '서울 15개 주요 상권 (목업)';
    }
  }

  /* ---------- init ---------- */
  // 결과 카드 → 리포트 (위임 이벤트, 1회만 바인딩)
  $('#resultArea').addEventListener('click', e => {
    const b = e.target.closest('[data-report]');
    if (b) openReport(b.dataset.report);
  });

  // 리포트 팝업 닫기 (버튼 · 백드롭 클릭)
  $('#btnCloseReport').addEventListener('click', closeDocModal);
  $('#reportModal').addEventListener('click', e => {
    if (e.target === $('#reportModal')) closeDocModal();
  });

  buildOptions();
  bindInputs();
  syncBudgetLabel();
  renderCoins();
  renderSourceBadge();

  // 서버가 있으면 실데이터로 전환 (없으면 목업 그대로 사용)
  if (window.ZP_API) {
    window.ZP_API.connect().then(meta => {
      if (!meta) return;
      INDUSTRIES = meta.industries;
      GOALS = meta.goals;
      MODES = meta.modes;
      source.mode = 'api';
      source.ai = meta.ai;
      source.data = meta.data;
      // 서버 목록에 없는 업종이 선택돼 있으면 첫 항목으로 되돌린다
      if (!INDUSTRIES.some(i => i.id === state.industry)) state.industry = INDUSTRIES[0].id;
      buildOptions();
      renderSourceBadge();
      loadScope();          // 지원 지역·분석 등급 로드
    }).catch(() => { /* 목업 유지 */ });
  }
  loadScope();              // 서버가 없어도 서울만 노출해 화면이 비지 않게 한다

  /* 입지 어드바이저 패널(chat.js)이 현재 화면 조건을 기본값으로 쓸 수 있게
     읽기 전용으로 최소한만 노출한다. 상태 변경은 여기서 하지 않는다. */
  window.ZP_APP = {
    conditions,
    topAreas: () => state.ranked.slice(0, 5).map(r => r.area && r.area.name).filter(Boolean),
  };
})();
