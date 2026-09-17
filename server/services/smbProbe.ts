import type { RemoteServerRecord } from '../models/remoteModels';
import type { ProbeResult } from './sftpProbe';
import { smbRelPath, withSmbTree } from './smbSession';
import type { SftpProfile } from '../models/sftpModels';
import { ServerValue } from '../config/constants';

function asProfile(record: RemoteServerRecord): SftpProfile {
  return {
    id: record.id,
    name: record.name,
    host: record.host,
    port: record.port,
    user: record.user,
    password: record.password,
    root: record.paths[0] || ServerValue.DefaultRoot,
    roots: [...record.paths],
    maxBytes: record.maxBytes || ServerValue.DefaultMaxBytes,
    protocol: 'smb',
    domain: record.domain,
    share: record.share,
  };
}

export async function probeSmb(record: RemoteServerRecord): Promise<ProbeResult> {
  try {
    return await withSmbTree(asProfile(record), async (tree) => {
      const paths = [];
      for (const remotePath of record.paths) {
        try {
          const exists = await tree.exists(smbRelPath(remotePath));
          if (!exists) {
            paths.push({ path: remotePath, ok: false, message: '路径不存在' });
            continue;
          }
          try {
            await tree.readDirectory(smbRelPath(remotePath));
            paths.push({ path: remotePath, ok: true, message: '可访问' });
          } catch {
            paths.push({ path: remotePath, ok: false, message: '路径不是目录' });
          }
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
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '无法连接到 SMB 服务器',
      paths: [],
    };
  }
}
