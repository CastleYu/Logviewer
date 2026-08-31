import { DownloadTaskView, RemoteApiPath, SftpProfileView } from '../config/fileLoadTypes';

export class RemoteFileApi {
  static async profiles(): Promise<SftpProfileView[]> {
    const response = await fetch(RemoteApiPath.Profiles);
    const value = await this.json<{ profiles: SftpProfileView[] }>(response);
    return value.profiles;
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
