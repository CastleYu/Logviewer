import type { RemoteServerRecord } from '../models/remoteModels';
import { ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { withSftpSession } from './remoteSession';

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
  try {
    const profile: SftpProfile = { id: record.id, name: record.name, host: record.host, port: record.port, user: record.user, password: record.password, privateKey: undefined, root: record.paths[0] || ServerValue.DefaultRoot, roots: record.paths, fingerprint: record.fingerprint, maxBytes: record.maxBytes || ServerValue.DefaultMaxBytes, protocol: 'sftp' };
    return await withSftpSession(profile, async (client) => {
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
    });
  } catch {
    return { ok: false, message: '无法连接到 SFTP 服务器，请检查主机、端口、用户名和密码', paths: [] };
  }
}
