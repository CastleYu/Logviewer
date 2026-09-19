import express, { type Express } from 'express';
import type { AiService } from '../services/aiService';
import { AiConst } from '../../src/config/aiTypes';

export function registerAiRoutes(app: Express, service: AiService): void {
  const router = express.Router();
  router.use(express.json({ limit: AiConst.JsonLimit }));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/state', async (_req, res, next) => { try { res.json(await service.state()); } catch (error) { next(error); } });
  router.put('/config', async (req, res, next) => { try { res.json(await service.configure(req.body)); } catch (error) { next(error); } });
  router.post('/launch', async (_req, res, next) => { try { await service.launch(); res.json(await service.state()); } catch (error) { next(error); } });
  router.post('/sessions', async (req, res, next) => { try { res.status(201).json(await service.create(req.body)); } catch (error) { next(error); } });
  router.post('/sessions/:id/prompt', async (req, res, next) => { try { res.json(await service.prompt({ ...req.body, sessionId: req.params.id })); } catch (error) { next(error); } });
  router.post('/sessions/:id/abort', async (req, res, next) => { try { res.json(await service.abort(req.params.id)); } catch (error) { next(error); } });
  router.post('/sessions/:id/refresh', async (req, res, next) => { try { res.json(await service.refresh(req.params.id)); } catch (error) { next(error); } });
  router.post('/sessions/:id/permissions/:requestId/reply', async (req, res, next) => { try { res.json(await service.replyPermission(req.params.id, req.params.requestId, req.body)); } catch (error) { next(error); } });
  router.post('/sessions/:id/questions/:requestId/reply', async (req, res, next) => { try { res.json(await service.replyQuestion(req.params.id, req.params.requestId, req.body)); } catch (error) { next(error); } });
  router.post('/sessions/:id/questions/:requestId/reject', async (req, res, next) => { try { res.json(await service.replyQuestion(req.params.id, req.params.requestId, {}, true)); } catch (error) { next(error); } });
  router.get('/sessions/:id/catalogs', async (req, res, next) => { try { res.json(await service.catalogs(req.params.id)); } catch (error) { next(error); } });
  router.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ message: error.message }));
  app.use('/api/ai', router);
}
