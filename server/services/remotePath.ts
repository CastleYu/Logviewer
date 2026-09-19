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
    // The server account and SSH/SFTP permissions are the authority for remote paths.
    // Registered roots remain useful as browse defaults, but are not an artificial jail.
    return this.parse(value);
  }

  static rootsOf(root: string, roots?: string[]): string[] {
    return roots && roots.length > 0 ? roots : [root];
  }
}
