import express, { type Express } from 'express';
import { HistoryConst, HistoryKind } from '../../src/config/historyTypes';
import { HistoryStore } from '../services/historyStore';
import { pickPath } from '../services/windowsPick';

export function registerHistoryRoutes(app: Express, store: HistoryStore): void {
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.get(HistoryConst.Header) !== HistoryConst.HeaderValue) { res.status(403).json({ message: '请从 LogViewer 打开历史记录' }); return; }
    next();
  });
  router.get('/', async (_req, res, next) => { try { res.json(await store.list()); } catch (e) { next(e); } });
  router.post('/', express.text({ type: 'text/plain', limit: '1gb' }), async (req, res, next) => {
    try {
      const name = String(req.query.name || '日志');
      const origin = String(req.query.origin || name);
      const kind = Object.values(HistoryKind).includes(req.query.kind as HistoryKind) ? req.query.kind as HistoryKind : HistoryKind.Local;
      res.status(201).json(await store.save({ name, origin, kind, formatId: String(req.query.formatId || '') }, req.body));
    } catch (e) { next(e); }
  });
  router.post(HistoryConst.Local, async (req, res, next) => { try { res.status(201).json(await store.local(req.body.path, req.body.formatId || '')); } catch (e) { next(e); } });
  router.post(HistoryConst.Pick, async (_req, res, next) => { try { res.json({ path: await pickPath('file', '*.*') }); } catch (e) { next(e); } });
  router.get('/:id/content', async (req, res, next) => { try { await store.get(req.params.id); res.type('text/plain').sendFile(store.contentPath(req.params.id)); } catch (e) { next(e); } });
  router.get('/:id', async (req, res, next) => { try { res.json(await store.get(req.params.id)); } catch (e) { next(e); } });
  router.patch('/:id', async (req, res, next) => { try { res.json(await store.update(req.params.id, { repository: req.body.repository })); } catch (e) { next(e); } });
  router.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ message: error.message }); });
  app.use(HistoryConst.Api, router);
}
