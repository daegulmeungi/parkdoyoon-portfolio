/* ============================================================
 *  입지 어드바이저 (AI 에이전트 패널)
 *
 *  · POST /api/chat 으로 대화를 보내고 도구 실행 흔적과 함께 답을 렌더한다.
 *  · 서버가 없으면 패널을 열되 안내 문구를 띄운다(목업만으로는 상담 불가).
 *  · 화면에서 설정한 분석 조건을 context 로 함께 넘겨 "거기" 같은 지시어를
 *    에이전트가 해석할 수 있게 한다.
 * ============================================================ */
(function () {
  const $ = id => document.getElementById(id);

  const fab = $('chatFab'), panel = $('chatPanel'), backdrop = $('chatBackdrop');
  const logEl = $('chatLog'), sugsEl = $('chatSugs'), statusEl = $('chatStatus');
  const form = $('chatForm'), textEl = $('chatText'), sendBtn = $('chatSend');
  if (!panel || !form) return;

  /* 대화 이력. 서버에는 이 배열을 그대로 보낸다(최근 12턴만 서버가 사용) */
  let history = [];
  let busy = false;

  const DEFAULT_SUGS = [
    '강남에서 1억 5천으로 카페 자리 찾아줘',
    '성수동 카페 상권 어때?',
    '5천만원으로 편의점 하려는데 자금 얼마나 필요해?',
    '적합도 점수는 어떻게 계산해?',
  ];

  /* ---------- 안전한 렌더링 ----------
     서버 답변에는 <b> 강조가 들어온다. 그대로 innerHTML 에 넣으면 XSS 위험이 있으므로
     전부 이스케이프한 뒤 <b> 만 되살린다. */
  function safeHtml(s) {
    const esc = String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
  }

  const icon = (n, cls) => `<svg class="icon ${cls || ''}"><use href="#i-${n}"/></svg>`;

  /* ---------- 메시지 렌더 ---------- */
  function addMsg(role, html, opts = {}) {
    const el = document.createElement('div');
    el.className = `msg ${role === 'user' ? 'me' : 'ai'}`;

    let inner = '';
    if (opts.trace && opts.trace.length) {
      inner += `<div class="msg-trace">` + opts.trace.map(t =>
        `<span class="trace-chip${t.ok ? '' : ' bad'}">${icon(t.ok ? 'check' : 'warn')}${safeHtml(t.label)}</span>`
      ).join('') + `</div>`;
    }
    inner += `<div class="msg-body">${html}</div>`;
    if (opts.by) inner += `<div class="msg-by">${safeHtml(opts.by)}</div>`;

    el.innerHTML = inner;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'msg ai';
    el.innerHTML = `<div class="msg-body"><span class="chat-typing"><i></i><i></i><i></i></span></div>`;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    return el;
  }

  /* ---------- 추천 질문 ---------- */
  function renderSugs(list) {
    sugsEl.innerHTML = '';
    if (!list || !list.length) return;
    for (const s of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sug';
      b.textContent = s;
      b.addEventListener('click', () => { textEl.value = s; submit(); });
      sugsEl.appendChild(b);
    }
  }

  /* ---------- 상태 표시 ---------- */
  function renderStatus() {
    const api = window.ZP_API;
    if (!api || !api.isOnline()) {
      statusEl.textContent = '서버 미연결 · 상담 불가';
      statusEl.className = 'chat-status off';
      return false;
    }
    const ai = (api.meta() || {}).ai || {};
    if (ai.enabled) {
      statusEl.textContent = `${ai.providerLabel || 'AI'} · ${ai.model || ''}`;
      statusEl.className = 'chat-status on';
    } else {
      statusEl.textContent = '규칙 기반 모드 (API 키 없음)';
      statusEl.className = 'chat-status off';
    }
    return true;
  }

  /* ---------- 첫 인사 ---------- */
  function greet() {
    logEl.innerHTML = '';
    history = [];
    const online = renderStatus();

    if (!online) {
      addMsg('assistant',
        `입지 어드바이저는 <b>분석 서버가 실행 중</b>일 때만 사용할 수 있습니다.<br>` +
        `<code>npm start</code> 로 서버를 켠 뒤 새로고침해 주세요.`);
      renderSugs([]);
      return;
    }

    const ai = (window.ZP_API.meta() || {}).ai || {};
    addMsg('assistant',
      `안녕하세요. 서울 <b>1,030개 상권</b> 데이터로 창업 자리와 자금 계획을 상담해 드립니다.<br>` +
      `업종과 예산을 알려주시면 바로 분석해 드릴게요.` +
      (ai.enabled ? '' : `<br><br>지금은 API 키가 없어 <b>규칙 기반 모드</b>로 동작합니다. 기능은 같지만 답변이 정형화되어 있습니다.`));

    const meta = window.ZP_API.meta() || {};
    renderSugs((meta.agent && meta.agent.suggestions) || DEFAULT_SUGS);
  }

  /* ---------- 전송 ---------- */
  async function submit() {
    if (busy) return;
    const text = (textEl.value || '').trim();
    if (!text) return;

    const api = window.ZP_API;
    if (!api || !api.isOnline()) {
      addMsg('assistant', '분석 서버에 연결되어 있지 않아 상담을 진행할 수 없습니다.');
      return;
    }

    busy = true;
    sendBtn.disabled = true;
    textEl.value = '';
    autoGrow();
    renderSugs([]);

    addMsg('user', safeHtml(text));
    history.push({ role: 'user', content: text });
    const typing = addTyping();

    /* 화면에서 설정한 조건을 함께 넘긴다 */
    const app = window.ZP_APP;
    const context = app ? { cond: app.conditions(), topAreas: app.topAreas() } : null;

    try {
      const res = await api.chat(history, context);
      typing.remove();

      const byLabel = res.by === 'ai'
        ? `${(res.ai && res.ai.providerLabel) || 'AI'} 응답${res.elapsedMs ? ` · ${(res.elapsedMs / 1000).toFixed(1)}초` : ''}`
        : res.by === 'rule-fallback'
          ? 'AI 호출 실패 → 규칙 기반으로 응답'
          : '규칙 기반 응답';

      addMsg('assistant', safeHtml(res.reply), { trace: res.trace, by: byLabel });
      history.push({ role: 'assistant', content: res.reply });

      // 이력이 길어지면 앞부분을 버린다(서버도 12턴만 사용)
      if (history.length > 16) history = history.slice(-16);
    } catch (e) {
      typing.remove();
      addMsg('assistant',
        `응답을 받지 못했습니다. (${safeHtml(e.message || '네트워크 오류')})<br>` +
        `잠시 후 다시 시도해 주세요.`);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      textEl.focus();
    }
  }

  /* ---------- 열기/닫기 ---------- */
  function open() {
    panel.hidden = false;
    // 데스크톱에서는 화면을 가리지 않도록 배경을 깔지 않는다
    backdrop.hidden = window.innerWidth > 640;
    fab.classList.add('is-hidden');
    if (!logEl.children.length) greet();
    else renderStatus();
    setTimeout(() => textEl.focus(), 60);
  }

  function close() {
    panel.hidden = true;
    backdrop.hidden = true;
    fab.classList.remove('is-hidden');
  }

  /* ---------- 입력창 자동 높이 ---------- */
  function autoGrow() {
    textEl.style.height = 'auto';
    textEl.style.height = Math.min(120, textEl.scrollHeight) + 'px';
  }

  /* ---------- 이벤트 ---------- */
  fab.addEventListener('click', open);
  $('chatClose').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  $('navChat').addEventListener('click', open);
  $('chatReset').addEventListener('click', greet);

  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  textEl.addEventListener('input', autoGrow);
  textEl.addEventListener('keydown', e => {
    // Enter 전송, Shift+Enter 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  /* 서버 연결이 끝난 뒤 상태 배지를 갱신한다 (api.js 의 connect 는 비동기) */
  setTimeout(renderStatus, 1200);
  setTimeout(renderStatus, 3000);
})();
