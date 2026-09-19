// Browser acceptance fixture only. This does not call any model.
import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json({ limit: '10mb' }));
const sessions = new Map<string, { directory: string; busy: boolean; messages: unknown[] }>();
app.post('/session', (req, res) => {
  const id = `ses_${crypto.randomUUID()}`;
  sessions.set(id, { directory: String(req.query.directory), busy: false, messages: [] });
  res.json({ id });
});
app.get('/path', (req, res) => res.json({ directory: req.query.directory }));
app.get('/provider', (_req, res) => res.json({ all: [{ id: 'internal-fixture', name: '本机验收模拟', models: { diagnostic: { id: 'diagnostic', name: '模拟诊断（非大模型）' } } }], connected: ['internal-fixture'], default: { 'internal-fixture': 'diagnostic' } }));
app.get('/agent', (_req, res) => res.json([{ name: 'build', mode: 'primary' }]));
app.get('/permission', (_req, res) => res.json([]));
app.get('/question', (_req, res) => res.json([]));
app.get('/session/status', (_req, res) => res.json(Object.fromEntries([...sessions].map(([id, session]) => [id, { type: session.busy ? 'busy' : 'idle' }]))));
app.get('/session/:id/message', (req, res) => res.json(sessions.get(req.params.id)?.messages || []));
app.post('/session/:id/prompt_async', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).end();
  session.busy = true;
  session.messages.push({ info: { id: crypto.randomUUID(), role: 'user' }, parts: req.body.parts });
  setTimeout(() => {
    if (!session.busy) return;
    session.messages.push({ info: { id: crypto.randomUUID(), role: 'assistant', time: { completed: Date.now() }, finish: 'stop' }, parts: [{ type: 'text', text: '验收模拟响应：已接收日志上下文。此服务只验证 UI、会话及持久化，不代表真实模型分析结果。\n\n诊断步骤：关联请求标识，核对第一处异常和源码调用链，再验证根因假设。' }] });
    session.busy = false;
  }, 800);
  res.status(204).end();
});
app.post('/session/:id/abort', (req, res) => { const session = sessions.get(req.params.id); if (session) session.busy = false; res.json(true); });
const server = app.listen(4097, '127.0.0.1', () => console.log('Acceptance fixture http://127.0.0.1:4097 (no model calls)'));
process.once('SIGINT', () => server.close());
