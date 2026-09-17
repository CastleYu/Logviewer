import SftpClient from 'ssh2-sftp-client';
import { ServerValue } from '../config/constants';
import type { RemoteServerRecord } from '../models/remoteModels';

export interface ProbePathResult {
  path: string;
  ok: boolean;
  message: string;
}

export interface ProbeResult {
  ok: boolean;
  message: string;
  paths: ProbePathResult[];
}

export async function probeSftp(record: RemoteServerRecord): Promise<ProbeResult> {
  const client = new SftpClient('logviewer-probe');
  try {
    await client.connect({
      host: record.host,
      port: record.port,
      username: record.user,
      password: record.password,
      readyTimeout: ServerValue.ReadyTimeoutMs,
      keepaliveInterval: ServerValue.KeepaliveMs,
      hostHash: record.fingerprint ? 'sha256' : undefined,
      hostVerifier: record.fingerprint ? (value) => value === record.fingerprint : undefined,
    });
    const paths: ProbePathResult[] = [];
    for (const remotePath of record.paths) {
      try {
        const exists = await client.exists(remotePath);
        if (!exists) paths.push({ path: remotePath, ok: false, message: '路径不存在' });
        else if (exists !== 'd') paths.push({ path: remotePath, ok: false, message: '路径不是目录' });
        else paths.push({ path: remotePath, ok: true, message: '可访问' });
      } catch {
        paths.push({ path: remotePath, ok: false, message: '无法检查该路径' });
      }
    }
    const failed = paths.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      message: failed.length === 0 ? '连接成功，日志路径可访问' : '已连接，但部分日志路径不可用',
      paths,
    };
  } catch {
    return { ok: false, message: '无法连接到 SFTP 服务器，请检查主机、端口、用户名和密码', paths: [] };
  } finally {
    await client.end().catch(() => false);
  }
}
