import { ApiErrorCode } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';
import { parseExecOutput, wrapRemoteCommand } from '../../src/utils/remoteExec';
import { withSshSession } from './remoteSession';

export interface RemoteExecResult {
  ok: boolean;
  code: number | null;
  text: string;
  cwd: string | null;
}

export async function execSftpCommand(profile: SftpProfile, cwd: string, command: string, signal?: AbortSignal): Promise<RemoteExecResult> {
  if (profile.protocol && profile.protocol !== 'sftp') {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '当前协议不支持远程命令，仅 SFTP/SSH 可执行', 400);
  }
  const trimmed = command.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '请输入有效的远程命令', 400);
  }
  const directory = cwd.trim() || profile.root || '/';
  const wrapped = wrapRemoteCommand(directory, trimmed);
  try {
    const raw = await withSshSession(profile, (client) => new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      let activeStream: { destroy?: () => void } | null = null;
      const abort = () => { activeStream?.destroy?.(); reject(new ServiceError(ApiErrorCode.DownloadFailed, '远程命令已取消', 499)); };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      client.exec(wrapped, (error, stream) => {
        if (error) {
          signal?.removeEventListener('abort', abort);
          reject(error);
          return;
        }
        activeStream = stream;
        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
        stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
        stream.on('close', (code: number | undefined) => {
          signal?.removeEventListener('abort', abort);
          resolve({ stdout, stderr, code: typeof code === 'number' ? code : null });
        });
        stream.on('error', (cause) => {
          signal?.removeEventListener('abort', abort);
          reject(cause);
        });
      });
    }));
    const parsed = parseExecOutput(raw.stdout);
    const extra = raw.stderr.trim();
    const text = [parsed.text, extra && parsed.text ? `\n${extra}` : extra].filter(Boolean).join('');
    return {
      ok: raw.code === 0 || raw.code === null,
      code: raw.code,
      text,
      cwd: parsed.cwd,
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(ApiErrorCode.DownloadFailed, '无法执行远程命令，请检查 SSH 连接和权限', 502);
  }
}
