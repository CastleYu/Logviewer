import type { Express, Request, Response, NextFunction } from 'express';
import { SourceConst } from '../../src/config/sourceTypes';
import { SourceError, SourceService } from '../services/sourceService';
import { localAccess } from './localAccess';

export function registerSourceRoutes(app: Express, service: SourceService): void {
  app.use(SourceConst.Api, localAccess, (request, response, next) => {
    if (request.get(SourceConst.Header) !== SourceConst.HeaderValue) {
      response.status(403).json({ message: '仅允许本机 LogViewer 页面访问源码索引' });
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get(SourceConst.Api + SourceConst.Config, (_request, response) => response.json(service.state()));
  app.post(SourceConst.Api + SourceConst.Rebuild, async (request, response, next) => {
    try { response.json(await service.rebuild(request.body)); } catch (error) { next(error); }
  });
  app.post(SourceConst.Api + SourceConst.Root, async (request, response, next) => {
    try { response.status(201).json(await service.addRoot(request.body?.path)); } catch (error) { next(error); }
  });
  app.delete(SourceConst.Api + SourceConst.Root, async (request, response, next) => {
    try { response.json(await service.removeRoot(request.body?.path || request.query.path)); } catch (error) { next(error); }
  });
  app.post(SourceConst.Api + SourceConst.RootRebuild, async (request, response, next) => {
    try { response.json(await service.rebuildRoot(request.body?.path)); } catch (error) { next(error); }
  });
  app.post(SourceConst.Api + SourceConst.Openers, async (request, response, next) => {
    try { response.json(await service.saveOpeners(request.body?.openers)); } catch (error) { next(error); }
  });
  app.post(SourceConst.Api + SourceConst.PickFolder, async (_request, response, next) => {
    try {
      const { pickPath } = await import('../services/windowsPick');
      response.json({ path: await pickPath('folder') });
    } catch (error) { next(error); }
  });
  app.post(SourceConst.Api + SourceConst.PickFile, async (request, response, next) => {
    try {
      const { pickPath } = await import('../services/windowsPick');
      const fileName = typeof request.body?.fileName === 'string' && request.body.fileName.trim() ? request.body.fileName.trim() : '*.exe';
      response.json({ path: await pickPath('file', fileName) });
    } catch (error) { next(error); }
  });
  app.get(SourceConst.Api + SourceConst.Lookup, (request, response) => response.json(service.lookup(typeof request.query.file === 'string' ? request.query.file : '')));
  app.post(SourceConst.Api + SourceConst.Open, async (request, response, next) => {
    try { response.json(await service.open(request.body?.file, request.body?.path, request.body?.line, request.body?.openerId)); } catch (error) { next(error); }
  });
  app.use(SourceConst.Api, (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(error instanceof SourceError ? error.status : 500).json({ message: error instanceof SourceError ? error.message : '源码服务操作失败，请检查目录权限和本地配置' });
  });
}
