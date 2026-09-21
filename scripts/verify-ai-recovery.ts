import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AiService } from '../server/services/aiService';
import { HistoryStore } from '../server/services/historyStore';
import { AiMode, AiSessionState, type AiSession } from '../src/config/aiTypes';
import { HistoryKind } from '../src/config/historyTypes';

type Remote = { messages: unknown[]; status: string; sends: string[] };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test: () => Promise<boolean>, label: string): Promise<void> {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (await test()) return; await pause(30); }
  assert.fail(label);
}
function reply(finish: string, error?: unknown): unknown {
  return { info: { id: `msg_${Date.now()}`, role: 'assistant', finish, error, time: { completed: Date.now() } }, parts: [{ type: 'text', text: 'fixture' }] };
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-recovery-'));
  const history = new HistoryStore(path.join(root, 'history'));
  const log = await history.save({ name: 'recovery.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'fixture');
  const remote = new Map<string, Remote>();
  const services: AiService[] = [];
  const streams = new Set<express.Response>();
  const app = express(); app.use(express.json());
  app.get('/path', (req, res) => res.json({ directory: req.query.directory }));
  app.post('/session', (_req, res) => { const id = `ses_${remote.size}`; remote.set(id, { messages: [], status: 'idle', sends: [] }); res.json({ id }); });
  app.get('/session/status', (_req, res) => res.json(Object.fromEntries([...remote].map(([id, value]) => [id, { type: value.status }]))));
  app.get('/session/:id/message', (req, res) => res.json(remote.get(req.params.id)!.messages));
  app.get('/permission', (_req, res) => res.json([])); app.get('/question', (_req, res) => res.json([]));
  app.get('/event', (req, res) => { res.setHeader('Content-Type', 'text/event-stream'); res.flushHeaders(); res.write('data: {"type":"server.connected"}\n\n'); streams.add(res); req.on('close', () => streams.delete(res)); });
  app.post('/session/:id/prompt_async', (req, res) => { const run = remote.get(req.params.id)!; run.sends.push(req.body.parts[0].text); run.status = 'busy'; run.messages.push({ info: { role: 'user' }, parts: req.body.parts }); res.status(204).end(); });
  app.post('/session/:id/abort', (req, res) => { const run = remote.get(req.params.id)!; run.status = 'idle'; run.messages.push(reply('error', { name: 'MessageAbortedError', data: { message: 'The operation was aborted.' } })); res.json(true); });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const create = async () => {
    const dir = path.join(root, `state-${services.length}`);
    const service = new AiService(dir, history); services.push(service);
    await service.init(); await service.configure({ endpoint });
    const session = await service.create({ logId: log.id, mode: AiMode.Isolated });
    return { service, session, dir, run: remote.get(session.id)! };
  };
  const current = async (service: AiService, id: string): Promise<AiSession> => (await service.state()).sessions.find((item) => item.id === id)!;
  try {
    const stopped = await create();
    await stopped.service.prompt({ sessionId: stopped.session.id, prompt: 'stop me' });
    await stopped.service.abort(stopped.session.id);
    await stopped.service.refresh(stopped.session.id);
    await pause(650);
    assert.equal((await current(stopped.service, stopped.session.id)).state, AiSessionState.Aborted, 'refresh must keep MessageAbortedError as a normal stop');
    assert.equal((await current(stopped.service, stopped.session.id)).error, undefined);
    await stopped.service.resume(stopped.session.id);
    await stopped.service.refresh(stopped.session.id); await pause(650);
    assert.equal((await current(stopped.service, stopped.session.id)).queuePaused, false, 'acknowledged historical abort must not pause the empty queue again');
    assert.equal((await current(stopped.service, stopped.session.id)).state, AiSessionState.Idle);

    const recovery = await create();
    await recovery.service.prompt({ sessionId: recovery.session.id, prompt: 'first' });
    await recovery.service.prompt({ sessionId: recovery.session.id, prompt: 'queued' });
    await recovery.service.close();
    recovery.run.status = 'idle'; recovery.run.messages.push(reply('tool-calls'));
    const restored = new AiService(recovery.dir, history); services.push(restored); await restored.init();
    await pause(650);
    assert.equal(recovery.run.sends.length, 1, 'restart must not drain on a tool-calls intermediate message');
    recovery.run.messages.push(reply('stop'));
    await until(async () => recovery.run.sends.length === 2, 'final reply must release restored queue');

    const shared = await create();
    shared.run.status = 'busy'; shared.run.messages.push({ info: { role: 'user' }, parts: [{ type: 'text', text: 'CLI turn' }] });
    await shared.service.prompt({ sessionId: shared.session.id, prompt: 'web queued' });
    assert.equal(shared.run.sends.length, 0, 'web prompt must queue while CLI owns the remote busy turn');
    assert.equal((await current(shared.service, shared.session.id)).queue?.length, 1);
    shared.run.status = 'idle'; shared.run.messages.push(reply('stop'));
    await until(async () => shared.run.sends.length === 1, 'CLI completion must release the web queue');
    console.log('verify-ai-recovery: PASS (abort refresh, restored tool step, shared CLI queue)');
  } finally {
    await Promise.all(services.map((service) => service.close()));
    for (const stream of streams) stream.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('logviewer-ai-recovery-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
await main();
