import { Client } from 'ssh2';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';
import { parseExecOutput, wrapRemoteCommand } from '../../src/utils/remoteExec';

export interface RemoteExecResult {
  ok: boolean;
  code: number | null;
  text: string;
  cwd: string | null;
}

export async function execSftpCommand(profile: SftpProfile, cwd: string, command: string): Promise<RemoteExecResult> {
  if (profile.protocol && profile.protocol !== 'sftp') {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '当前协议不支持远程命令，仅 SFTP/SSH 可执行', 400);
  }
  const trimmed = command.trim();
  if (!trimmed || trimmed.includes('\0') || trimmed.length > 4096) {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '请输入有效的远程命令', 400);
  }
  const directory = cwd.trim() || profile.root || '/';
  const wrapped = wrapRemoteCommand(directory, trimmed);
  const client = new Client();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ServiceError(ApiErrorCode.DownloadFailed, '远程命令连接超时', 504)), ServerValue.ConnectTimeoutMs);
      client.once('ready', () => { clearTimeout(timer); resolve(); });
      client.once('error', (error) => { clearTimeout(timer); reject(error); });
      client.connect({
        host: profile.host,
        port: profile.port,
        username: profile.user,
        password: profile.password,
        privateKey: profile.privateKey,
        readyTimeout: ServerValue.ReadyTimeoutMs,
        keepaliveInterval: ServerValue.KeepaliveMs,
        hostHash: profile.fingerprint ? 'sha256' : undefined,
        hostVerifier: profile.fingerprint ? (value) => value === profile.fingerprint : undefined,
      });
    });
    const raw = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.end();
        reject(new ServiceError(ApiErrorCode.DownloadFailed, '远程命令执行超时', 504));
      }, ServerValue.ReadyTimeoutMs);
      client.exec(wrapped, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          reject(error);
          return;
        }
        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
        stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
        stream.on('close', (code: number | undefined) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: typeof code === 'number' ? code : null });
        });
        stream.on('error', (cause) => {
          clearTimeout(timer);
          reject(cause);
        });
      });
    });
    const parsed = parseExecOutput(raw.stdout);
    const extra = raw.stderr.trim();
    const text = [parsed.text, extra && parsed.text ? `\n${extra}` : extra].filter(Boolean).join('');
    return {
      ok: raw.code === 0 || raw.code === null,
      code: raw.code,
      text: text.slice(0, 32_768),
      cwd: parsed.cwd,
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(ApiErrorCode.DownloadFailed, '无法执行远程命令，请检查 SSH 连接和权限', 502);
  } finally {
    client.end();
  }
}
