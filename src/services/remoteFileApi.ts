import { DownloadTaskView, ExecEvent, ExecEventKind, ProbeResult, RemoteApiPath, RemoteDirList, RemoteExecResult, RemoteServerDraft, RemoteServerRecord, RemoteStatResult, SftpProfileView } from '../config/fileLoadTypes';

import { TextCodec } from '../utils/textCodec';

export class RemoteFileApi {
  static async profiles(): Promise<SftpProfileView[]> {
    const response = await fetch(RemoteApiPath.Profiles);
    const value = await this.json<{ profiles: SftpProfileView[] }>(response);
    return value.profiles;
  }

  static async servers(): Promise<RemoteServerRecord[]> {
    const response = await fetch(RemoteApiPath.Servers);
    const value = await this.json<{ servers: RemoteServerRecord[] }>(response);
    return value.servers;
  }

  static async createServer(draft: RemoteServerDraft): Promise<RemoteServerRecord> {
    const response = await fetch(RemoteApiPath.Servers, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const value = await this.json<{ server: RemoteServerRecord }>(response);
    return value.server;
  }

  static async updateServer(id: string, draft: RemoteServerDraft): Promise<RemoteServerRecord> {
    const response = await fetch(RemoteApiPath.server(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const value = await this.json<{ server: RemoteServerRecord }>(response);
    return value.server;
  }

  static async deleteServer(id: string): Promise<void> {
    await this.json(await fetch(RemoteApiPath.server(id), { method: 'DELETE' }));
  }

  static async probeServer(draft: RemoteServerDraft): Promise<ProbeResult> {
    const response = await fetch(RemoteApiPath.ServerProbe, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    return this.json<ProbeResult>(response);
  }

  static async list(profileId: string, remotePath: string): Promise<RemoteDirList> {
    return this.json<RemoteDirList>(await fetch(RemoteApiPath.list(profileId, remotePath)));
  }

  static async setPaths(id: string, paths: string[]): Promise<RemoteServerRecord> {
    const response = await fetch(RemoteApiPath.paths(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
    const value = await this.json<{ server: RemoteServerRecord }>(response);
    return value.server;
  }

  static async home(profileId: string): Promise<string> {
    const value = await this.json<{ path: string }>(await fetch(`${RemoteApiPath.Home}?${new URLSearchParams({ profileId })}`));
    return value.path;
  }

  /** 以 NDJSON 流读取命令输出；每行一个事件，结束时返回 end 或 fail。 */
  static async execStream(profileId: string, remotePath: string, command: string, onEvent: (event: ExecEvent) => void, signal?: AbortSignal): Promise<void> {
    const response = await fetch(RemoteApiPath.ExecStream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, path: remotePath, command }),
      signal,
    });
    if (!response.ok || !response.body) { await this.json(response); return; }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) onEvent(JSON.parse(line) as ExecEvent);
        index = buffer.indexOf('\n');
      }
      if (done) break;
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as ExecEvent);
    else if (signal?.aborted) onEvent({ type: ExecEventKind.Fail, message: '已停止' });
  }

  static async stat(profileId: string, path: string): Promise<RemoteStatResult> {
    return this.json(await fetch(`${RemoteApiPath.Stat}?${new URLSearchParams({ profileId, path })}`));
  }

  static async exec(profileId: string, remotePath: string, command: string, signal?: AbortSignal): Promise<RemoteExecResult> {
    const response = await fetch(RemoteApiPath.Exec, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, path: remotePath, command }),
      signal,
    });
    return this.json<RemoteExecResult>(response);
  }

  static async create(profileId: string, remotePath: string, tailBytes?: number): Promise<DownloadTaskView> {
    const response = await fetch(RemoteApiPath.Downloads, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, remotePath, tailBytes }),
    });
    return this.json<DownloadTaskView>(response);
  }

  static async task(id: string): Promise<DownloadTaskView> {
    return this.json<DownloadTaskView>(await fetch(RemoteApiPath.task(id)));
  }

  static async cancel(id: string): Promise<void> {
    await this.json(await fetch(RemoteApiPath.task(id), { method: 'DELETE' }));
  }

  static async bytes(id: string): Promise<{ bytes: ArrayBuffer; name: string }> {
    const response = await fetch(RemoteApiPath.content(id));
    if (!response.ok) await this.json(response);
    const bytes = await response.arrayBuffer();
    const encodedName = response.headers.get('X-File-Name') || 'remote.log';
    return { bytes, name: decodeURIComponent(encodedName) };
  }

  static async content(id: string): Promise<{ content: string; name: string; size: number; encoding: string }> {
    const { bytes, name } = await this.bytes(id);
    const decoded = TextCodec.decode(bytes);
    return { content: decoded.text, name, size: bytes.byteLength, encoding: decoded.encoding };
  }

  private static async json<T = unknown>(response: Response): Promise<T> {
    const value = await response.json().catch(() => ({ message: '服务返回了无法识别的响应' }));
    if (!response.ok) {
      const message = typeof value?.message === 'string' ? value.message : '远程文件服务请求失败';
      throw new Error(message);
    }
    return value as T;
  }
}
