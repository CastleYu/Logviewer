import path from 'node:path';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import type { RemoteDirList } from './sftpList';
import { RemotePath } from './remotePath';
import { ServiceError } from './serviceError';
import { smbRelPath, withSmbTree } from './smbSession';

export async function listSmbDir(profile: SftpProfile, requestedPath: string): Promise<RemoteDirList> {
  const roots = RemotePath.rootsOf(profile.root, profile.roots);
  const target = requestedPath.trim()
    ? RemotePath.assertAllowed(requestedPath, roots)
    : path.posix.normalize(roots[0] || ServerValue.DefaultRoot);
  return withSmbTree(profile, async (tree) => {
    const exists = await tree.exists(smbRelPath(target));
    if (!exists) throw new ServiceError(ApiErrorCode.FileNotFound, '远程目录不存在', 404);
    let items;
    try {
      items = await tree.readDirectory(smbRelPath(target));
    } catch {
      throw new ServiceError(ApiErrorCode.NotAFile, '指定路径不是目录', 400);
    }
    const entries = items
      .filter((item) => item.filename && item.filename !== '.' && item.filename !== '..')
      .map((item) => ({
        name: item.filename,
        type: item.type === 'Directory' ? 'dir' as const : 'file' as const,
        size: Number(item.fileSize) || 0,
        modifyTime: item.lastWriteTime ? item.lastWriteTime.getTime() : undefined,
      }))
      .sort((left, right) => {
        if (left.type !== right.type) return left.type === 'dir' ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    return { path: target, entries };
  });
}
