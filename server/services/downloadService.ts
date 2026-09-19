import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import SftpClient from 'ssh2-sftp-client';
import { ApiErrorCode, DownloadStatus, ServerValue } from '../config/constants';
import type { DownloadTask, DownloadTaskView, SftpProfile } from '../models/sftpModels';
import { RemotePath } from './remotePath';
import { ServiceError } from './serviceError';
import { downloadSmbFile } from './smbDownload';

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

  create(profileId: string, remotePath: string): DownloadTaskView {
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
      await client.connect({
        host: profile.host, port: profile.port, username: profile.user,
        password: profile.password, privateKey: profile.privateKey,
        readyTimeout: ServerValue.ReadyTimeoutMs, keepaliveInterval: ServerValue.KeepaliveMs,
        hostHash: profile.fingerprint ? 'sha256' : undefined,
        hostVerifier: profile.fingerprint ? (value) => value === profile.fingerprint : undefined,
      });
      if (task.cancelled) return;
      const exists = await client.exists(task.remotePath);
      if (!exists) throw new ServiceError(ApiErrorCode.FileNotFound, '远程文件不存在', 404);
      if (exists !== '-' && exists !== 'l') throw new ServiceError(ApiErrorCode.NotAFile, '指定路径不是普通文件', 400);
      const resolvedPath = await client.realPath(task.remotePath);
      this.remotePath(resolvedPath, RemotePath.rootsOf(profile.root, profile.roots));
      const stat = await client.stat(task.remotePath);
      task.totalBytes = stat.size;
      task.status = DownloadStatus.Downloading;
      await client.fastGet(task.remotePath, task.partPath, {
        step: (transferred, _chunk, total) => {
          if (task.cancelled) return;
          task.downloadedBytes = transferred;
          task.totalBytes = total;
        },
      });
      if (task.cancelled) return;
      const local = fs.statSync(task.partPath);
      if (local.size !== task.totalBytes) throw new Error('下载文件大小与远程文件不一致');
      fs.renameSync(task.partPath, task.localPath);
      task.downloadedBytes = task.totalBytes;
      task.status = DownloadStatus.Completed;
    } catch (error) {
      this.remove(task.partPath);
      if (!task.cancelled) {
        task.status = DownloadStatus.Failed;
        task.error = error instanceof ServiceError ? error.message : 'SFTP 下载失败，请检查连接、权限和远程路径';
      }
    } finally {
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
