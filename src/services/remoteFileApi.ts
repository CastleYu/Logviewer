import { DownloadTaskView, ProbeResult, RemoteApiPath, RemoteDirList, RemoteExecResult, RemoteServerDraft, RemoteServerRecord, SftpProfileView } from '../config/fileLoadTypes';

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

  static async stat(profileId: string, path: string): Promise<{ type: 'dir' | 'file' }> {
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

  static async create(profileId: string, remotePath: string): Promise<DownloadTaskView> {
    const response = await fetch(RemoteApiPath.Downloads, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, remotePath }),
    });
    return this.json<DownloadTaskView>(response);
  }

  static async task(id: string): Promise<DownloadTaskView> {
    return this.json<DownloadTaskView>(await fetch(RemoteApiPath.task(id)));
  }

  static async cancel(id: string): Promise<void> {
    await this.json(await fetch(RemoteApiPath.task(id), { method: 'DELETE' }));
  }

  static async content(id: string): Promise<{ content: string; name: string; size: number }> {
    const response = await fetch(RemoteApiPath.content(id));
    if (!response.ok) await this.json(response);
    const bytes = await response.arrayBuffer();
    const encodedName = response.headers.get('X-File-Name') || 'remote.log';
    return {
      content: new TextDecoder().decode(bytes),
      name: decodeURIComponent(encodedName),
      size: bytes.byteLength,
    };
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
