import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import { HistoryStore } from '../server/services/historyStore';
import { AiService } from '../server/services/aiService';
import { AiMode } from '../src/config/aiTypes';
import { HistoryKind } from '../src/config/historyTypes';
import { registerAiRoutes } from '../server/routes/aiRoutes';

const run = promisify(execFile);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-'));
  const history = new HistoryStore(path.join(root, 'history'));
  const log = await history.save({ name: 'case.log', origin: 'test', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR source.ts:7\n');
  const requests: { directory?: string; body?: Record<string, unknown> }[] = [];
  const phases = new Map<string, 'idle' | 'accepted' | 'busy' | 'done' | 'aborted'>();
  const pending = new Map<string, { permission: boolean; question: boolean }>();
  let nextSession = 0;
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.post('/session', (_req, res) => { nextSession += 1; phases.set(`ses_test_${nextSession}`, 'idle'); res.json({ id: `ses_test_${nextSession}` }); });
  app.post('/session/:id/prompt_async', (req, res) => {
    const id = req.params.id;
    requests.push({ directory: req.query.directory as string, body: req.body });
    phases.set(id, 'accepted');
    pending.set(id, { permission: true, question: true });
    setTimeout(() => { if (phases.get(id) === 'accepted') phases.set(id, 'busy'); }, 20);
    res.status(204).end();
  });
  app.get('/session/status', (_req, res) => res.json(Object.fromEntries([...phases].map(([id, type]) => [id, { type }]))));
  app.get('/session/:id/message', (req, res) => res.json(phases.get(req.params.id) === 'done' ? [{ info: { role: 'assistant', time: { completed: Date.now() }, finish: 'stop' }, parts: [{ type: 'text', text: 'RCA complete' }] }] : []));
  app.get('/permission', (_req, res) => res.json([...pending].filter(([, value]) => value.permission).map(([sessionID]) => ({ id: 'perm-1', sessionID, permission: 'bash' }))));
  app.get('/question', (_req, res) => res.json([...pending].filter(([, value]) => value.question).map(([sessionID]) => ({ id: 'question-1', sessionID, questions: [] }))));
  app.post('/session/:id/abort', (req, res) => { phases.set(req.params.id, 'aborted'); pending.delete(req.params.id); res.json(true); });
  app.post('/permission/:id/reply', (req, res) => { const sessionID = [...pending.keys()][0]; const item = pending.get(sessionID); if (req.params.id !== 'perm-1' || !item) return res.status(404).end(); item.permission = false; if (!item.question) { phases.set(sessionID, 'done'); pending.delete(sessionID); } res.json(true); });
  app.post('/question/:id/reply', (_req, res) => { const sessionID = [...pending.keys()][0]; const item = pending.get(sessionID); if (!item) return res.status(404).end(); item.question = false; if (!item.permission) { phases.set(sessionID, 'done'); pending.delete(sessionID); } res.json(true); });
  app.post('/question/:id/reject', (_req, res) => { const sessionID = [...pending.keys()][0]; const item = pending.get(sessionID); if (!item) return res.status(404).end(); item.question = false; if (!item.permission) { phases.set(sessionID, 'done'); pending.delete(sessionID); } res.json(true); });
  app.get('/provider', (_req, res) => res.json({ internal: { models: { diagnose: {} } } }));
  app.get('/agent', (_req, res) => res.json([{ name: 'logviewer-diagnose', mode: 'primary' }]));
  const server = await new Promise<import('node:http').Server>((resolve) => { const item = app.listen(0, '127.0.0.1', () => resolve(item)); });
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const service = new AiService(path.join(root, 'state'), history);
    await service.init();
    await service.configure({ endpoint: `http://127.0.0.1:${address.port}`, launch: false, providerID: 'internal', modelID: 'diagnose' });
    registerAiRoutes(app, service);
    const isolated = await service.create({ logId: log.id, mode: AiMode.Isolated });
    const routeState = await fetch(`http://127.0.0.1:${address.port}/api/ai/state`).then((response) => response.json()) as { sessions: unknown[] };
    assert.equal(routeState.sessions.length, 1);
    await service.prompt({ sessionId: isolated.id, prompt: 'diagnose', recipe: true });
    assert.equal(requests[0].directory, isolated.directory);
    assert.deepEqual(requests[0].body?.model, { providerID: 'internal', modelID: 'diagnose' });
    assert.equal((requests[0].body?.parts as { type: string }[])[0].type, 'text');
    await sleep(40);
    await service.replyPermission(isolated.id, 'perm-1', { reply: 'once' });
    await service.replyQuestion(isolated.id, 'question-1', { answers: [['yes']] });
    for (let i = 0; i < 100 && (await service.state()).sessions[0].state !== 'idle'; i += 1) await sleep(20);
    assert.equal((await service.state()).sessions[0].messages.length, 1);

    const large = 'x'.repeat(40_000);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/sessions/${isolated.id}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: large }) });
    assert.equal(response.status, 200, await response.text());
    await sleep(30);
    await service.abort(isolated.id);
    assert.equal((await service.state()).sessions.find((item) => item.id === isolated.id)?.state, 'aborted');
    const oldEndpoint = (await service.state()).sessions.find((item) => item.id === isolated.id)?.endpoint;
    await service.configure({ modelID: 'diagnose-v2' });
    assert.equal((await service.state()).sessions.find((item) => item.id === isolated.id)?.endpoint, oldEndpoint);
    await service.create({ logId: log.id, mode: AiMode.Isolated });
    await service.create({ logId: log.id, mode: AiMode.Isolated });

    const repository = path.join(root, 'repo');
    await fs.mkdir(repository, { recursive: true });
    await run('git', ['init', repository]);
    await fs.writeFile(path.join(repository, 'keep.txt'), 'already staged');
    await run('git', ['-C', repository, 'add', '--', 'keep.txt']);
    const source = await service.create({ logId: log.id, mode: AiMode.Source, repository, trackLog: true, installRecipe: true });
    assert.equal(source.repository, repository);
    const tracked = await run('git', ['-C', repository, 'ls-files', '--', `.logviewer-ai/${log.id}/input.log`]);
    assert.match(tracked.stdout, /input\.log/);
    const staged = await run('git', ['-C', repository, 'diff', '--cached', '--name-only']);
    assert.match(staged.stdout, /keep\.txt/);
    assert.match(staged.stdout, new RegExp(`\\.logviewer-ai[\\\\/]${log.id}[\\\\/]input\\.log`));
    assert.equal(await fs.stat(path.join(repository, '.opencode/agents/logviewer-diagnose.md')).then(() => true), true);

    const restored = new AiService(path.join(root, 'state'), history);
    await restored.init();
    assert.equal((await restored.state()).sessions.length, 4);
    process.stdout.write('verify-ai: ok\n');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

await main();
