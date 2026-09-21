import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { HistoryStore } from '../server/services/historyStore';
import { AiService } from '../server/services/aiService';
import { AiMode, AiSessionState } from '../src/config/aiTypes';
import { HistoryKind } from '../src/config/historyTypes';
import { registerAiRoutes } from '../server/routes/aiRoutes';

type Run = { id: string; prompt: string; messages: Record<string, unknown>[]; status: string; directory?: string; admission?: Promise<void>; admit?: () => void; aborted: boolean };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test: () => boolean, limit = 3000): Promise<void> { const end = Date.now() + limit; while (!test() && Date.now() < end) await pause(10); assert.equal(test(), true, 'fixture condition timed out'); }
async function untilAsync(test: () => Promise<boolean>, limit = 3000): Promise<void> { const end = Date.now() + limit; while (!(await test()) && Date.now() < end) await pause(10); assert.equal(await test(), true, 'fixture condition timed out'); }
async function stateOf(service: AiService, id: string) { return (await service.state()).sessions.find((item) => item.id === id)!; }
function finalMessage(text: string): Record<string, unknown> { return { info: { role: 'assistant', time: { completed: Date.now() }, finish: 'stop' }, parts: [{ type: 'text', text }] }; }

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-flow-'));
  const history = new HistoryStore(path.join(root, 'history'));
  const log = await history.save({ name: 'flow.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR fixture\n');
  const runs = new Map<string, Run>(); const submitted: string[] = []; const eventClients = new Set<import('node:http').ServerResponse>(); const clientDirectories = new Map<import('node:http').ServerResponse, string>(); const eventConnections = new Map<string, number>(); let sequence = 0;
  const app = express(); app.use(express.json({ limit: '1mb' }));
  app.post('/session', (req, res) => { const id = `fixture-${++sequence}`; runs.set(id, { id, prompt: '', messages: [], status: 'idle', directory: String(req.query.directory || ''), aborted: false }); res.json({ id }); });
  app.post('/session/:id/prompt_async', async (req, res) => {
    const run = runs.get(req.params.id); assert(run); run.aborted = false; const prompt = String(req.body.parts?.[0]?.text || ''); run.prompt = prompt; submitted.push(prompt);
    if (prompt.includes('slow-admission')) { run.admission = new Promise<void>((resolve) => { run.admit = resolve; }); await run.admission; }
    if (prompt.includes('http-500')) { res.status(500).json({ error: 'fixture rejection' }); return; }
    run.status = prompt.includes('retry') || prompt.includes('permission') ? 'retry' : 'busy';
    if (prompt.includes('sse-error')) { const event = `data: ${JSON.stringify({ type: 'session.error', properties: { sessionID: req.params.id, error: 'fixture async failure' } })}\n\n`; for (const client of eventClients) client.write(event); res.status(204).end(); return; }
    if (prompt.includes('summary-idle')) { run.status = 'idle'; run.messages.push({ info: { role: 'assistant', summary: true, time: { completed: Date.now() }, finish: 'stop' }, parts: [{ type: 'text', text: 'summary idle' }] }); setTimeout(() => run.messages.push(finalMessage('final after idle summary')), 700); }
    else if (prompt.includes('tool-calls')) { run.status = 'idle'; run.messages.push({ info: { role: 'assistant', time: { completed: Date.now() }, finish: 'tool-calls' }, parts: [{ type: 'tool', tool: 'fixture', state: { status: 'running', title: 'fixture tool' } }] }); setTimeout(() => run.messages.push(finalMessage('final after tool call')), 700); }
    else if (prompt.includes('summary')) { setTimeout(() => { run.messages.push({ info: { role: 'assistant', summary: true }, parts: [{ type: 'text', text: 'summary' }] }); }, 20); setTimeout(() => { run.messages.push({ info: { role: 'assistant', time: { completed: Date.now() }, finish: 'stop' }, parts: [{ type: 'text', text: 'summary intermediate' }] }); }, 300); setTimeout(() => { run.messages.push(finalMessage('final after summary')); run.status = 'idle'; }, 700); }
    else if (prompt.includes('sse-reconnect')) { for (const client of [...eventClients]) if (clientDirectories.get(client) === run.directory) { client.end(); eventClients.delete(client); clientDirectories.delete(client); } setTimeout(() => { run.messages.push(finalMessage('final after sse reconnect')); run.status = 'idle'; }, 120); }
    else if (prompt.includes('permission')) { /* reply endpoint completes it */ }
    else setTimeout(() => { if (!run.aborted) { run.messages.push(finalMessage(prompt)); run.status = 'idle'; } }, 50);
    res.status(204).end();
  });
  app.get('/session/status', (_req, res) => res.json(Object.fromEntries([...runs].map(([id, run]) => [id, { type: run.status, attempt: run.status === 'retry' ? 2 : undefined, next: run.status === 'retry' ? 100 : undefined }]))));
  app.get('/session/:id/message', (req, res) => res.json(runs.get(req.params.id)?.messages || [])); app.get('/path', (req, res) => res.json({ directory: req.query.directory }));
  app.get('/permission', (_req, res) => res.json([...runs].filter(([, run]) => run.prompt.includes('permission') && run.status !== 'idle').map(([sessionID]) => ({ id: 'perm-fixture', sessionID })))); app.get('/question', (_req, res) => res.json([]));
  app.get('/event', (req, res) => { res.setHeader('content-type', 'text/event-stream'); res.setHeader('cache-control', 'no-cache'); res.flushHeaders(); res.write('event: server.connected\ndata: {}\n\n'); const directory = String(req.query.directory || ''); eventConnections.set(directory, (eventConnections.get(directory) || 0) + 1); eventClients.add(res); clientDirectories.set(res, directory); req.on('close', () => { eventClients.delete(res); clientDirectories.delete(res); }); });
  app.post('/session/:id/abort', (req, res) => { const run = runs.get(req.params.id); assert(run); run.aborted = true; run.status = 'idle'; res.status(204).end(); });
  app.post('/permission/:id/reply', (_req, res) => { const run = [...runs.values()].find((entry) => entry.prompt.includes('permission')); if (run) { run.status = 'busy'; setTimeout(() => { run.messages.push(finalMessage('permission complete')); run.status = 'idle'; }, 40); } res.json(true); });
  const server = await new Promise<Server>((resolve) => { const item = app.listen(0, '127.0.0.1', () => resolve(item)); }); const address = server.address(); assert(address && typeof address !== 'string');
  const stateRoot = path.join(root, 'state'); const service = new AiService(stateRoot, history); await service.init(); await service.configure({ endpoint: `http://127.0.0.1:${address.port}` }); registerAiRoutes(app, service);
  try {
    const session = await service.create({ logId: log.id, mode: AiMode.Isolated });
    await service.prompt({ sessionId: session.id, prompt: 'fifo-one' }); await service.prompt({ sessionId: session.id, prompt: 'fifo-two' }); assert.equal((await stateOf(service, session.id)).queue?.length, 1); await until(() => submitted.some((item) => item.includes('fifo-two'))); assert.ok(submitted.findIndex((item) => item.includes('fifo-one')) < submitted.findIndex((item) => item.includes('fifo-two')));
    await service.prompt({ sessionId: session.id, prompt: 'stop-one' }); await service.prompt({ sessionId: session.id, prompt: 'stop-two' }); await service.abort(session.id); let state = await stateOf(service, session.id); assert.equal(state.state, AiSessionState.Aborted); assert.equal(state.queue?.some((item) => item.prompt === 'stop-two'), true); assert.equal(state.queuePaused, true); await service.resume(session.id); await until(() => submitted.some((item) => item.includes('stop-two')));
    await service.prompt({ sessionId: session.id, prompt: 'remove-one' }); await service.prompt({ sessionId: session.id, prompt: 'remove-two' }); state = await stateOf(service, session.id); const removable = state.queue?.find((item) => item.prompt.includes('remove-two')); assert(removable); await service.removeQueue(session.id, removable.id); await assert.rejects(() => service.removeQueue(session.id, removable.id));
    await service.prompt({ sessionId: session.id, prompt: 'block-500' }); await service.prompt({ sessionId: session.id, prompt: 'http-500' }); await untilAsync(async () => (await stateOf(service, session.id)).state === AiSessionState.Error);
    state = await stateOf(service, session.id); assert.equal(state.queue?.some((item) => item.prompt.includes('http-500')), true);
    const flow2 = await service.create({ logId: log.id, mode: AiMode.Isolated });
    const summaryIdle = await service.create({ logId: log.id, mode: AiMode.Isolated }); await service.prompt({ sessionId: summaryIdle.id, prompt: 'summary-idle' }); await service.prompt({ sessionId: summaryIdle.id, prompt: 'summary-idle-queued' }); await pause(550); assert.equal(submitted.some((item) => item.includes('summary-idle-queued')), false); await until(() => submitted.some((item) => item.includes('summary-idle-queued')));
    const tools = await service.create({ logId: log.id, mode: AiMode.Isolated }); await service.prompt({ sessionId: tools.id, prompt: 'tool-calls' }); await service.prompt({ sessionId: tools.id, prompt: 'tool-calls-queued' }); await pause(550); assert.equal(submitted.some((item) => item.includes('tool-calls-queued')), false); await until(() => submitted.some((item) => item.includes('tool-calls-queued')));
    await service.prompt({ sessionId: flow2.id, prompt: 'summary' }); await until(() => Boolean((runs.get(flow2.id)?.messages || []).some((item) => (item.info as { summary?: boolean })?.summary))); await untilAsync(async () => (await stateOf(service, flow2.id)).state === AiSessionState.Idle); state = await stateOf(service, flow2.id); assert.equal(state.messages.some((item) => JSON.stringify(item).includes('final after summary')), true);
    await service.prompt({ sessionId: flow2.id, prompt: 'permission' }); await untilAsync(async () => (await stateOf(service, flow2.id)).permissions.length > 0); assert.equal((await stateOf(service, flow2.id)).state, AiSessionState.Busy); await service.replyPermission(flow2.id, 'perm-fixture', { reply: 'once' }); await untilAsync(async () => (await stateOf(service, flow2.id)).state === AiSessionState.Idle);
    await service.prompt({ sessionId: flow2.id, prompt: 'sse-error' }); await untilAsync(async () => (await stateOf(service, flow2.id)).state === AiSessionState.Error); assert.match((await stateOf(service, flow2.id)).error || '', /fixture async failure|session error/i); assert.equal((await stateOf(service, flow2.id)).lastPrompt?.prompt, 'sse-error');
    const reconnect = await service.create({ logId: log.id, mode: AiMode.Isolated }); const clean = await service.create({ logId: log.id, mode: AiMode.Isolated }); await service.prompt({ sessionId: reconnect.id, prompt: 'sse-reconnect' }); await service.prompt({ sessionId: clean.id, prompt: 'clean-session' }); await untilAsync(async () => (await stateOf(service, reconnect.id)).state === AiSessionState.Idle); await untilAsync(async () => (await stateOf(service, clean.id)).state === AiSessionState.Idle); assert.match((await stateOf(service, reconnect.id)).streamError || '', /断开|reconnect|重试/i); assert.equal((await stateOf(service, reconnect.id)).error, undefined); assert.equal((await stateOf(service, clean.id)).error, undefined);
    const persisted = await service.create({ logId: log.id, mode: AiMode.Isolated }); await service.prompt({ sessionId: persisted.id, prompt: 'persist-block' }); await service.prompt({ sessionId: persisted.id, prompt: 'persist-queued' }); await service.abort(persisted.id); const rebuilt = new AiService(stateRoot, history); await rebuilt.init(); const restored = await stateOf(rebuilt, persisted.id); assert.equal(restored.queue?.some((item) => item.prompt.includes('persist-queued')), true); assert.equal(restored.queuePaused, true); await rebuilt.removeQueue(persisted.id, restored.queue![0].id); assert.equal((await stateOf(rebuilt, persisted.id)).queue?.length, 0); await rebuilt.close();
    const empty = await service.create({ logId: log.id, mode: AiMode.Isolated }); await service.refresh(empty.id); assert.equal((await stateOf(service, empty.id)).state, AiSessionState.Idle);
    const slow = await service.create({ logId: log.id, mode: AiMode.Isolated }); const pending = service.prompt({ sessionId: slow.id, prompt: 'slow-admission' }); const stopped = service.abort(slow.id); await pause(20); runs.get(slow.id)?.admit?.(); await Promise.all([pending, stopped]); await pause(50); assert.equal((await stateOf(service, slow.id)).state, AiSessionState.Aborted);
    process.stdout.write('verify-ai-flow: ok\n');
  } finally { await service.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}
await main();
