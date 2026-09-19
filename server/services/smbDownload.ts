import fs from 'node:fs';
import path from 'node:path';
import { ApiErrorCode, DownloadStatus } from '../config/constants';
import type { DownloadTask, SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';
import { smbRelPath, withSmbTree } from './smbSession';

export async function downloadSmbFile(task: DownloadTask, profile: SftpProfile): Promise<void> {
  try {
    await withSmbTree(profile, async (tree) => {
      if (task.cancelled) return;
      const remote = smbRelPath(task.remotePath);
      const exists = await tree.exists(remote);
      if (!exists) throw new ServiceError(ApiErrorCode.FileNotFound, '远程文件不存在', 404);
      const parent = path.posix.dirname(task.remotePath);
      const base = path.posix.basename(task.remotePath);
      const siblings = await tree.readDirectory(smbRelPath(parent));
      const entry = siblings.find((item) => item.filename === base);
      if (!entry) throw new ServiceError(ApiErrorCode.FileNotFound, '远程文件不存在', 404);
      if (entry.type === 'Directory') throw new ServiceError(ApiErrorCode.NotAFile, '指定路径不是普通文件', 400);
      const size = Number(entry.fileSize) || 0;
      task.totalBytes = size;
      if (task.cancelled) return;
      task.status = DownloadStatus.Downloading;
      const source = await tree.createFileReadStream(remote);
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(task.partPath);
        task.abort = () => { source.destroy?.(); output.destroy(); reject(new Error('download cancelled')); };
        source.on('data', (chunk: Buffer) => {
          task.downloadedBytes += chunk.length;
          if (task.cancelled) {
            task.abort?.();
          }
        });
        source.on('error', reject);
        output.on('error', reject);
        output.on('finish', resolve);
        source.pipe(output);
      });
      if (task.cancelled) return;
      const local = fs.statSync(task.partPath);
      if (local.size !== task.totalBytes) throw new Error('下载文件大小与远程文件不一致');
      fs.renameSync(task.partPath, task.localPath);
      task.downloadedBytes = local.size;
      task.totalBytes = local.size;
      task.status = DownloadStatus.Completed;
    });
  } catch (error) {
    try {
      fs.rmSync(task.partPath, { force: true });
    } catch {
      // Cache cleanup is best-effort.
    }
    if (!task.cancelled) {
      task.status = DownloadStatus.Failed;
      task.error = error instanceof ServiceError ? error.message : 'SMB 下载失败，请检查连接、权限和远程路径';
    }
  } finally { task.abort = undefined; }
}
