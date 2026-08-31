import fs from 'node:fs';
import type { Express, NextFunction, Request, Response } from 'express';
import { ApiErrorCode, ApiPath } from '../config/constants';
import { SftpConfig } from '../config/sftpConfig';
import type { SftpProfile } from '../models/sftpModels';
import { DownloadService, ServiceError } from '../services/downloadService';

export function registerSftpRoutes(app: Express, service: DownloadService, profile: SftpProfile | null): void {
  app.get(ApiPath.Health, (_request, response) => response.json({ ok: true }));
  app.get(ApiPath.Profiles, (_request, response) => response.json({ profiles: SftpConfig.public(profile) }));
  app.post(ApiPath.Downloads, (request, response, next) => {
    try {
      const profileId = typeof request.body?.profileId === 'string' ? request.body.profileId : '';
      const remotePath = typeof request.body?.remotePath === 'string' ? request.body.remotePath : '';
      response.status(202).json(service.create(profileId, remotePath));
    } catch (error) {
      next(error);
    }
  });
  app.get(`${ApiPath.Downloads}/:id`, (request, response, next) => {
    try {
      response.json(service.get(request.params.id));
    } catch (error) {
      next(error);
    }
  });
  app.delete(`${ApiPath.Downloads}/:id`, async (request, response, next) => {
    try {
      response.json(await service.cancel(request.params.id));
    } catch (error) {
      next(error);
    }
  });
  app.get(`${ApiPath.Downloads}/:id/content`, (request, response, next) => {
    try {
      const task = service.file(request.params.id);
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Length', String(task.totalBytes));
      response.setHeader('X-File-Name', encodeURIComponent(task.fileName));
      const stream = fs.createReadStream(task.localPath);
      stream.on('error', next);
      response.on('close', () => service.consume(task.id));
      stream.pipe(response);
    } catch (error) {
      next(error);
    }
  });
}

export function registerErrorRoute(app: Express): void {
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ServiceError) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    response.status(500).json({ code: ApiErrorCode.DownloadFailed, message: '服务暂时无法完成该操作' });
  });
}
