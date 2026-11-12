import { AiConst, AiRoute, type AiConfig, type AiCreateInput, type AiNote, type AiProbe, type AiRepositoryInput, type AiRepositoryState, type AiSession, type AiState, type AiView } from '../config/aiTypes';

export class AiApi {
  static async send<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(AiConst.Api + route, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { message?: string }).message || 'AI 请求失败');
    return data as T;
  }

  static state(): Promise<AiState> { return this.send(AiRoute.State); }
  static saveConfig(config: Partial<AiConfig>): Promise<AiConfig> { return this.send(AiRoute.Config, 'PUT', config); }
  static probe(command?: string): Promise<AiProbe> { return this.send(AiRoute.Probe, 'POST', { command }); }
  static login(): Promise<{ opened: boolean; command: string }> { return this.send(AiRoute.Login, 'POST', {}); }
  static create(input: AiCreateInput): Promise<AiSession> { return this.send(AiRoute.Sessions, 'POST', input); }
  static remove(id: string): Promise<AiState> { return this.send(`${AiRoute.Sessions}/${id}`, 'DELETE'); }
  static repository(input: AiRepositoryInput): Promise<AiRepositoryState> { return this.send(AiRoute.Repository, 'POST', input); }
  static prompt(id: string, text: string, view?: AiView, steer?: boolean): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Prompt}`, 'POST', { text, view, steer }); }
  static abort(id: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Abort}`, 'POST', {}); }
  static resume(id: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Resume}`, 'POST', {}); }
  static drop(id: string, itemId: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Queue}/${itemId}`, 'DELETE'); }
  static order(id: string, ids: string[]): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Queue}`, 'PUT', { ids }); }
  static view(id: string, view: AiView): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.View}`, 'POST', view); }
  static terminal(id: string): Promise<{ opened: boolean; command: string }> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Terminal}`, 'POST', {}); }
  static refresh(id: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Refresh}`, 'POST', {}); }
  static close(id: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Close}`, 'POST', {}); }
  static model(id: string, value: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Model}`, 'POST', { value }); }
  static mode(id: string, value: string, optionId = 'mode'): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Mode}`, 'POST', { id: optionId, value }); }
  static allow(id: string, permitId: string): Promise<AiSession> { return this.send(`${AiRoute.Sessions}/${id}${AiRoute.Permit}/${permitId}`, 'POST', {}); }
  static notes(logId: string): Promise<AiNote[]> { return this.send(`${AiRoute.Notes}/${logId}`); }
  static saveNote(logId: string, name: string, text: string, id?: string): Promise<AiNote> { return this.send(`${AiRoute.Notes}/${logId}`, 'PUT', { name, text, id }); }
  static undo(id: string): Promise<{ removed: boolean }> { return this.send(`${AiRoute.Notes}/${id}${AiRoute.Undo}`, 'DELETE'); }
  static cli(id: string): Promise<{ command: string }> { return this.send(`${AiRoute.Sessions}/${id}/cli`); }
}
