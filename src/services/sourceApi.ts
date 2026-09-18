import { SourceConfig, SourceConst, SourceMatch, SourceOpener, SourceState, SourceTarget } from '../config/sourceTypes';

export class SourceApi {
  static async request<T>(route: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(SourceConst.Api + route, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { [SourceConst.Header]: SourceConst.HeaderValue, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '源码服务不可用');
    return data;
  }
  static state(): Promise<SourceState> { return this.request(SourceConst.Config); }
  static rebuild(config: SourceConfig): Promise<SourceState> { return this.request(SourceConst.Rebuild, config); }
  static addRoot(path: string): Promise<SourceState> {
    return this.request(SourceConst.Root, { path });
  }
  static removeRoot(path: string): Promise<SourceState> {
    return this.request(SourceConst.Root, { path }, 'DELETE');
  }
  static rebuildRoot(path: string): Promise<SourceState> {
    return this.request(SourceConst.RootRebuild, { path });
  }
  static saveOpeners(openers: SourceOpener[]): Promise<SourceState> {
    return this.request(SourceConst.Openers, { openers });
  }
  static async pickFolder(): Promise<string> {
    return (await this.request<{ path: string }>(SourceConst.PickFolder, {})).path || '';
  }
  static async pickFile(fileName?: string): Promise<string> {
    return (await this.request<{ path: string }>(SourceConst.PickFile, { fileName: fileName || '*.exe' })).path || '';
  }
  static lookup(file: string): Promise<SourceMatch[]> { return this.request(`${SourceConst.Lookup}?file=${encodeURIComponent(file)}`); }
  static open(target: SourceTarget, path: string, openerId?: string): Promise<{ message: string }> {
    return this.request(SourceConst.Open, { ...target, path, openerId });
  }
}
