/* ============================================================
 *  자리픽 서버 테스트 러너 (의존성 0)
 *
 *    npm test
 *
 *  실제 API 키 없이 세 프로바이더(Gemini/GPT/Claude)의
 *  tool-calling 포맷 변환과 폴백 체인을 검증한다.
 *  모델명이나 프로바이더를 바꾼 뒤에는 이 테스트를 먼저 돌려 보라.
 * ============================================================ */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE_FILE = resolve(HERE, 'providers.mjs');
const PORT = 8899;
const DEAD = 'http://127.0.0.1:9';        // 아무도 듣지 않는 포트
const MOCK = `http://127.0.0.1:${PORT}`;

const CASES = [
  { name: 'Gemini 도구 호출',        env: { AI_PROVIDER: 'gemini',    ZP_TEST_PROVIDER: 'gemini',
          GEMINI_API_KEY: 'test',    GEMINI_BASE_URL: MOCK } },
  { name: 'GPT 도구 호출',           env: { AI_PROVIDER: 'openai',    ZP_TEST_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test',    OPENAI_BASE_URL: MOCK } },
  { name: 'Claude 도구 호출',        env: { AI_PROVIDER: 'anthropic', ZP_TEST_PROVIDER: 'anthropic',
          ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: MOCK } },
  { name: 'Gemini 장애 → GPT 전환',  env: { AI_PROVIDER: 'auto', AI_PROVIDER_ORDER: 'gemini,openai',
          ZP_TEST_PROVIDER: 'openai', AI_TIMEOUT_MS: '3000',
          GEMINI_API_KEY: 'test', GEMINI_BASE_URL: DEAD,
          OPENAI_API_KEY: 'test', OPENAI_BASE_URL: MOCK } },
];

function run(c) {
  return new Promise(res => {
    const p = spawn(process.execPath, ['--no-warnings', CASE_FILE], {
      env: { ...process.env, ZP_TEST_PORT: String(PORT), ...c.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    p.on('close', code => res({ code, out }));
  });
}

let failed = 0;
console.log('자리픽 서버 테스트\n');
for (const c of CASES) {
  const { code, out } = await run(c);
  const detail = out.split('\n').filter(l => l.trim() && !/^\[(server|llm|agent|api)\]/.test(l));
  if (code === 0) {
    console.log(`  ✓ ${c.name}`);
  } else {
    failed++;
    console.log(`  ✗ ${c.name}`);
    detail.forEach(l => console.log(`      ${l.trim()}`));
  }
}

console.log(failed ? `\n${failed}건 실패` : `\n전체 ${CASES.length}건 통과`);
process.exit(failed ? 1 : 0);
