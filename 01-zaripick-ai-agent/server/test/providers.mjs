/* 프로바이더별 tool-calling 왕복 검증
 *
 *  실제 API 키 없이 llm.mjs 의 포맷 변환이 맞는지 확인한다.
 *  각 회사 응답 형태를 흉내내는 모의 서버를 띄우고
 *   1턴: 도구 호출을 지시  → 에이전트가 도구를 실행해야 함
 *   2턴: 도구 결과를 받아 최종 문장 반환
 *  2턴 요청 본문에 '도구 결과'가 각 회사 규격대로 담겼는지 검사한다.
 *
 *  실행:  npm test
 */
import { createServer } from 'node:http';

const PROVIDER = process.env.ZP_TEST_PROVIDER;
const PORT = Number(process.env.ZP_TEST_PORT || 8899);

const captured = [];

/* ---------- 모의 서버 ---------- */
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const parsed = body ? JSON.parse(body) : {};
    captured.push({ url: req.url, headers: req.headers, body: parsed });
    const turn = captured.length;

    let out;
    if (PROVIDER === 'gemini') {
      out = turn === 1
        ? { candidates: [{ content: { role: 'model', parts: [
              { functionCall: { name: 'search_areas', args: { industry: 'cafe', budget: 15000, top: 3 } } } ] },
            finishReason: 'STOP' }] }
        : { candidates: [{ content: { role: 'model', parts: [{ text: '역삼역이 가장 적합합니다.' }] },
            finishReason: 'STOP' }] };
    } else if (PROVIDER === 'openai') {
      out = turn === 1
        ? { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
              tool_calls: [{ id: 'call_1', type: 'function',
                function: { name: 'search_areas', arguments: JSON.stringify({ industry: 'cafe', budget: 15000, top: 3 }) } }] } }] }
        : { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '역삼역이 가장 적합합니다.' } }] };
    } else {
      out = turn === 1
        ? { stop_reason: 'tool_use', content: [
              { type: 'tool_use', id: 'toolu_1', name: 'search_areas',
                input: { industry: 'cafe', budget: 15000, top: 3 } }] }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: '역삼역이 가장 적합합니다.' }] };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

await new Promise(r => srv.listen(PORT, r));

/* ---------- 에이전트 실행 ---------- */
const { runAgent } = await import('../src/agent.mjs');
const r = await runAgent({ messages: [{ role: 'user', content: '강남에서 1억 5천으로 카페 자리 찾아줘' }] });

/* ---------- 검증 ---------- */
const fail = [];
const ok = (cond, label) => { if (!cond) fail.push(label); };

ok(captured.length === 2, `호출 2회 기대, 실제 ${captured.length}회`);
ok(r.by === 'ai', `by='ai' 기대, 실제 '${r.by}'`);
ok(/역삼역/.test(r.reply), '최종 문장 전달');
ok(r.trace.length === 1 && r.trace[0].name === 'search_areas' && r.trace[0].ok, '도구 1회 실행·성공');

const req1 = captured[0]?.body || {};
const req2 = captured[1]?.body || {};

if (PROVIDER === 'gemini') {
  ok(Array.isArray(req1.tools?.[0]?.functionDeclarations), '1턴: functionDeclarations 전달');
  ok(req1.tools[0].functionDeclarations.some(f => f.name === 'search_areas'), '1턴: search_areas 선언 포함');
  ok(req1.systemInstruction?.parts?.[0]?.text, '1턴: systemInstruction 전달');
  const t = req1.tools[0].functionDeclarations.find(f => f.name === 'search_areas');
  ok(t.parameters?.type === 'OBJECT', `Gemini 스키마 type 대문자 (실제 ${t.parameters?.type})`);
  ok(!JSON.stringify(t.parameters).includes('additionalProperties'), 'Gemini 미지원 키워드 제거');
  const fr = req2.contents?.find(c => c.parts?.some(p => p.functionResponse));
  ok(!!fr, '2턴: functionResponse 파트 포함');
  ok(fr?.parts[0].functionResponse.name === 'search_areas', '2턴: 함수명 일치');
  ok(req2.contents?.some(c => c.role === 'model' && c.parts.some(p => p.functionCall)), '2턴: model 턴에 functionCall 보존');
} else if (PROVIDER === 'openai') {
  ok(req1.tools?.[0]?.type === 'function', '1턴: tools[].type=function');
  ok(req1.messages?.[0]?.role === 'system', '1턴: system 메시지 선두');
  const toolMsg = req2.messages?.find(m => m.role === 'tool');
  ok(!!toolMsg, '2턴: role=tool 메시지 포함');
  ok(toolMsg?.tool_call_id === 'call_1', '2턴: tool_call_id 일치');
  const asst = req2.messages?.find(m => m.role === 'assistant' && m.tool_calls);
  ok(!!asst, '2턴: assistant.tool_calls 보존');
  ok(typeof asst?.tool_calls[0].function.arguments === 'string', '2턴: arguments 문자열 직렬화');
} else {
  ok(Array.isArray(req1.tools) && req1.tools[0].input_schema, '1턴: input_schema 형식');
  ok(typeof req1.system === 'string', '1턴: system 최상위 필드');
  const userTurn = req2.messages?.find(m => Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result'));
  ok(!!userTurn, '2턴: tool_result 블록 포함');
  ok(userTurn?.content[0].tool_use_id === 'toolu_1', '2턴: tool_use_id 일치');
  ok(req2.messages?.some(m => m.role === 'assistant' && m.content.some(b => b.type === 'tool_use')), '2턴: tool_use 보존');
}

srv.close();
const label = PROVIDER.padEnd(9);
if (fail.length) {
  console.log(`✗ ${label} 실패 ${fail.length}건`);
  fail.forEach(f => console.log(`    · ${f}`));
  process.exit(1);
} else {
  console.log(`✓ ${label} 통과  (호출 ${captured.length}회 · 도구 ${r.trace.map(t => t.name).join(',')} · 응답 "${r.reply.slice(0, 20)}")`);
}
