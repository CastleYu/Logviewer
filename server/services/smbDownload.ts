import fs from 'node:fs';
import path from 'node:path';
import { ApiErrorCode, DownloadStatus } from '../config/constants';
import type { DownloadTask, SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';
import { smbRelPath, withSmbTree } from './smbSession';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { capBytes, tooLarge } from './downloadStreams';
import { RemoteError } from './remoteError';

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
      task.remoteSize = size;
      if (size > profile.maxBytes) throw tooLarge(size, profile.maxBytes);
      task.totalBytes = size;
      const target = task.gzip ? `${task.partPath}.gz` : task.partPath;
      if (task.cancelled) return;
      task.status = DownloadStatus.Downloading;
      const source = await tree.createFileReadStream(remote);
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(target);
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
      const local = fs.statSync(target);
      if (local.size !== task.totalBytes) throw new Error('下载文件大小与远程文件不一致');
      if (task.gzip) {
        await pipeline(fs.createReadStream(target), zlib.createGunzip(), capBytes(profile.maxBytes), fs.createWriteStream(task.partPath));
        fs.rmSync(target, { force: true });
      }
      fs.renameSync(task.partPath, task.localPath);
      const final = fs.statSync(task.localPath);
      task.downloadedBytes = final.size;
      task.totalBytes = final.size;
      task.status = DownloadStatus.Completed;
    });
  } catch (error) {
    try {
      fs.rmSync(task.partPath, { force: true });
      fs.rmSync(`${task.partPath}.gz`, { force: true });
    } catch {
      // Cache cleanup is best-effort.
    }
    if (!task.cancelled) {
      task.status = DownloadStatus.Failed;
      task.error = (error as { code?: string })?.code === 'Z_DATA_ERROR' ? '不是有效的 gzip 文件' : RemoteError.from(error, '下载文件', task.remotePath).message;
    }
  } finally { task.abort = undefined; }
}
