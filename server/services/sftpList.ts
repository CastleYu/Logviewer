import path from 'node:path';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { RemotePath } from './remotePath';
import { ServiceError } from './serviceError';
import { withSftpSession } from './remoteSession';
import { RemoteError } from './remoteError';

export interface RemoteDirEntry {
  name: string;
  type: 'file' | 'dir' | 'link';
  size: number;
  modifyTime?: number;
  target?: 'file' | 'dir';
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
    const { items, targets } = await withSftpSession(profile, async (client) => {
      const listed = await client.list(target);
      const links = listed.filter((item) => item.type === 'l').slice(0, ServerValue.LinkResolveLimit);
      const resolved = new Map<string, 'file' | 'dir'>();
      for (const link of links) {
        const stat = await client.stat(path.posix.join(target, link.name)).catch(() => null);
        if (stat) resolved.set(link.name, stat.isDirectory ? 'dir' : 'file');
      }
      return { items: listed, targets: resolved };
    });
    const entries: RemoteDirEntry[] = items
      .filter((item) => item.name && item.name !== '.' && item.name !== '..')
      .map((item) => ({
        name: item.name,
        type: item.type === 'd' ? 'dir' as const : item.type === 'l' ? 'link' as const : 'file' as const,
        size: Number(item.size) || 0,
        modifyTime: item.modifyTime ? Number(item.modifyTime) : undefined,
        target: targets.get(item.name),
      }))
      .sort((left, right) => {
        const leftDir = left.type === 'dir' || left.target === 'dir';
        const rightDir = right.type === 'dir' || right.target === 'dir';
        if (leftDir !== rightDir) return leftDir ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    return { path: target, entries };
  } catch (error) {
    throw RemoteError.from(error, '读取目录', target);
  }
}

export async function sftpHome(profile: SftpProfile): Promise<string> {
  try {
    return await withSftpSession(profile, (client) => client.realPath('.'));
  } catch (error) {
    throw RemoteError.from(error, '读取主目录');
  }
}

export async function statSftp(profile: SftpProfile, target: string): Promise<{ type: 'dir' | 'file'; size: number; modifyTime?: number }> {
  try {
    const stat = await withSftpSession(profile, (client) => client.stat(target));
    return { type: stat.isDirectory ? 'dir' : 'file', size: Number(stat.size) || 0, modifyTime: stat.modifyTime ? Number(stat.modifyTime) : undefined };
  } catch (error) {
    throw RemoteError.from(error, '读取路径信息', target);
  }
}
