import fs from 'node:fs';
import type { Express, NextFunction, Request, Response } from 'express';
import { ApiErrorCode, ApiPath, ServerValue } from '../config/constants';
import { RemoteRegistry } from '../config/remoteRegistry';
import { SftpConfig } from '../config/sftpConfig';
import type { RemoteServerInput } from '../models/remoteModels';
import type { SftpProfile } from '../models/sftpModels';
import { DownloadService, ServiceError } from '../services/downloadService';
import { listSftpDir } from '../services/sftpList';
import { listSmbDir } from '../services/smbList';
import { execSftpCommand } from '../services/sftpExec';
import { probeSftp } from '../services/sftpProbe';
import { probeSmb } from '../services/smbProbe';

export function registerSftpRoutes(
  app: Express,
  service: DownloadService,
  profile: SftpProfile | null,
  registry: RemoteRegistry,
): void {
  app.get(ApiPath.Health, (_request, response) => response.json({ ok: true }));
  app.get(ApiPath.Profiles, (_request, response) => {
    response.json({ profiles: [...SftpConfig.public(profile), ...registry.publicViews()] });
  });
  app.get(ApiPath.Servers, (_request, response) => response.json({ servers: registry.list() }));
  app.post(ApiPath.Servers, (request, response, next) => {
    try {
      response.status(201).json({ server: registry.create(bodyAsInput(request.body)) });
    } catch (error) {
      next(error);
    }
  });
  app.put(`${ApiPath.Servers}/:id`, (request, response, next) => {
    try {
      response.json({ server: registry.update(request.params.id, bodyAsInput(request.body)) });
    } catch (error) {
      next(error);
    }
  });
  app.post(ApiPath.ServerProbe, async (request, response, next) => {
    try {
      const record = registry.preview(bodyAsInput(request.body));
      response.json(record.protocol === 'smb' ? await probeSmb(record) : await probeSftp(record));
    } catch (error) {
      next(error);
    }
  });
  app.delete(`${ApiPath.Servers}/:id`, (request, response, next) => {
    try {
      registry.delete(request.params.id);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
  app.get(ApiPath.List, async (request, response, next) => {
    try {
      const profileId = typeof request.query.profileId === 'string' ? request.query.profileId : '';
      const remotePath = typeof request.query.path === 'string' ? request.query.path : '';
      const resolved = resolveListedProfile(profile, registry, profileId);
      response.json(resolved.protocol === 'smb' ? await listSmbDir(resolved, remotePath) : await listSftpDir(resolved, remotePath));
    } catch (error) {
      next(error);
    }
  });
  app.post(ApiPath.Exec, async (request, response, next) => {
    try {
      const profileId = typeof request.body?.profileId === 'string' ? request.body.profileId : '';
      const remotePath = typeof request.body?.path === 'string' ? request.body.path : '';
      const command = typeof request.body?.command === 'string' ? request.body.command : '';
      const resolved = resolveListedProfile(profile, registry, profileId);
      response.json(await execSftpCommand(resolved, remotePath, command));
    } catch (error) {
      next(error);
    }
  });
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

function resolveListedProfile(envProfile: SftpProfile | null, registry: RemoteRegistry, profileId: string): SftpProfile {
  if (envProfile && profileId === envProfile.id) return envProfile;
  const registered = registry.toProfile(profileId);
  if (registered) return registered;
  if (profileId === ServerValue.ProfileId) {
    throw new ServiceError(ApiErrorCode.ServerUnavailable, 'SFTP 服务器尚未配置', 503);
  }
  throw new ServiceError(ApiErrorCode.ServerNotFound, '未找到该注册服务器', 404);
}

function bodyAsInput(body: unknown): RemoteServerInput {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return {
    protocol: value.protocol === 'smb' ? 'smb' : 'sftp',
    name: typeof value.name === 'string' ? value.name : '',
    host: typeof value.host === 'string' ? value.host : '',
    port: typeof value.port === 'number' ? value.port : (value.port === undefined || value.port === '' ? undefined : Number(value.port)),
    user: typeof value.user === 'string' ? value.user : '',
    password: typeof value.password === 'string' ? value.password : '',
    paths: Array.isArray(value.paths) ? value.paths.filter((item): item is string => typeof item === 'string') : [],
    domain: typeof value.domain === 'string' ? value.domain : undefined,
    share: typeof value.share === 'string' ? value.share : undefined,
    fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint : undefined,
    maxBytes: typeof value.maxBytes === 'number' ? value.maxBytes : undefined,
  };
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
