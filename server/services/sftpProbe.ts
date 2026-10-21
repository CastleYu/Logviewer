import type { SftpProfile } from '../models/sftpModels';
import { withSftpSession } from './remoteSession';
import { RemoteError } from './remoteError';

export interface ProbePathResult {
  path: string;
  ok: boolean;
  message: string;
}

export interface ProbeResult {
  ok: boolean;
  message: string;
  paths: ProbePathResult[];
  home?: string;
  latencyMs?: number;
}

export async function probeSftp(profile: SftpProfile, paths: string[]): Promise<ProbeResult> {
  const started = Date.now();
  try {
    return await withSftpSession(profile, async (client) => {
      const latencyMs = Date.now() - started;
      const home = await client.realPath('.').catch(() => undefined);
      const checked: ProbePathResult[] = [];
      for (const remotePath of paths) {
        try {
          const exists = await client.exists(remotePath);
          if (!exists) checked.push({ path: remotePath, ok: false, message: '路径不存在' });
          else if (exists !== 'd') checked.push({ path: remotePath, ok: false, message: '不是目录' });
          else checked.push({ path: remotePath, ok: true, message: '可访问' });
        } catch (error) {
          checked.push({ path: remotePath, ok: false, message: RemoteError.from(error, '访问').message });
        }
      }
      const failed = checked.filter((item) => !item.ok);
      return {
        ok: failed.length === 0,
        message: failed.length === 0 ? `连接成功（${latencyMs} ms）` : `已连接（${latencyMs} ms），但 ${failed.length} 个收藏路径不可用`,
        paths: checked,
        home,
        latencyMs,
      };
    });
  } catch (error) {
    return { ok: false, message: RemoteError.from(error, '连接服务器').message, paths: [] };
  }
}
