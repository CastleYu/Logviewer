import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http, { type Server } from 'node:http';
import express from 'express';
import { AiService } from '../server/services/aiService';
import { HistoryStore } from '../server/services/historyStore';
import { registerAiRoutes } from '../server/routes/aiRoutes';
import { AiMode } from '../src/config/aiTypes';
import { HistoryKind } from '../src/config/historyTypes';

type Run = { id: string; directory: string; status: string; messages: unknown[]; hold: boolean };

class VerifyAiRoutes {
  static async main(): Promise<void> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-routes-'));
    const fixture = await VerifyAiRoutes.fixture();
    const history = new HistoryStore(path.join(root, 'history'));
    const log = await history.save({ name: 'route.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR route fixture\n');
    const passwordKey = 'LOGVIEWER_VERIFY_AI_PASSWORD';
    const previousPassword = process.env[passwordKey];
    process.env[passwordKey] = 'fixturesecret';
    let terminalCalls: { directory: string; endpoint: string; id: string; env: NodeJS.ProcessEnv }[] = [];
    let terminalFailure = false;
    const service = new AiService(path.join(root, 'ai'), history, {
      terminal: (executable: string) => ({
        open: async (directory: string, endpoint: string, id: string, env: NodeJS.ProcessEnv) => {
          terminalCalls.push({ directory, endpoint, id, env: { ...env, __executable: executable } });
          if (terminalFailure) throw new Error('fixture launcher failure');
          return { opened: true };
        },
      }),
    });
    await service.init();
    await service.configure({ endpoint: fixture.endpoint, executable: 'fixture-opencode', username: 'opencode', passwordEnv: passwordKey });
    const app = express();
    registerAiRoutes(app, service);
    const server = await new Promise<Server>((resolve) => { const item = app.listen(0, '127.0.0.1', () => resolve(item)); });
    const address = server.address(); assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/ai`;
    try {
      const created = await VerifyAiRoutes.json(`${url}/sessions`, { method: 'POST', body: { logId: log.id, mode: AiMode.Isolated } });
      assert.equal(created.status, 201); const session = created.body as { id: string; directory: string; endpoint?: string; executable?: string }; assert.ok(session.id);
      const first = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/prompt`, { method: 'POST', body: { prompt: 'route-first' } });
      assert.equal(first.status, 200);
      const second = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/prompt`, { method: 'POST', body: { prompt: 'route-queued' } });
      assert.equal(second.status, 200);
      const queued = await VerifyAiRoutes.json(`${url}/state`); const stored = (queued.body as { sessions: { id: string; queue?: unknown[] }[] }).sessions.find((item) => item.id === session.id); assert.equal(stored?.queue?.length, 1);
      const badDrop = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/queue/missing`, { method: 'DELETE' }); assert.equal(badDrop.status, 400); assert.match(String((badDrop.body as { message?: string }).message), /队列项不存在/);
      const aborted = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/abort`, { method: 'POST' }); assert.equal(aborted.status, 200);
      const resumed = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/queue/resume`, { method: 'POST' }); assert.equal(resumed.status, 200);
      await VerifyAiRoutes.until(async () => { const item = await VerifyAiRoutes.json(`${url}/state`); const current = (item.body as { sessions: { id: string; queue?: unknown[]; state?: string }[] }).sessions.find((entry) => entry.id === session.id); return current?.state === 'idle' && !current.queue?.length; });
      const opened = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/terminal`, { method: 'POST' }); assert.equal(opened.status, 200); assert.equal((opened.body as { opened: boolean }).opened, true); assert.equal(terminalCalls.at(-1)?.id, session.id); assert.equal(terminalCalls.at(-1)?.directory, session.directory); assert.equal(terminalCalls.at(-1)?.endpoint, fixture.endpoint); assert.equal(terminalCalls.at(-1)?.env.OPENCODE_SERVER_USERNAME, 'opencode'); assert.equal(terminalCalls.at(-1)?.env.OPENCODE_SERVER_PASSWORD, 'fixturesecret'); assert.equal(terminalCalls.at(-1)?.env.__executable, 'fixture-opencode'); assert.equal([terminalCalls.at(-1)?.directory, terminalCalls.at(-1)?.endpoint, terminalCalls.at(-1)?.id, terminalCalls.at(-1)?.env.__executable].some((value) => value?.includes('fixturesecret')), false);
      await service.configure({ username: 'custom-user' }); const customCreated = await VerifyAiRoutes.json(`${url}/sessions`, { method: 'POST', body: { logId: log.id, mode: AiMode.Isolated } }); assert.equal(customCreated.status, 201); const customSession = customCreated.body as { id: string }; const custom = await VerifyAiRoutes.json(`${url}/sessions/${customSession.id}/terminal`, { method: 'POST' }); assert.equal(custom.status, 400); assert.match(String((custom.body as { message?: string }).message), /自定义用户名/); const oldSessionStillBound = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/terminal`, { method: 'POST' }); assert.equal(oldSessionStillBound.status, 200); await service.configure({ username: 'opencode' });
      terminalFailure = true; const failed = await VerifyAiRoutes.json(`${url}/sessions/${session.id}/terminal`, { method: 'POST' }); assert.equal(failed.status, 400); assert.match(String((failed.body as { message?: string }).message), /fixture launcher failure/);
      process.stdout.write('verify-ai-routes: ok\n');
    } finally { terminalFailure = false; if (previousPassword === undefined) delete process.env[passwordKey]; else process.env[passwordKey] = previousPassword; await service.close(); await new Promise<void>((resolve) => server.close(() => resolve())); await fixture.close(); await fs.rm(root, { recursive: true, force: true }); }
  }

  private static async fixture(): Promise<{ endpoint: string; close: () => Promise<void> }> {
    const runs = new Map<string, Run>(); let sequence = 0; const app = express(); app.use(express.json());
    app.get('/path', (req, res) => res.json({ directory: String(req.query.directory || '') }));
    app.post('/session', (req, res) => { const id = `fixture-${++sequence}`; runs.set(id, { id, directory: String(req.query.directory || ''), status: 'idle', messages: [], hold: false }); res.json({ id }); });
    app.post('/session/:id/prompt_async', (req, res) => { const run = runs.get(req.params.id); assert(run); const prompt = String(req.body?.parts?.[0]?.text || ''); run.status = 'busy'; run.hold = prompt.includes('route-first'); if (!run.hold) VerifyAiRoutes.finish(run, prompt); res.status(204).end(); });
    app.get('/session/status', (_req, res) => res.json(Object.fromEntries([...runs].map(([id, run]) => [id, { type: run.status }]))));
    app.get('/session/:id/message', (req, res) => res.json(runs.get(req.params.id)?.messages || [])); app.get('/permission', (_req, res) => res.json([])); app.get('/question', (_req, res) => res.json([]));
    app.get('/event', (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.flushHeaders(); res.write('event: connected\ndata: {}\n\n'); });
    app.post('/session/:id/abort', (req, res) => { const run = runs.get(req.params.id); assert(run); run.status = 'idle'; run.hold = false; res.status(204).end(); });
    app.post('/permission/:id/reply', (_req, res) => res.status(204).end()); app.post('/question/:id/:action', (_req, res) => res.status(204).end());
    const server = await new Promise<Server>((resolve) => { const item = app.listen(0, '127.0.0.1', () => resolve(item)); }); const address = server.address(); assert(address && typeof address !== 'string');
    return { endpoint: `http://127.0.0.1:${address.port}`, close: async () => new Promise<void>((resolve) => server.close(() => resolve())) };
  }

  private static finish(run: Run, prompt: string): void { setTimeout(() => { if (run.status !== 'idle') { run.messages.push({ info: { role: 'assistant', finish: 'stop', time: { completed: Date.now() } }, parts: [{ type: 'text', text: prompt }] }); run.status = 'idle'; } }, 30); }
  private static async json(url: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: unknown }> { const response = await fetch(url, { method: init.method, headers: init.body === undefined ? undefined : { 'content-type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body) }); return { status: response.status, body: await response.json() }; }
  private static async until(test: () => Promise<boolean>): Promise<void> { const end = Date.now() + 5000; while (!(await test()) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(await test(), true, 'route fixture timed out'); }
}

VerifyAiRoutes.main().catch((error) => { console.error(error); process.exitCode = 1; });
