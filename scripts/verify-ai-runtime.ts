import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AiRuntime } from '../server/services/aiRuntime';
import type { AiConfig } from '../src/config/aiTypes';

const fakeServer = `const http=require('http');const u=require('url');const s=http.createServer((q,r)=>{if(!q.headers.authorization){r.writeHead(401);return r.end()}const d=new URL('http://x'+q.url).searchParams.get('directory');r.setHeader('content-type','application/json');r.end(JSON.stringify({directory:d}))});const p=Number(process.argv[process.argv.indexOf('--port')+1]);s.listen(p,'127.0.0.1');`;
const config: AiConfig = { endpoint: 'http://127.0.0.1:4096', executable: 'fake-serve', launch: true, username: 'tester' };

async function run(): Promise<void> {
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-runtime-'));
  const runtime = new AiRuntime({ spawn: (_file, args, options) => spawn(process.execPath, ['-e', fakeServer, ...args], options) });
  const disabled: AiConfig = { ...config, launch: false };
  assert.deepEqual(await runtime.start(process.cwd(), disabled), disabled);
  const first = await runtime.start(process.cwd(), config);
  const reused = await runtime.start(process.cwd(), config);
  assert.equal(reused.endpoint, first.endpoint, 'same directory and auth settings reuse one child');
  const second = await runtime.start(other, config);
  assert.notEqual(second.endpoint, first.endpoint, 'different directories receive independent children');
  assert.match(first.passwordEnv || '', /^LOGVIEWER_OPENCODE_PASSWORD_/);
  assert.notEqual(process.env[first.passwordEnv!], undefined, 'generated password is held in process environment');
  await runtime.close();
  console.log('PASS: AI runtime verifies launch=false, readiness BasicAuth, directory reuse, per-directory isolation, generated secret env, and clean shutdown');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
