import { SourceConfig, SourceConst, SourceMatch, SourceState, SourceTarget } from '../config/sourceTypes';

export class SourceApi {
  static async request<T>(route: string, body?: unknown): Promise<T> {
    const response = await fetch(SourceConst.Api + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { [SourceConst.Header]: SourceConst.HeaderValue, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '源码服务不可用');
    return data;
  }
  static state(): Promise<SourceState> { return this.request(SourceConst.Config); }
  static rebuild(config: SourceConfig): Promise<SourceState> { return this.request(SourceConst.Rebuild, config); }
  static lookup(file: string): Promise<SourceMatch[]> { return this.request(`${SourceConst.Lookup}?file=${encodeURIComponent(file)}`); }
  static open(target: SourceTarget, path: string): Promise<{ message: string }> { return this.request(SourceConst.Open, { ...target, path }); }
}
