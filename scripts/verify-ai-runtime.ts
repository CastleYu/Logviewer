import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AiRuntime } from '../server/services/aiRuntime';
import { AiConnection, AiConnectionError } from '../server/services/aiConnection';
import { AiConnectStage, type AiConfig } from '../src/config/aiTypes';

const fakeServer = `const http=require('http');const s=http.createServer((q,r)=>{const auth='Basic '+Buffer.from(process.env.OPENCODE_SERVER_USERNAME+':'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');if(q.headers.authorization!==auth){r.writeHead(401);return r.end()}r.setHeader('content-type','application/json');r.end(JSON.stringify({directory:new URL('http://x'+q.url).searchParams.get('directory')}))});s.listen(Number(process.argv[process.argv.indexOf('--port')+1]),'127.0.0.1');`;
const base: AiConfig = { endpoint: '', executable: 'fake-serve', username: 'tester' };

async function run(): Promise<void> {
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-runtime-'));
  const children: ChildProcess[] = [];
  const runtime = new AiRuntime({ spawn: (_file, args, options) => { const child = spawn(process.execPath, ['-e', fakeServer, ...args], options); children.push(child); return child; } });
  let response = 'valid';
  const existing = http.createServer((req, res) => {
    if (response === 'auth') { res.writeHead(401); res.end(); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ directory: response === 'wrong' ? other : new URL(`http://x${req.url}`).searchParams.get('directory') }));
  });
  await new Promise<void>((resolve) => existing.listen(0, '127.0.0.1', resolve));
  const port = (existing.address() as { port: number }).port;
  process.env.LV_QA_IP = '127.0.0.1'; process.env.LV_QA_PORT = String(port);
  try {
    const external = await runtime.start(process.cwd(), { ...base, endpoint: '%LV_QA_IP%:${LV_QA_PORT}', launch: true });
    assert.equal(external.managed, false);
    assert.equal(children.length, 0, 'healthy existing instance takes precedence over legacy launch flag');
    assert.equal(AiConnection.expand('$env:LV_QA_IP'), '127.0.0.1');
    const first = await runtime.start(process.cwd(), { ...base, launch: false });
    assert.equal(first.managed, true, 'blank endpoint falls back even with old launch=false');
    const [reused, concurrent] = await Promise.all([runtime.start(process.cwd(), base), runtime.start(process.cwd(), base)]);
    assert.equal(reused.endpoint, first.endpoint); assert.equal(concurrent.endpoint, first.endpoint);
    assert.equal(children.length, 1, 'same directory reuses one owned process');
    response = 'auth';
    const authFallback = await runtime.start(other, { ...base, endpoint: `127.0.0.1:${port}` });
    assert.equal(authFallback.managed, true);
    assert.notEqual(authFallback.endpoint, first.endpoint);
    await assert.rejects(runtime.start(other, { ...base, endpoint: `127.0.0.1:${port}`, executable: '' }), (e: AiConnectionError) => e.stage === AiConnectStage.MissingProgram && e.message.includes('认证失败') && e.message.includes('未填写'));
    response = 'wrong';
    await assert.rejects(runtime.start(process.cwd(), { ...base, endpoint: `127.0.0.1:${port}`, executable: '' }), /工作目录/);
    await assert.rejects(runtime.start(other, { ...base, endpoint: '%LV_NONEXISTENT_QA%', executable: '' }), /环境变量.*未设置/);
    assert.match(first.passwordEnv || '', /^LOGVIEWER_OPENCODE_PASSWORD_/);
    const generatedKey = first.passwordEnv!;
    await runtime.close();
    assert.equal(process.env[generatedKey], undefined);
    await assert.rejects(fetch(first.endpoint));
    response = 'valid';
    assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200, 'closing runtime preserves externally owned server');
    await assert.rejects(runtime.start(other, base), (e: AiConnectionError) => e.stage === AiConnectStage.Closed);
  } finally {
    await runtime.close();
    await new Promise<void>((resolve) => existing.close(() => resolve()));
    delete process.env.LV_QA_IP; delete process.env.LV_QA_PORT;
  }
  const missing = new AiRuntime({ spawn: (_file, args, options) => spawn(path.join(other, 'does-not-exist.exe'), args, options) });
  try { await assert.rejects(missing.start(other, base), (e: AiConnectionError) => e.stage === AiConnectStage.Start && e.message.includes('无法启动')); } finally { await missing.close(); }
  const early = new AiRuntime({ spawn: (_file, _args, options) => spawn(process.execPath, ['-e', 'process.exit(9)'], options) });
  try { await assert.rejects(early.start(other, base), (e: AiConnectionError) => e.stage === AiConnectStage.Exit && e.message.includes('提前退出')); } finally { await early.close(); }
  const hanging = new AiRuntime({ startupMs: 500, spawn: (_file, _args, options) => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], options) });
  try { await assert.rejects(hanging.start(other, base), (e: AiConnectionError) => e.stage === AiConnectStage.Ready && e.message.includes('已启动')); } finally { await hanging.close(); }
  await fs.rm(other, { recursive: true, force: true });
  console.log('PASS: existing-first, env expansion, blank/unreachable/auth fallback, reuse, ownership cleanup, missing program, spawn failure, early exit and started-unreachable errors');
}

await run();
