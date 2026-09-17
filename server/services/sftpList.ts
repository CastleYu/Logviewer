import SftpClient from 'ssh2-sftp-client';
import path from 'node:path';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { RemotePath } from './remotePath';
import { ServiceError } from './serviceError';

export interface RemoteDirEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modifyTime?: number;
}

export interface RemoteDirList {
  path: string;
  entries: RemoteDirEntry[];
}

export async function listSftpDir(profile: SftpProfile, requestedPath: string): Promise<RemoteDirList> {
  if (profile.protocol && profile.protocol !== 'sftp') {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '当前浏览通道仅支持 SFTP 服务器', 400);
  }
  const roots = RemotePath.rootsOf(profile.root, profile.roots);
  const target = requestedPath.trim()
    ? RemotePath.assertAllowed(requestedPath, roots)
    : path.posix.normalize(roots[0] || ServerValue.DefaultRoot);
  const client = new SftpClient('logviewer-list');
  try {
    await client.connect({
      host: profile.host,
      port: profile.port,
      username: profile.user,
      password: profile.password,
      privateKey: profile.privateKey,
      readyTimeout: ServerValue.ReadyTimeoutMs,
      keepaliveInterval: ServerValue.KeepaliveMs,
      hostHash: profile.fingerprint ? 'sha256' : undefined,
      hostVerifier: profile.fingerprint ? (value) => value === profile.fingerprint : undefined,
    });
    const exists = await client.exists(target);
    if (!exists) throw new ServiceError(ApiErrorCode.FileNotFound, '远程目录不存在', 404);
    if (exists !== 'd') throw new ServiceError(ApiErrorCode.NotAFile, '指定路径不是目录', 400);
    const items = await client.list(target);
    const entries: RemoteDirEntry[] = items
      .filter((item) => item.name && item.name !== '.' && item.name !== '..')
      .map((item) => ({
        name: item.name,
        type: item.type === 'd' ? 'dir' as const : 'file' as const,
        size: Number(item.size) || 0,
        modifyTime: item.modifyTime ? Number(item.modifyTime) : undefined,
      }))
      .sort((left, right) => {
        if (left.type !== right.type) return left.type === 'dir' ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    return { path: target, entries };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(ApiErrorCode.DownloadFailed, '无法列出远程目录，请检查连接和权限', 502);
  } finally {
    await client.end().catch(() => false);
  }
}
