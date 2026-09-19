import path from 'node:path';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { RemotePath } from './remotePath';
import { ServiceError } from './serviceError';
import { withSftpSession } from './remoteSession';

export interface RemoteDirEntry {
  name: string;
  type: 'file' | 'dir' | 'link';
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
  try {
    const items = await withSftpSession(profile, (client) => client.list(target));
    const entries: RemoteDirEntry[] = items
      .filter((item) => item.name && item.name !== '.' && item.name !== '..')
      .map((item) => ({
        name: item.name,
        type: item.type === 'd' ? 'dir' as const : item.type === 'l' ? 'link' as const : 'file' as const,
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
  }
}
