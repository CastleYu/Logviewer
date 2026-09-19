import { HistoryConst, type HistoryLog } from '../config/historyTypes';

export class HistoryApi {
  static async request<T>(route = '', init?: RequestInit): Promise<T> {
    const response = await fetch(HistoryConst.Api + route, { ...init, headers: { [HistoryConst.Header]: HistoryConst.HeaderValue, ...init?.headers } });
    if (!response.ok) throw new Error((await response.json()).message || '历史记录操作失败');
    return response.json();
  }
  static list(): Promise<HistoryLog[]> { return this.request(); }
  static save(log: Pick<HistoryLog, 'name' | 'origin' | 'kind' | 'formatId'>, content: string): Promise<HistoryLog> {
    return this.request(`?${new URLSearchParams(log)}`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: content });
  }
  static async content(id: string): Promise<string> {
    const response = await fetch(`${HistoryConst.Api}/${id}/content`);
    if (!response.ok) throw new Error('无法读取历史日志');
    return response.text();
  }
  static local(path: string, formatId: string): Promise<HistoryLog> { return this.request(HistoryConst.Local, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, formatId }) }); }
  static pick(): Promise<{ path: string }> { return this.request(HistoryConst.Pick, { method: 'POST' }); }
}
