import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import SftpClient from 'ssh2-sftp-client';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { ApiErrorCode, DownloadStatus, ServerValue } from '../config/constants';
import type { DownloadTask, DownloadTaskView, SftpProfile } from '../models/sftpModels';
import { RemotePath } from './remotePath';
import { ServiceError } from './serviceError';
import { downloadSmbFile } from './smbDownload';
import { RemoteError } from './remoteError';
import { capBytes, skipFirstLine, tooLarge } from './downloadStreams';
import { sftpOptions } from './remoteSession';

export interface DownloadOptions {
  tailBytes?: number;
}

export { ServiceError };

export class DownloadService {
  private readonly tasks = new Map<string, DownloadTask>();
  private readonly cacheDir: string;

  constructor(
    private readonly profile: SftpProfile | null,
    rootDir: string,
    private readonly lookup: ((id: string) => SftpProfile | null) | null = null,
  ) {
    this.cacheDir = path.resolve(rootDir, ServerValue.CacheDir);
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  create(profileId: string, remotePath: string, options: DownloadOptions = {}): DownloadTaskView {
    const profile = this.requireProfile(profileId);
    const safePath = this.remotePath(remotePath, RemotePath.rootsOf(profile.root, profile.roots));
    const id = crypto.randomUUID();
    const fileName = path.posix.basename(safePath);
    const localPath = path.join(this.cacheDir, `${id}-${fileName}`);
    const task: DownloadTask = {
      id,
      profileId,
      remotePath: safePath,
      fileName,
      localPath,
      partPath: `${localPath}${ServerValue.PartSuffix}`,
      status: DownloadStatus.Queued,
      downloadedBytes: 0,
      totalBytes: 0,
      cancelled: false,
      tailBytes: options.tailBytes && options.tailBytes > 0 ? Math.floor(options.tailBytes) : undefined,
      gzip: fileName.toLowerCase().endsWith(ServerValue.GzipSuffix),
    };
    this.tasks.set(id, task);
    void (profile.protocol === 'smb' ? downloadSmbFile(task, profile) : this.run(task, profile));
    return this.view(task);
  }

  get(id: string): DownloadTaskView {
    return this.view(this.requireTask(id));
  }

  file(id: string): DownloadTask {
    const task = this.requireTask(id);
    if (task.status !== DownloadStatus.Completed) {
      throw new ServiceError(ApiErrorCode.TaskNotReady, '远程文件尚未下载完成', 409);
    }
    return task;
  }

  async cancel(id: string): Promise<DownloadTaskView> {
    const task = this.requireTask(id);
    if (task.status === DownloadStatus.Completed || task.status === DownloadStatus.Failed || task.status === DownloadStatus.Cancelled) {
      return this.view(task);
    }
    task.cancelled = true;
    task.status = DownloadStatus.Cancelled;
    task.abort?.();
    await task.client?.end().catch(() => false);
    this.remove(task.partPath);
    return this.view(task);
  }

  consume(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    this.remove(task.localPath);
    this.tasks.delete(id);
  }

  private async run(task: DownloadTask, profile: SftpProfile): Promise<void> {
    const client = new SftpClient(`logviewer-download-${task.id}`);
    task.client = client;
    try {
      await client.connect(sftpOptions(profile));
      if (task.cancelled) return;
      const exists = await client.exists(task.remotePath);
      if (!exists) throw new ServiceError(ApiErrorCode.FileNotFound, `远程文件不存在：${task.remotePath}`, 404);
      if (exists === 'd') throw new ServiceError(ApiErrorCode.NotAFile, '这是一个目录，不能作为日志打开', 400);
      const stat = await client.stat(task.remotePath);
      if (stat.isDirectory) throw new ServiceError(ApiErrorCode.NotAFile, '这是一个目录，不能作为日志打开', 400);
      const size = Number(stat.size) || 0;
      task.remoteSize = size;
      const tail = !task.gzip && task.tailBytes && size > task.tailBytes ? task.tailBytes : 0;
      if (!tail && size > profile.maxBytes) throw tooLarge(size, profile.maxBytes);
      task.status = DownloadStatus.Downloading;
      const target = task.gzip ? `${task.partPath}.gz` : task.partPath;
      if (tail) {
        const start = size - tail;
        task.skippedBytes = start;
        task.totalBytes = tail;
        const source = client.createReadStream(task.remotePath, { start });
        task.abort = () => source.destroy();
        source.on('data', (chunk: Buffer) => { task.downloadedBytes += chunk.length; });
        await pipeline(source, skipFirstLine(), fs.createWriteStream(target));
      } else {
        task.totalBytes = size;
        await client.fastGet(task.remotePath, target, {
          step: (transferred, _chunk, total) => {
            if (task.cancelled) return;
            task.downloadedBytes = transferred;
            task.totalBytes = total;
          },
        });
        if (fs.statSync(target).size !== size) throw new Error('下载文件大小与远程文件不一致');
      }
      if (task.cancelled) return;
      if (task.gzip) {
        await pipeline(fs.createReadStream(target), zlib.createGunzip(), capBytes(profile.maxBytes), fs.createWriteStream(task.partPath));
        this.remove(target);
      }
      fs.renameSync(task.partPath, task.localPath);
      task.totalBytes = fs.statSync(task.localPath).size;
      task.downloadedBytes = task.totalBytes;
      task.status = DownloadStatus.Completed;
    } catch (error) {
      this.remove(task.partPath);
      this.remove(`${task.partPath}.gz`);
      if (!task.cancelled) {
        task.status = DownloadStatus.Failed;
        task.error = (error as { code?: string })?.code === 'Z_DATA_ERROR'
          ? '不是有效的 gzip 文件'
          : RemoteError.from(error, '下载文件', task.remotePath).message;
      }
    } finally {
      task.abort = undefined;
      await client.end().catch(() => false);
      task.client = undefined;
    }
  }

  private requireProfile(profileId: string): SftpProfile {
    if (this.profile && profileId === this.profile.id) return this.profile;
    const registered = this.lookup?.(profileId) || null;
    if (registered) return registered;
    throw new ServiceError(ApiErrorCode.ServerUnavailable, 'SFTP 服务器尚未配置', 503);
  }

  private remotePath(value: string, roots: string[]): string {
    return RemotePath.assertAllowed(value, roots);
  }

  private requireTask(id: string): DownloadTask {
    const task = this.tasks.get(id);
    if (!task) throw new ServiceError(ApiErrorCode.TaskNotFound, '下载任务不存在或已过期', 404);
    return task;
  }

  private view(task: DownloadTask): DownloadTaskView {
    return {
      id: task.id,
      status: task.status,
      fileName: task.fileName,
      downloadedBytes: task.downloadedBytes,
      totalBytes: task.totalBytes,
      error: task.error,
      remoteSize: task.remoteSize,
      skippedBytes: task.skippedBytes,
      gzip: task.gzip,
    };
  }

  private remove(target: string): void {
    try {
      fs.rmSync(target, { force: true });
    } catch {
      // Cache cleanup is best-effort; a later run may remove an unlocked file.
    }
  }
}
