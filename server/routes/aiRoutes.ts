import express, { type Express } from 'express';
import { AiConst, AiRoute } from '../../src/config/aiTypes';
import type { AiService } from '../services/aiService';

export function registerAiRoutes(app: Express, service: AiService): void {
  const router = express.Router();
  router.use(express.json({ limit: AiConst.JsonLimit }));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const send = (res: express.Response, next: express.NextFunction, task: () => Promise<unknown>, status = 200) => {
    task().then((value) => res.status(status).json(value)).catch(next);
  };
  router.get(AiRoute.State, (req, res, next) => send(res, next, async () => ({ ...await service.state(), remote: await service.listed() })));
  router.get(AiRoute.Events, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const off = service.subscribe((payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`));
    const timer = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(timer); off(); });
  });
  router.put(AiRoute.Config, (req, res, next) => send(res, next, () => service.configure(req.body || {})));
  router.post(AiRoute.Probe, (req, res, next) => send(res, next, () => service.probe(req.body?.command)));
  router.post(AiRoute.Login, (_req, res, next) => send(res, next, () => service.login()));
  router.post(AiRoute.Sessions, (req, res, next) => send(res, next, () => service.create(req.body || {}), 201));
  router.delete(`${AiRoute.Sessions}/:id`, (req, res, next) => send(res, next, () => service.remove(req.params.id)));
  router.post(AiRoute.Repository, (req, res, next) => send(res, next, () => service.repository(req.body || {})));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Prompt}`, (req, res, next) => send(res, next, () => service.prompt({ sessionId: req.params.id, text: String(req.body?.text || req.body?.prompt || ''), steer: req.body?.steer === true, view: req.body?.view })));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Abort}`, (req, res, next) => send(res, next, () => service.abort(req.params.id)));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Resume}`, (req, res, next) => send(res, next, () => service.resume(req.params.id)));
  router.delete(`${AiRoute.Sessions}/:id${AiRoute.Queue}/:itemId`, (req, res, next) => send(res, next, () => service.drop(req.params.id, req.params.itemId)));
  router.put(`${AiRoute.Sessions}/:id${AiRoute.Queue}`, (req, res, next) => send(res, next, () => service.order(req.params.id, Array.isArray(req.body?.ids) ? req.body.ids : [])));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.View}`, (req, res, next) => send(res, next, () => service.view(req.params.id, req.body || {})));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Terminal}`, (req, res, next) => send(res, next, () => service.openTerminal(req.params.id)));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Refresh}`, (req, res, next) => send(res, next, () => service.refresh(req.params.id)));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Close}`, (req, res, next) => send(res, next, () => service.closeSession(req.params.id)));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Model}`, (req, res, next) => send(res, next, () => service.option(req.params.id, 'model', String(req.body?.value || ''))));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Mode}`, (req, res, next) => send(res, next, () => service.option(req.params.id, String(req.body?.id || 'mode'), String(req.body?.value || ''))));
  router.get(`${AiRoute.Sessions}/:id${AiRoute.Commands}`, (req, res, next) => send(res, next, () => service.commands(req.params.id)));
  router.post(`${AiRoute.Sessions}/:id${AiRoute.Permit}/:permitId`, (req, res, next) => send(res, next, () => service.allow(req.params.id, req.params.permitId)));
  router.get(`${AiRoute.Notes}/:logId`, (req, res, next) => send(res, next, () => service.notesOf(req.params.logId)));
  router.put(`${AiRoute.Notes}/:logId`, (req, res, next) => send(res, next, () => service.saveNote(req.params.logId, String(req.body?.name || ''), String(req.body?.text || ''), req.body?.id ? String(req.body.id) : undefined)));
  router.delete(`${AiRoute.Notes}/:id${AiRoute.Undo}`, (req, res, next) => send(res, next, () => service.undo(req.params.id)));
  router.get(`${AiRoute.Sessions}/:id/cli`, (req, res, next) => send(res, next, async () => ({ command: service.cli(req.params.id) })));
  router.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error.message || 'AI 请求失败';
    res.status(400).json({ message: message.split('\n')[0].slice(0, 400) });
  });
  app.use(AiConst.Api, router);
}
