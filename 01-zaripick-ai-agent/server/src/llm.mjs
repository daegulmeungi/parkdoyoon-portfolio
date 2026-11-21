/* ============================================================
 *  LLM 프로바이더 추상화 (Gemini · GPT · Claude)
 *
 *  세 회사의 tool-calling 포맷이 전부 다르므로, 서비스 코드는
 *  아래 '중립 포맷'만 쓰고 변환은 이 파일에서만 한다.
 *
 *  중립 메시지 포맷
 *    { role:'user',      content:'...' }
 *    { role:'assistant', content:'...', toolCalls?:[{id,name,args}] }
 *    { role:'tool',      toolCallId, name, content:'...' }   // 도구 실행 결과
 *
 *  chat() 반환
 *    { text, toolCalls:[{id,name,args}], provider, model, stopReason }
 *
 *  의존성 0 — fetch 만 사용한다.
 * ============================================================ */
import { config, availableProviders } from './config.mjs';

/* ---------- 공통 유틸 ---------- */

async function postJson(url, { headers, body, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.bodyText = text;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

const safeParse = s => {
  if (typeof s !== 'string') return s || {};
  try { return JSON.parse(s); } catch { return {}; }
};

/* Gemini 는 JSON Schema 전체가 아니라 OpenAPI 부분집합만 받는다.
   지원하지 않는 키워드가 섞이면 400을 내므로 화이트리스트로 정리하고
   type 은 대문자로 바꾼다(구버전 호환). */
function toGeminiSchema(s) {
  if (!s || typeof s !== 'object') return undefined;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toGeminiSchema(v);
  }
  if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  return out;
}

/* ============================================================
 *  1) Gemini  —  POST /v1beta/models/{model}:generateContent?key=
 * ============================================================ */
const gemini = {
  id: 'gemini',

  build(cfg, { system, messages, tools }) {
    const contents = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        // Gemini 는 tool_call_id 개념이 없어 함수명으로 결과를 잇는다
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }],
        });
      } else if (m.role === 'assistant') {
        const parts = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.toolCalls || []) parts.push({ functionCall: { name: tc.name, args: tc.args || {} } });
        if (parts.length) contents.push({ role: 'model', parts });
      } else {
        contents.push({ role: 'user', parts: [{ text: m.content || '' }] });
      }
    }

    const body = {
      contents,
      generationConfig: { maxOutputTokens: config.ai.maxTokens, temperature: 0.3 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (tools?.length) {
      body.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: toGeminiSchema(t.parameters),
        })),
      }];
    }
    return {
      url: `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`,
      headers: {},
      body,
    };
  },

  parse(data) {
    const cand = data.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts.filter(p => p.text).map(p => p.text).join('').trim();
    const toolCalls = parts
      .filter(p => p.functionCall)
      .map((p, i) => ({ id: `gem_${i}_${p.functionCall.name}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
    return { text, toolCalls, stopReason: cand?.finishReason || null };
  },
};

/* ============================================================
 *  2) OpenAI  —  POST /v1/chat/completions
 * ============================================================ */
const openai = {
  id: 'openai',

  build(cfg, { system, messages, tools }, { tokenField = 'max_tokens' } = {}) {
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    for (const m of messages) {
      if (m.role === 'tool') {
        msgs.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' });
      } else if (m.role === 'assistant') {
        const a = { role: 'assistant', content: m.content || null };
        if (m.toolCalls?.length) {
          a.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          }));
        }
        msgs.push(a);
      } else {
        msgs.push({ role: 'user', content: m.content || '' });
      }
    }

    const body = { model: cfg.model, messages: msgs, [tokenField]: config.ai.maxTokens };
    if (tools?.length) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    return {
      url: `${cfg.baseUrl}/chat/completions`,
      headers: { authorization: `Bearer ${cfg.key}` },
      body,
    };
  },

  parse(data) {
    const msg = data.choices?.[0]?.message || {};
    return {
      text: (msg.content || '').trim(),
      toolCalls: (msg.tool_calls || []).map(tc => ({
        id: tc.id, name: tc.function?.name, args: safeParse(tc.function?.arguments),
      })),
      stopReason: data.choices?.[0]?.finish_reason || null,
    };
  },
};

/* ============================================================
 *  3) Anthropic  —  POST /v1/messages
 * ============================================================ */
const anthropic = {
  id: 'anthropic',

  build(cfg, { system, messages, tools }) {
    const msgs = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        // 연속된 tool_result 는 하나의 user 턴으로 합쳐야 한다
        const prev = msgs[msgs.length - 1];
        const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content ?? '' };
        if (prev && prev.role === 'user' && Array.isArray(prev.content)) prev.content.push(block);
        else msgs.push({ role: 'user', content: [block] });
      } else if (m.role === 'assistant') {
        const blocks = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls || []) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} });
        }
        if (blocks.length) msgs.push({ role: 'assistant', content: blocks });
      } else {
        msgs.push({ role: 'user', content: m.content || '' });
      }
    }

    const body = { model: cfg.model, max_tokens: config.ai.maxTokens, messages: msgs };
    if (system) body.system = system;
    if (tools?.length) {
      body.tools = tools.map(t => ({
        name: t.name, description: t.description, input_schema: t.parameters,
      }));
    }
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body,
    };
  },

  parse(data) {
    const blocks = data.content || [];
    return {
      text: blocks.filter(b => b.type === 'text').map(b => b.text).join('').trim(),
      toolCalls: blocks.filter(b => b.type === 'tool_use')
                       .map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
      stopReason: data.stop_reason || null,
    };
  },
};

const ADAPTERS = { gemini, openai, anthropic };

/* ============================================================
 *  단일 프로바이더 호출
 * ============================================================ */
async function callOne(id, req) {
  const cfg = config.ai.providers[id];
  const ad = ADAPTERS[id];
  if (!ad || !cfg?.key) throw new Error(`프로바이더 '${id}' 사용 불가 (키 없음)`);

  let built = ad.build(cfg, req);
  let data;
  try {
    data = await postJson(built.url, { ...built, timeoutMs: config.ai.timeoutMs });
  } catch (e) {
    /* 최신 OpenAI 계열 모델은 max_tokens 대신 max_completion_tokens 를 받는다.
       해당 사유의 400 이면 필드만 바꿔 한 번 더 시도한다. */
    if (id === 'openai' && e.status === 400 && /max_completion_tokens/.test(e.bodyText || '')) {
      built = ad.build(cfg, req, { tokenField: 'max_completion_tokens' });
      data = await postJson(built.url, { ...built, timeoutMs: config.ai.timeoutMs });
    } else {
      throw e;
    }
  }

  const parsed = ad.parse(data);
  return { ...parsed, provider: id, model: cfg.model, label: cfg.label };
}

/* ============================================================
 *  공개 API
 * ============================================================ */

/**
 * 대화 1턴 호출. auto 모드에서 실패하면 다음 프로바이더로 넘어간다.
 * @param {{system?:string, messages:Array, tools?:Array, provider?:string}} req
 */
export async function chat(req) {
  const list = req.provider && req.provider !== 'auto'
    ? [req.provider].filter(id => config.ai.providers[id]?.key)
    : availableProviders();

  if (!list.length) throw new Error('등록된 AI API 키가 없습니다');

  const errors = [];
  for (const id of list) {
    try {
      return await callOne(id, req);
    } catch (e) {
      const msg = e.name === 'AbortError' ? `타임아웃 ${config.ai.timeoutMs}ms` : e.message;
      errors.push(`${id}: ${msg}`);
      console.warn(`[llm] ${id} 실패 → ${msg}`);
      if (!config.ai.failover) break;
    }
  }
  throw new Error(`모든 프로바이더 실패 [${errors.join(' | ')}]`);
}

/** 도구 없이 텍스트만 받는 단순 호출 (기존 해설 생성용) */
export async function complete(system, user, provider) {
  const r = await chat({ system, messages: [{ role: 'user', content: user }], provider });
  return r.text;
}

/** 현재 AI 구성 상태 */
export function llmStatus() {
  const list = availableProviders();
  const P = config.ai.providers;
  return {
    enabled: list.length > 0,
    active: list[0] || null,
    activeLabel: list[0] ? P[list[0]].label : null,
    model: list[0] ? P[list[0]].model : null,
    chain: list.map(id => ({ id, label: P[id].label, model: P[id].model })),
    registered: Object.keys(P).filter(id => P[id].key),
    failover: config.ai.failover && list.length > 1,
  };
}
