import { StringDecoder } from 'node:string_decoder';
import { ApiErrorCode, ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';
import { ServiceError } from './serviceError';
import { ExecCwdMarker, parseExecOutput, wrapRemoteCommand } from '../../src/utils/remoteExec';
import { withSshClient } from './remoteSession';
import { RemoteError } from './remoteError';

export interface RemoteExecResult {
  ok: boolean;
  code: number | null;
  text: string;
  cwd: string | null;
  truncated?: boolean;
}

export type ExecChunkKind = 'out' | 'err';

export interface ExecEnd {
  code: number | null;
  cwd: string | null;
  truncated: boolean;
}

function check(profile: SftpProfile, command: string): string {
  if (profile.protocol && profile.protocol !== 'sftp') {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '当前协议不支持远程命令，仅 SFTP/SSH 可执行', 400);
  }
  const trimmed = command.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new ServiceError(ApiErrorCode.InvalidRequest, '请输入有效的远程命令', 400);
  }
  return trimmed;
}

/**
 * 流式执行远程命令。stdout 尾部保留一个标记长度的缓冲，用于剥离 cwd 标记；
 * 输出超过上限时截断并关闭通道，防止 `cat` 大文件或 `tail -f` 撑爆内存。
 */
export async function streamSftpCommand(
  profile: SftpProfile,
  cwd: string,
  command: string,
  onChunk: (kind: ExecChunkKind, text: string) => void,
  signal?: AbortSignal,
  cap: number = ServerValue.ExecOutputCap,
): Promise<ExecEnd> {
  const trimmed = check(profile, command);
  const directory = cwd.trim() || profile.root || '/';
  const wrapped = wrapRemoteCommand(directory, trimmed);
  const hold = ExecCwdMarker.length + 2;
  try {
    return await withSshClient(profile, (client) => new Promise<ExecEnd>((resolve, reject) => {
      let stream: { close?: () => void; destroy?: () => void; signal?: (name: string) => void } | null = null;
      let pending = '';
      let sent = 0;
      let truncated = false;
      let settled = false;
      const emit = (kind: ExecChunkKind, text: string) => {
        if (!text || truncated) return;
        const room = cap - sent;
        if (text.length > room) {
          if (room > 0) onChunk(kind, text.slice(0, room));
          truncated = true;
          sent = cap;
          stream?.signal?.('KILL');
          stream?.close?.();
          return;
        }
        sent += text.length;
        onChunk(kind, text);
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        stream?.signal?.('KILL');
        stream?.close?.();
        reject(new ServiceError(ApiErrorCode.DownloadFailed, '远程命令已取消', 499));
      };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      client.exec(wrapped, (error, channel) => {
        if (error) {
          signal?.removeEventListener('abort', abort);
          settled = true;
          reject(error);
          return;
        }
        stream = channel as typeof stream;
        const outText = new StringDecoder('utf8');
        const errText = new StringDecoder('utf8');
        channel.on('data', (chunk: Buffer) => {
          pending += outText.write(chunk);
          const marker = pending.lastIndexOf(ExecCwdMarker);
          const keep = marker >= 0 ? pending.length - marker + 1 : hold;
          if (pending.length > keep) {
            emit('out', pending.slice(0, pending.length - keep));
            pending = pending.slice(pending.length - keep);
          }
        });
        channel.stderr.on('data', (chunk: Buffer) => emit('err', errText.write(chunk)));
        channel.on('close', (code: number | undefined) => {
          signal?.removeEventListener('abort', abort);
          if (settled) return;
          settled = true;
          pending += outText.end();
          emit('err', errText.end());
          const parsed = parseExecOutput(pending);
          const tail = pending.lastIndexOf(ExecCwdMarker) >= 0 ? parsed.text : pending.replace(/\s+$/g, '');
          emit('out', tail);
          resolve({ code: typeof code === 'number' ? code : null, cwd: parsed.cwd, truncated });
        });
        channel.on('error', (cause: unknown) => {
          signal?.removeEventListener('abort', abort);
          if (settled) return;
          settled = true;
          reject(cause);
        });
      });
    }));
  } catch (error) {
    throw RemoteError.from(error, '执行远程命令');
  }
}

export async function execSftpCommand(profile: SftpProfile, cwd: string, command: string, signal?: AbortSignal): Promise<RemoteExecResult> {
  let out = '';
  let err = '';
  const end = await streamSftpCommand(profile, cwd, command, (kind, text) => {
    if (kind === 'out') out += text; else err += text;
  }, signal);
  const body = out.replace(/\s+$/g, '');
  const extra = err.trim();
  const text = [body, extra && body ? `\n${extra}` : extra].filter(Boolean).join('');
  return { ok: end.code === 0, code: end.code, text, cwd: end.cwd, truncated: end.truncated };
}
