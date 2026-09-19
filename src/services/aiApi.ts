import { AiRoute, type AiConfig, type AiCreateInput, type AiPermission, type AiPromptInput, type AiQuestion, type AiSession, type AiState } from '../config/aiTypes';

export class AiApi {
  static async request<T>(route: string, init?: RequestInit): Promise<T> { const response = await fetch(`/api/ai${route}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); const value = await response.json().catch(() => undefined); if (!response.ok) throw new Error(value?.message || 'AI 服务请求失败'); return value as T; }
  static state(): Promise<AiState> { return this.request(AiRoute.State); }
  static configure(input: Partial<AiConfig>): Promise<AiState['config']> { return this.request(AiRoute.Config, { method: 'PUT', body: JSON.stringify(input) }); }
  static launch(): Promise<AiState> { return this.request(AiRoute.Launch, { method: 'POST' }); }
  static create(input: AiCreateInput): Promise<AiSession> { return this.request(AiRoute.Sessions, { method: 'POST', body: JSON.stringify(input) }); }
  static prompt(sessionId: string, input: Omit<AiPromptInput, 'sessionId'>): Promise<AiSession> { return this.request(`${AiRoute.Sessions}/${encodeURIComponent(sessionId)}${AiRoute.Prompt}`, { method: 'POST', body: JSON.stringify(input) }); }
  static abort(sessionId: string): Promise<AiSession> { return this.request(`${AiRoute.Sessions}/${encodeURIComponent(sessionId)}${AiRoute.Abort}`, { method: 'POST' }); }
  static refresh(sessionId: string): Promise<AiSession> { return this.request(`${AiRoute.Sessions}/${encodeURIComponent(sessionId)}/refresh`, { method: 'POST' }); }
  static catalogs(sessionId: string): Promise<{ providers: unknown; agents: unknown }> { return this.request(`${AiRoute.Sessions}/${encodeURIComponent(sessionId)}/catalogs`); }
  static permission(sessionId: string, requestId: string, body: unknown): Promise<AiSession> { return this.request(`${AiRoute.Sessions}/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/reply`, { method: 'POST', body: JSON.stringify(body) }); }
  static question(sessionId: string, requestId: string, body: unknown, reject = false): Promise<AiSession> { return this.request(`${AiRoute.Sessions}/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(requestId)}/${reject ? 'reject' : 'reply'}`, { method: 'POST', body: JSON.stringify(body) }); }
}

export type { AiConfig, AiPermission, AiQuestion, AiSession, AiState };
