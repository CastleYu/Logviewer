import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const qaRoot = path.resolve('.logviewer-cache', 'opencode-qa');
const binary = path.join(qaRoot, 'package', 'bin', 'opencode.exe');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitFor(url: string, init: RequestInit, timeout = 30_000): Promise<Response> {
  const started = Date.now();
  let last = 'unreachable';
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status === 401) return response;
      last = String(response.status);
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(250);
  }
  throw new Error(`OpenCode did not become ready: ${last}`);
}

function auth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => { child.once('exit', () => resolve()); setTimeout(resolve, 3_000); });
}

async function startFixture(): Promise<{ server: http.Server; port: number; calls: string[] }> {
  const calls: string[] = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404); response.end(); return; }
    let body = '';
    for await (const chunk of request) body += String(chunk);
    calls.push(body);
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const id = 'chatcmpl-logviewer-fixture';
    response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'diagnostic', choices: [{ index: 0, delta: { role: 'assistant', content: 'local model fixture response' }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'diagnostic', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 5, total_tokens: 6 } })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { server, port: address.port, calls };
}

async function main(): Promise<void> {
  await fs.mkdir(qaRoot, { recursive: true });
  await Promise.all(['live-smoke-failure.json', 'live-smoke-child-exit.json', 'live-smoke-prompt-started.json', 'live-smoke-preprompt.json'].map((name) => fs.rm(path.join(qaRoot, name), { force: true })));
  const version = (await exec(binary, ['--version'], { windowsHide: true })).stdout.trim();
  assert.match(version, /1\.2\.27/);
  const runtime = await fs.mkdtemp(path.join(qaRoot, 'runtime-'));
  const config = await fs.mkdtemp(path.join(runtime, 'config-'));
  const data = await fs.mkdtemp(path.join(runtime, 'data-'));
  const cache = await fs.mkdtemp(path.join(runtime, 'cache-'));
  const directory = await fs.mkdtemp(path.join(runtime, 'workspace-'));
  const providerDir = path.join(qaRoot, 'provider-fixture');
  const fixture = await startFixture();
  const port = await freePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const username = 'qa-user';
  const password = 'qa-password-only-runtime';
  const env = {
    ...process.env,
    HOME: runtime,
    USERPROFILE: runtime,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: data,
    XDG_CACHE_HOME: cache,
    OPENCODE_CONFIG_DIR: providerDir,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      autoupdate: false,
      model: 'internal/diagnostic',
      enabled_providers: ['internal'],
      provider: { internal: { npm: '@ai-sdk/openai-compatible', name: 'Local fixture provider', options: { baseURL: `http://127.0.0.1:${fixture.port}/v1`, apiKey: 'fixture' }, models: { diagnostic: { name: 'Local diagnostic fixture', limit: { context: 32768, output: 4096 } } } } },
      permission: { '*': 'allow', question: 'deny' },
    }),
    OPENCODE_DISABLE_MODELS_FETCH: 'true',
    OPENCODE_DISABLE_AUTOUPDATE: 'true',
    OPENCODE_SERVER_USERNAME: username,
    OPENCODE_SERVER_PASSWORD: password,
  };
  let child: ChildProcess | undefined;
  let passed = false;
  const evidence: Record<string, unknown> = { version, endpoint, directory, checks: {} };
  const checks = evidence.checks as Record<string, unknown>;
  try {
    child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    const output: string[] = [];
    child.stdout?.on('data', (chunk) => output.push(String(chunk)));
    child.stderr?.on('data', (chunk) => output.push(String(chunk)));
    child.once('exit', (code, signal) => { void fs.writeFile(path.join(qaRoot, 'live-smoke-child-exit.json'), JSON.stringify({ code, signal, output: output.join('').replaceAll(password, '<redacted>') }, null, 2), 'utf8'); });
    const headers = { authorization: auth(username, password), 'content-type': 'application/json' };
    const unauth = await waitFor(`${endpoint}/path?directory=${encodeURIComponent(directory)}`, {}, 30_000);
    assert.equal(unauth.status, 401);
    checks.authRequired = true;
    const pathResponse = await waitFor(`${endpoint}/path?directory=${encodeURIComponent(directory)}`, { headers });
    const pathBody = await pathResponse.json() as { directory?: string; worktree?: string };
    assert.equal(pathBody.directory, directory);
    checks.pathDirectory = pathBody.directory;
    const created = await fetch(`${endpoint}/session?directory=${encodeURIComponent(directory)}`, { method: 'POST', headers, body: JSON.stringify({ title: 'LogViewer v1.2.27 QA' }) });
    assert.equal(created.status, 200);
    const session = await created.json() as { id: string };
    assert.ok(session.id);
    checks.sessionIdPrefix = session.id.slice(0, 4);
    const messages = await fetch(`${endpoint}/session/${encodeURIComponent(session.id)}/message?directory=${encodeURIComponent(directory)}`, { headers });
    assert.equal(messages.status, 200);
    assert.deepEqual(await messages.json(), []);
    checks.emptyMessages = true;
    for (const route of ['/permission', '/question', '/provider', '/agent']) {
      const response = await fetch(`${endpoint}${route}?directory=${encodeURIComponent(directory)}`, { headers });
      assert.equal(response.ok, true, `${route} returned ${response.status}`);
      if (route === '/provider') {
        const body = await response.json() as { all?: { id?: string; models?: Record<string, unknown> }[]; connected?: string[] };
        checks.provider = { status: response.status, ids: (body.all || []).map((item) => item.id), connected: body.connected || [], modelIds: (body.all || []).flatMap((item) => Object.keys(item.models || {})) };
      } else if (route === '/agent') {
        const body = await response.json() as { name?: string; mode?: string }[];
        checks.agent = { status: response.status, agents: body.map((item) => ({ name: item.name, mode: item.mode })) };
      } else checks[route.slice(1)] = { status: response.status };
    }
    const abort = await fetch(`${endpoint}/session/${encodeURIComponent(session.id)}/abort?directory=${encodeURIComponent(directory)}`, { method: 'POST', headers, body: '{}' });
    assert.equal(abort.status, 200);
    assert.equal(await abort.json(), true);
    checks.abort = true;
    const promptSessionResponse = await fetch(`${endpoint}/session?directory=${encodeURIComponent(directory)}`, { method: 'POST', headers, body: JSON.stringify({ title: 'LogViewer fixture prompt QA' }) });
    assert.equal(promptSessionResponse.status, 200);
    const promptSession = await promptSessionResponse.json() as { id: string };
    const prompted = await fetch(`${endpoint}/session/${encodeURIComponent(promptSession.id)}/prompt_async?directory=${encodeURIComponent(directory)}`, { method: 'POST', headers, body: JSON.stringify({ parts: [{ type: 'text', text: 'Return the fixture response.' }], model: { providerID: 'internal', modelID: 'diagnostic' } }) });
    assert.equal(prompted.status, 204);
    await fs.writeFile(path.join(qaRoot, 'live-smoke-prompt-started.json'), JSON.stringify({ promptStatus: prompted.status, fixtureCalls: fixture.calls.length, output: output.join('').replaceAll(password, '<redacted>') }, null, 2), 'utf8');
    let completed = false;
    let assistantText = '';
    let lastStatuses: Record<string, unknown> = {};
    let lastMessages: unknown[] = [];
    for (let index = 0; index < 120; index += 1) {
      const statusResponse = await fetch(`${endpoint}/session/status?directory=${encodeURIComponent(directory)}`, { headers, signal: AbortSignal.timeout(5_000) });
      const statuses = await statusResponse.json() as Record<string, { type?: string }>;
      lastStatuses = statuses;
      const messageResponse = await fetch(`${endpoint}/session/${encodeURIComponent(promptSession.id)}/message?directory=${encodeURIComponent(directory)}`, { headers, signal: AbortSignal.timeout(5_000) });
      const messages = await messageResponse.json() as { info?: { role?: string }; parts?: { type?: string; text?: string }[] }[];
      lastMessages = messages;
      const messageError = messages.map((message) => (message.info as { error?: unknown } | undefined)?.error).find(Boolean);
      if (messageError) throw new Error(`OpenCode assistant error: ${JSON.stringify(messageError)}`);
      assistantText = messages.filter((message) => message.info?.role === 'assistant').flatMap((message) => message.parts || []).filter((part) => part.type === 'text').map((part) => part.text || '').join('');
      const status = statuses[promptSession.id];
      const terminal = !status || status.type === 'idle';
      if (terminal && assistantText.includes('local model fixture response')) { completed = true; break; }
      await sleep(250);
    }
    await fs.writeFile(path.join(qaRoot, 'live-smoke-prompt-progress.json'), JSON.stringify({ statuses: lastStatuses, messages: lastMessages, fixtureCalls: fixture.calls.length }, null, 2), 'utf8');
    assert.equal(completed, true, 'real OpenCode prompt did not complete');
    assert.equal(fixture.calls.length, 1, 'fixture model was not called exactly once');
    const requestBody = JSON.parse(fixture.calls[0]) as { model?: string; messages?: unknown[] };
    assert.equal(requestBody.model, 'diagnostic');
    assert.ok(Array.isArray(requestBody.messages) && requestBody.messages.length > 0);
    checks.promptAsyncFixture = { status: prompted.status, fixtureCalls: fixture.calls.length, assistantText };
    const doc = await fetch(`${endpoint}/doc?directory=${encodeURIComponent(directory)}`, { headers });
    assert.equal(doc.ok, true);
    checks.openapi = doc.status;
    await fs.writeFile(path.join(qaRoot, 'live-smoke-preprompt.json'), JSON.stringify({ ...evidence, serverOutput: output.join('').replaceAll(password, '<redacted>') }, null, 2), 'utf8');
    evidence.serverOutput = output.join('').replaceAll(password, '<redacted>');
    await fs.writeFile(path.join(qaRoot, 'live-smoke-result.json'), JSON.stringify(evidence, null, 2), 'utf8');
    passed = true;
    process.stdout.write(`verify-opencode-live: ok (${version})\n`);
  } finally {
    if (child) await stop(child);
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
    if (passed) await fs.rm(runtime, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await fs.writeFile(path.join(qaRoot, 'live-smoke-failure.json'), JSON.stringify({ message, at: new Date().toISOString() }, null, 2), 'utf8');
  console.error(`verify-opencode-live: failed: ${message}`);
  process.exitCode = 1;
}
