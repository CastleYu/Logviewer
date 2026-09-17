import { Client } from '@awo00/smb2';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';

export async function withSmbTree<T>(profile: SftpProfile, fn: (tree: Awaited<ReturnType<Awaited<ReturnType<Client['authenticate']>>['connectTree']>>) => Promise<T>): Promise<T> {
  const share = profile.share?.trim();
  if (!share) throw new ServiceError(ApiErrorCode.InvalidRequest, 'SMB 服务器需要填写共享名', 400);
  const client = new Client(profile.host, {
    port: profile.port || ServerValue.DefaultSmbPort,
    connectTimeout: ServerValue.ConnectTimeoutMs,
    requestTimeout: ServerValue.ReadyTimeoutMs,
  });
  try {
    await client.connect();
  } catch {
    await client.close().catch(() => undefined);
    throw new ServiceError(ApiErrorCode.DownloadFailed, '无法连接到 SMB 服务器，请检查主机、共享名、用户名和密码', 502);
  }
  try {
    const session = await client.authenticate({
      domain: profile.domain?.trim() || '.',
      username: profile.user,
      password: profile.password || '',
    });
    const tree = await session.connectTree(share);
    try {
      return await fn(tree);
    } finally {
      await tree.disconnect().catch(() => undefined);
      await session.logoff().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(ApiErrorCode.DownloadFailed, '无法访问 SMB 共享，请检查共享名、用户名、密码和路径', 502);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function smbRelPath(posixPath: string): string {
  if (!posixPath || posixPath === '/') return '/';
  return posixPath.startsWith('/') ? posixPath : `/${posixPath}`;
}
