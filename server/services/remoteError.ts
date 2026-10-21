import { ApiErrorCode } from '../config/constants';
import { ServiceError } from './serviceError';

export class RemoteError {
  /** 把 ssh2 / sftp / smb 原始错误翻译成可行动的中文提示，避免统一的“请检查连接和权限”。 */
  static from(error: unknown, action: string, target = ''): ServiceError {
    if (error instanceof ServiceError) return error;
    const raw = error as { code?: unknown; level?: unknown; message?: unknown } | null;
    const code = String(raw?.code ?? '');
    const level = String(raw?.level ?? '');
    const text = String(raw?.message ?? '').toLowerCase();
    const where = target ? `：${target}` : '';
    if (level === 'client-authentication' || text.includes('authentication methods failed') || text.includes('all configured authentication')) {
      return new ServiceError(ApiErrorCode.AuthFailed, '认证失败：用户名、密码或私钥不正确', 401);
    }
    if (text.includes('passphrase') || text.includes('encrypted private key') || text.includes('cannot parse privatekey')) {
      return new ServiceError(ApiErrorCode.AuthFailed, '私钥无法解析：请检查私钥文件格式或口令', 401);
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || text.includes('getaddrinfo')) {
      return new ServiceError(ApiErrorCode.HostUnreachable, '主机名无法解析，请检查主机地址', 502);
    }
    if (code === 'ECONNREFUSED' || text.includes('econnrefused')) {
      return new ServiceError(ApiErrorCode.HostUnreachable, '连接被拒绝：端口未开放或服务未启动', 502);
    }
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || text.includes('ehostunreach') || text.includes('enetunreach')) {
      return new ServiceError(ApiErrorCode.HostUnreachable, '网络不可达，请检查网络或 VPN', 502);
    }
    if (level === 'client-timeout' || code === 'ETIMEDOUT' || text.includes('timed out') || text.includes('timeout')) {
      return new ServiceError(ApiErrorCode.Timeout, '连接超时：服务器无响应，请检查主机、端口和防火墙', 504);
    }
    if (text.includes('host key') || text.includes('host verification') || text.includes('hostverifier')) {
      return new ServiceError(ApiErrorCode.AuthFailed, '主机指纹校验失败，服务器身份与登记的不一致', 401);
    }
    if (code === 'ECONNRESET' || text.includes('econnreset') || text.includes('not connected') || text.includes('no sftp connection')) {
      return new ServiceError(ApiErrorCode.HostUnreachable, '连接已断开，请重试', 502);
    }
    if (code === '3' || code === 'EACCES' || text.includes('permission denied') || text.includes('access_denied') || text.includes('status_access_denied')) {
      return new ServiceError(ApiErrorCode.PermissionDenied, `没有权限${action}${where}`, 403);
    }
    if (code === '2' || code === 'ENOENT' || text.includes('no such file') || text.includes('not exist') || text.includes('object_name_not_found') || text.includes('object_path_not_found')) {
      return new ServiceError(ApiErrorCode.FileNotFound, `路径不存在${where}`, 404);
    }
    if (text.includes('not a directory') || text.includes('not_a_directory')) {
      return new ServiceError(ApiErrorCode.NotAFile, `不是目录${where}`, 400);
    }
    return new ServiceError(ApiErrorCode.DownloadFailed, `无法${action}${where}`, 502);
  }
}
