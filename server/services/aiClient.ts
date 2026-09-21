import { AiConst, type AiConfig, type AiMessage, type AiPermission, type AiQuestion } from '../../src/config/aiTypes';
import { AiProtocol, type AiRemoteEvent } from './aiProtocol';

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

  private async failure(response: Response, action: string): Promise<Error> {
    let detail = '';
    try { detail = (await response.text()).trim(); } catch { /* preserve status */ }
    return new Error(`${action} failed: ${response.status}${detail ? ` ${detail.slice(0, 1000)}` : ''}`);
  }

  async createSession(directory: string, title: string): Promise<{ id: string }> {
    const response = await this.request('/session', directory, { method: 'POST', body: JSON.stringify({ title }) });
    if (!response.ok) throw await this.failure(response, 'OpenCode session create');
    return response.json() as Promise<{ id: string }>;
  }

  async prompt(directory: string, sessionId: string, prompt: string, model?: { providerID: string; modelID: string }, agent?: string, system?: string): Promise<void> {
    const body = { parts: [{ type: 'text', text: prompt }], model, agent, system };
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}${AiProtocol.Prompt}`, directory, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok && response.status !== 204) throw await this.failure(response, 'OpenCode prompt');
  }

  async status(directory: string): Promise<Record<string, unknown>> {
    const response = await this.request('/session/status', directory);
    if (!response.ok) throw await this.failure(response, 'OpenCode status');
    return response.json() as Promise<Record<string, unknown>>;
  }

  async messages(directory: string, sessionId: string): Promise<AiMessage[]> {
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}/message`, directory);
    if (!response.ok) throw await this.failure(response, 'OpenCode messages');
    return response.json() as Promise<AiMessage[]>;
  }

  async permissions(directory: string): Promise<AiPermission[]> {
    const response = await this.request('/permission', directory);
    if (!response.ok) throw await this.failure(response, 'OpenCode permissions');
    return response.json() as Promise<AiPermission[]>;
  }

  async questions(directory: string): Promise<AiQuestion[]> {
    const response = await this.request('/question', directory);
    if (!response.ok) throw await this.failure(response, 'OpenCode questions');
    return response.json() as Promise<AiQuestion[]>;
  }

  async abort(directory: string, sessionId: string): Promise<void> {
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}/abort`, directory, { method: 'POST' });
    if (!response.ok) throw await this.failure(response, 'OpenCode abort');
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

  async events(directory: string, signal: AbortSignal, receive: (event: AiRemoteEvent) => void): Promise<{ done: Promise<void> }> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, AiProtocol.StreamConnectMs);
    let response: Response;
    try {
      response = await fetch(this.url(AiProtocol.Events, directory), { signal: controller.signal, headers: this.headers(), redirect: 'manual' });
      if (!response.ok || !response.body) throw await this.failure(response, 'OpenCode events');
    } catch (error) { signal.removeEventListener('abort', abort); throw error; }
    finally { clearTimeout(timeout); }
    const done = (async () => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      try {
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          pending = pending.replace(/\r\n/g, '\n');
          let end: number;
          while ((end = pending.indexOf('\n\n')) >= 0) {
            const frame = pending.slice(0, end); pending = pending.slice(end + 2);
            const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
            if (data) { try { receive(JSON.parse(data) as AiRemoteEvent); } catch { /* An unrelated malformed frame must not discard the message snapshot. */ } }
          }
        }
        if (!signal.aborted) throw new Error('OpenCode 事件连接已断开');
      } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    })();
    return { done };
  }

  async providers(directory: string): Promise<unknown> { const response = await this.request('/provider', directory); if (!response.ok) throw new Error(`OpenCode providers failed: ${response.status}`); return response.json(); }
  async agents(directory: string): Promise<unknown> { const response = await this.request('/agent', directory); if (!response.ok) throw new Error(`OpenCode agents failed: ${response.status}`); return response.json(); }

  static readonly PollMs = AiConst.PollMs;
}
