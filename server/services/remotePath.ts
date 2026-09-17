import path from 'node:path';
import { ApiErrorCode } from '../config/constants';
import { ServiceError } from './serviceError';

export class RemotePath {
  static parse(value: string): string {
    if (!value || typeof value !== 'string' || value.includes('\0')) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, '请输入有效的远程文件路径', 400);
    }
    const normalized = path.posix.normalize(value.trim());
    if (!normalized.startsWith('/')) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, '远程文件路径必须是绝对路径', 400);
    }
    return normalized;
  }

  static underRoot(normalized: string, root: string): boolean {
    const safeRoot = path.posix.normalize(root);
    const prefix = safeRoot === '/' ? '/' : `${safeRoot.replace(/\/$/, '')}/`;
    return normalized === safeRoot || normalized.startsWith(prefix);
  }

  static assertAllowed(value: string, roots: string[]): string {
    const normalized = this.parse(value);
    const list = roots.length > 0 ? roots : ['/'];
    if (list.some((root) => this.underRoot(normalized, root))) return normalized;
    const safeRoot = path.posix.normalize(list[0]);
    const message = list.length === 1
      ? `远程路径必须位于 ${safeRoot} 下`
      : '远程路径必须位于已注册的日志路径下';
    throw new ServiceError(ApiErrorCode.PathDenied, message, 403);
  }

  static rootsOf(root: string, roots?: string[]): string[] {
    return roots && roots.length > 0 ? roots : [root];
  }
}
