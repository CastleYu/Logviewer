import { AiConst, type AiConfig, type AiMessage, type AiPermission, type AiQuestion } from '../../src/config/aiTypes';

export class AiClient {
  constructor(private readonly config: AiConfig) {}

  private url(path: string, directory: string): string {
    const url = new URL(path, this.config.endpoint.endsWith('/') ? this.config.endpoint : `${this.config.endpoint}/`);
    url.searchParams.set('directory', directory);
    return url.toString();
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const password = this.config.passwordEnv ? process.env[this.config.passwordEnv] : undefined;
    if (password) headers.authorization = `Basic ${Buffer.from(`${this.config.username || 'opencode'}:${password}`).toString('base64')}`;
    return headers;
  }

  private async request(path: string, directory: string, init: RequestInit = {}): Promise<Response> {
    return fetch(this.url(path, directory), { ...init, signal: AbortSignal.timeout(30_000), redirect: 'manual', headers: { ...this.headers(), ...(init.headers || {}) } });
  }

  async createSession(directory: string, title: string): Promise<{ id: string }> {
    const response = await this.request('/session', directory, { method: 'POST', body: JSON.stringify({ title }) });
    if (!response.ok) throw new Error(`OpenCode session create failed: ${response.status}`);
    return response.json() as Promise<{ id: string }>;
  }

  async prompt(directory: string, sessionId: string, prompt: string, model?: { providerID: string; modelID: string }, agent?: string): Promise<void> {
    const body = { parts: [{ type: 'text', text: prompt }], model, agent };
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}/prompt_async`, directory, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok && response.status !== 204) throw new Error(`OpenCode prompt failed: ${response.status}`);
  }

  async status(directory: string): Promise<Record<string, unknown>> {
    const response = await this.request('/session/status', directory);
    if (!response.ok) throw new Error(`OpenCode status failed: ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async messages(directory: string, sessionId: string): Promise<AiMessage[]> {
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}/message`, directory);
    if (!response.ok) throw new Error(`OpenCode messages failed: ${response.status}`);
    return response.json() as Promise<AiMessage[]>;
  }

  async permissions(directory: string): Promise<AiPermission[]> {
    const response = await this.request('/permission', directory);
    if (!response.ok) throw new Error(`OpenCode permissions failed: ${response.status}`);
    return response.json() as Promise<AiPermission[]>;
  }

  async questions(directory: string): Promise<AiQuestion[]> {
    const response = await this.request('/question', directory);
    if (!response.ok) throw new Error(`OpenCode questions failed: ${response.status}`);
    return response.json() as Promise<AiQuestion[]>;
  }

  async abort(directory: string, sessionId: string): Promise<void> {
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}/abort`, directory, { method: 'POST' });
    if (!response.ok) throw new Error(`OpenCode abort failed: ${response.status}`);
  }

  async permission(directory: string, requestId: string, body: unknown): Promise<void> {
    const response = await this.request(`/permission/${encodeURIComponent(requestId)}/reply`, directory, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`OpenCode permission reply failed: ${response.status}`);
  }

  async question(directory: string, requestId: string, body: unknown, reject = false): Promise<void> {
    const action = reject ? 'reject' : 'reply';
    const response = await this.request(`/question/${encodeURIComponent(requestId)}/${action}`, directory, { method: 'POST', body: reject ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`OpenCode question reply failed: ${response.status}`);
  }

  async path(directory: string): Promise<Record<string, unknown>> {
    const response = await this.request('/path', directory);
    if (!response.ok) throw new Error(`OpenCode path failed: ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async providers(directory: string): Promise<unknown> { const response = await this.request('/provider', directory); if (!response.ok) throw new Error(`OpenCode providers failed: ${response.status}`); return response.json(); }
  async agents(directory: string): Promise<unknown> { const response = await this.request('/agent', directory); if (!response.ok) throw new Error(`OpenCode agents failed: ${response.status}`); return response.json(); }

  static readonly PollMs = AiConst.PollMs;
}
