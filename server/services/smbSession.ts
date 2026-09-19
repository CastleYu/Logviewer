import { Client } from '@awo00/smb2';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';
import crypto from 'node:crypto';

export class SmbSessionValue {
  static readonly IdleMs = 30_000;
  static readonly MaxSessions = 16;
}

type SmbSession = Awaited<ReturnType<Awaited<ReturnType<Client['authenticate']>>['connectTree']>>;
type SmbEntry = { client: Client; session: Awaited<ReturnType<Client['authenticate']>>; tree: SmbSession; tail: Promise<unknown>; last: number; users: number; active: number; timer?: ReturnType<typeof setTimeout> };
const sessions = new Map<string, SmbEntry>();

function sessionKey(profile: SftpProfile, share: string): string {
  const auth = crypto.createHash('sha256').update(profile.password || '').digest('hex');
  return `${profile.host}\0${profile.port}\0${profile.user}\0${profile.domain || ''}\0${share}\0${profile.fingerprint || ''}\0${auth}`;
}

export async function withSmbTree<T>(profile: SftpProfile, fn: (tree: Awaited<ReturnType<Awaited<ReturnType<Client['authenticate']>>['connectTree']>>) => Promise<T>): Promise<T> {
  const share = profile.share?.trim();
  if (!share) throw new ServiceError(ApiErrorCode.InvalidRequest, 'SMB 服务器需要填写共享名', 400);
  const id = sessionKey(profile, share);
  let entry = sessions.get(id);
  if (!entry) {
    if (sessions.size >= SmbSessionValue.MaxSessions) {
      const oldest = [...sessions.entries()].filter((item) => item[1].users === 0 && item[1].active === 0).sort((a, b) => a[1].last - b[1].last)[0];
      if (oldest) { sessions.delete(oldest[0]); await oldest[1].tree.disconnect().catch(() => undefined); await oldest[1].session.logoff().catch(() => undefined); await oldest[1].client.close().catch(() => undefined); }
    }
    const client = new Client(profile.host, { port: profile.port || ServerValue.DefaultSmbPort, connectTimeout: ServerValue.ConnectTimeoutMs, requestTimeout: ServerValue.ReadyTimeoutMs });
    try {
      await client.connect();
      const session = await client.authenticate({ domain: profile.domain?.trim() || '.', username: profile.user, password: profile.password || '' });
      const tree = await session.connectTree(share);
      entry = { client, session, tree, tail: Promise.resolve(), last: Date.now(), users: 0, active: 0 };
      sessions.set(id, entry);
    } catch {
      await client.close().catch(() => undefined);
      throw new ServiceError(ApiErrorCode.DownloadFailed, '无法连接到 SMB 服务器，请检查主机、共享名、用户名和密码', 502);
    }
  }
  entry.last = Date.now();
  if (entry.timer) clearTimeout(entry.timer);
  entry.users += 1;
  const run = entry.tail.then(() => { entry!.active += 1; return fn(entry!.tree); });
  entry.tail = run.then(() => undefined, () => undefined);
  try { return await run; }
  catch (error) {
    if (sessions.get(id) === entry) {
      sessions.delete(id);
      await entry.tree.disconnect().catch(() => undefined);
      await entry.session.logoff().catch(() => undefined);
      await entry.client.close().catch(() => undefined);
    }
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(ApiErrorCode.DownloadFailed, '无法访问 SMB 共享，请检查共享名、用户名、密码和路径', 502);
  }
  finally {
    entry.active = Math.max(0, entry.active - 1);
    entry.users = Math.max(0, entry.users - 1);
    entry.last = Date.now();
    entry.timer = setTimeout(() => { if (Date.now() - entry!.last >= SmbSessionValue.IdleMs && entry!.users === 0 && entry!.active === 0 && sessions.get(id) === entry) { sessions.delete(id); void entry!.tree.disconnect().catch(() => undefined); void entry!.session.logoff().catch(() => undefined); void entry!.client.close().catch(() => undefined); } }, SmbSessionValue.IdleMs);
    entry.timer.unref?.();
  }
}

export function smbRelPath(posixPath: string): string {
  if (!posixPath || posixPath === '/') return '/';
  return posixPath.startsWith('/') ? posixPath : `/${posixPath}`;
}
