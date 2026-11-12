import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AcpCmd, AcpError, AcpHost, type AcpCaps } from './acpHost';
import { AcpMcp, type McpBag, type McpCtx } from './acpMcp';
import { NoteStore } from './noteStore';
import { AiTerminal } from './aiTerminal';
import { AiDiagnosis } from '../../src/config/aiDiagnosis';
import { AiConst, AiCmd, AiDefaults, AiLink, AiMode, AiNoteKind, AiPartKind, AiPermitState, AiRepositoryOrigin, AiSessionState, AiToolStatus, AcpMethod, AcpUpdate, EnvName, LegacyKey, PermKind, ToolName, type AiCommand, type AiConfig, type AiCreateInput, type AiMsg, type AiNote, type AiOption, type AiPart, type AiPermit, type AiProbe, type AiPromptInput, type AiQueueItem, type AiRepositoryInput, type AiRepositoryState, type AiSession, type AiState, type AiView } from '../../src/config/aiTypes';
import type { HistoryStore } from './historyStore';
import type { SourceService } from './sourceService';
import type { SourceTarget } from '../../src/config/sourceTypes';
import { parseLogContent } from '../../src/utils/logParser';

class AiFail extends Error { constructor(message: string, readonly status = 400) { super(message); } }

class AiEnv {
  static user(name: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return '';
    if (process.env[name]) return process.env[name] || '';
    try {
      return String(execFileSync('powershell.exe', ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${name}','User')`], { encoding: 'utf8', windowsHide: true, timeout: 8000 })).trim();
    } catch { return ''; }
  }
}

class Transcript {
  static user(session: AiSession, text: string): void {
    session.messages.push({ id: crypto.randomUUID(), role: 'user', parts: [{ t: AiPartKind.User, text }] });
  }

  static agent(session: AiSession): AiMsg {
    const last = session.messages[session.messages.length - 1];
    if (last?.role === 'agent' && !last.done) return last;
    const msg: AiMsg = { id: crypto.randomUUID(), role: 'agent', parts: [] };
    session.messages.push(msg);
    return msg;
  }

  static textOf(content: unknown): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((item) => Transcript.textOf(item)).join('');
    const row = content as Record<string, unknown>;
    if (typeof row.text === 'string') return row.text;
    if (row.content) return Transcript.textOf(row.content);
    return '';
  }

  static chunk(session: AiSession, thought: boolean, text: string): void {
    if (!text) return;
    const msg = Transcript.agent(session);
    const kind = thought ? AiPartKind.Thought : AiPartKind.Text;
    const last = msg.parts[msg.parts.length - 1];
    if (last && last.t === kind) last.text += text;
    else msg.parts.push(thought ? { t: AiPartKind.Thought, text } : { t: AiPartKind.Text, text });
  }

  static status(value: unknown): AiToolStatus {
    const text = String(value || '').toLowerCase();
    if (text.includes('fail') || text === 'error') return AiToolStatus.Fail;
    if (text.includes('complete') || text === 'done' || text === 'success') return AiToolStatus.Done;
    if (text.includes('progress') || text === 'running' || text === 'in_progress') return AiToolStatus.Run;
    return AiToolStatus.Wait;
  }

  static tool(session: AiSession, update: Record<string, unknown>): void {
    const msg = Transcript.agent(session);
    const id = String(update.toolCallId || crypto.randomUUID());
    const args = update.rawInput ? JSON.stringify(update.rawInput).slice(0, 500) : '';
    const result = Transcript.textOf(update.content).slice(0, 8000);
    const found = msg.parts.find((part): part is Extract<AiPart, { t: AiPartKind.Tool }> => part.t === AiPartKind.Tool && part.id === id);
    if (found) {
      if (update.title) found.name = String(update.title);
      if (args) found.args = args;
      if (result) found.result = result;
      if (update.status) found.status = Transcript.status(update.status);
      return;
    }
    msg.parts.push({ t: AiPartKind.Tool, id, name: String(update.title || update.kind || 'tool'), args, status: Transcript.status(update.status), result });
  }

  static plan(session: AiSession, update: Record<string, unknown>): void {
    const msg = Transcript.agent(session);
    const entries = Array.isArray(update.entries) ? update.entries : [];
    const items = entries.map((entry) => {
      const row = entry as Record<string, unknown>;
      return { text: String(row.content || ''), status: String(row.status || '') };
    });
    const part: AiPart = { t: AiPartKind.Plan, items };
    const index = msg.parts.findIndex((item) => item.t === AiPartKind.Plan);
    if (index >= 0) msg.parts[index] = part;
    else msg.parts.push(part);
  }

  static finish(session: AiSession, stop = false): void {
    const last = [...session.messages].reverse().find((item) => item.role === 'agent');
    if (last) { last.done = true; last.stop = stop; }
  }

  static apply(session: AiSession, params: Record<string, unknown>): void {
    const update = (params.update || {}) as Record<string, unknown>;
    const kind = String(update.sessionUpdate || '');
    if (kind === AcpUpdate.Commands) {
      const rows = Array.isArray(update.availableCommands) ? update.availableCommands : [];
      session.commands = rows.map((item) => {
        const row = item as Record<string, unknown>;
        return { name: String(row.name || ''), description: String(row.description || '') };
      }).filter((item) => item.name);
      return;
    }
    if (kind === AcpUpdate.User) {
      if (!session.replay) return;
      Transcript.user(session, Transcript.textOf(update.content));
      return;
    }
    if (kind === AcpUpdate.Text) Transcript.chunk(session, false, Transcript.textOf(update.content));
    else if (kind === AcpUpdate.Thought) Transcript.chunk(session, true, Transcript.textOf(update.content));
    else if (kind === AcpUpdate.Tool || kind === AcpUpdate.ToolUp) Transcript.tool(session, update);
    else if (kind === AcpUpdate.Plan) Transcript.plan(session, update);
  }
}

type AiDeps = { terminal?: (executable: string) => Pick<AiTerminal, 'open'>; sources?: Pick<SourceService, 'repositories' | 'repository'> };
type Waiter = (allow: boolean) => void;

export class AiService {
  private config: AiConfig = AiDefaults.config();
  private sessions: AiSession[] = [];
  private loaded = false;
  private initTask?: Promise<void>;
  private stopped = false;
  private host: AcpHost | null = null;
  private hostKey = '';
  private readonly mcp = new AcpMcp();
  private readonly notes: NoteStore;
  private readonly bags = new Map<string, McpBag>();
  private readonly inbox = new Map<string, Record<string, unknown>[]>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly waits = new Map<string, Waiter>();
  private readonly once = new Map<string, Set<string>>();
  private readonly listeners = new Set<(payload: unknown) => void>();
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly root: string, private readonly history: HistoryStore, private readonly deps: AiDeps = {}) {
    this.notes = new NoteStore(root);
  }

  async init(): Promise<void> {
    if (this.initTask) return this.initTask;
    this.initTask = this.load();
    await this.initTask;
    await this.mcp.start();
  }

  subscribe(send: (payload: unknown) => void): () => void {
    this.listeners.add(send);
    return () => this.listeners.delete(send);
  }

  private emit(session?: AiSession): void {
    const payload = session ? { type: 'session', session: this.pub(session) } : { type: 'state' };
    for (const send of this.listeners) send(payload);
  }

  private env(): { env: NodeJS.ProcessEnv; secrets: string[] } {
    const env: NodeJS.ProcessEnv = {};
    for (const key of EnvName.Base) if (process.env[key]) env[key] = process.env[key];
    const secrets: string[] = [];
    for (const key of this.config.envAllow || []) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      const value = process.env[key] || AiEnv.user(key);
      if (!value) continue;
      env[key] = value;
      if (/key|secret|token|password/i.test(key)) secrets.push(value);
    }
    return { env, secrets };
  }

  private async ensure(): Promise<AcpHost> {
    const key = this.config.command;
    if (this.host?.alive && this.hostKey === key) return this.host;
    await this.host?.close();
    const { env, secrets } = this.env();
    try {
      this.host = await AcpHost.open(this.config.command, this.root, env, secrets);
    } catch (error) {
      this.host = null;
      throw new AiFail(error instanceof Error ? error.message : '无法启动 Agent');
    }
    this.hostKey = key;
    this.host.onNote = (method, params) => { if (method === AcpMethod.Update) this.buffer(params); };
    this.host.onAsk = (method, params) => this.asked(method, params);
    return this.host;
  }

  private buffer(params: Record<string, unknown>): void {
    const id = String(params.sessionId || '');
    const session = this.byAgent(id);
    if (!session) {
      const list = this.inbox.get(id) || [];
      list.push(params);
      this.inbox.set(id, list);
      return;
    }
    this.applyUpdate(session, params);
  }

  private flush(session: AiSession): void {
    const list = this.inbox.get(session.agentId || '') || [];
    this.inbox.delete(session.agentId || '');
    for (const params of list) this.applyUpdate(session, params);
  }

  private applyUpdate(session: AiSession, params: Record<string, unknown>): void {
    Transcript.apply(session, params);
    this.emit(session);
  }

  private async asked(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === AcpMethod.Read) return this.readFs(params);
    if (method === AcpMethod.Write) {
      this.markDeny(params, 'write', `客户端未声明写入能力。${PermKind.DenyWhy}`);
      throw new AiFail(`客户端未声明写入能力。${PermKind.DenyWhy}`);
    }
    if (method === AcpMethod.Permit) return this.permit(params);
    return {};
  }

  private async readFs(params: Record<string, unknown>): Promise<{ content: string }> {
    const session = this.byAgent(String(params.sessionId || ''));
    const file = path.resolve(String(params.path || ''));
    const roots = [session?.directory, session?.snapshot].filter((item): item is string => !!item);
    if (!roots.some((root) => AiService.inside(root, file))) throw new AiFail('路径不在工作目录或日志快照内');
    let text = await fs.readFile(file, 'utf8');
    if (params.line) {
      const rows = text.split(/\r?\n/);
      const start = Math.max(0, Number(params.line) - 1);
      const limit = Math.max(1, Number(params.limit) || rows.length);
      text = rows.slice(start, start + limit).join('\n');
    }
    return { content: text };
  }

  private static inside(root: string, file: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(file));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  private markDeny(params: Record<string, unknown>, kind: string, why: string): AiPermit {
    const tool = (params.toolCall || {}) as Record<string, unknown>;
    const session = this.byAgent(String(params.sessionId || '')) || this.sessions.find((item) => item.state === AiSessionState.Busy);
    const permit: AiPermit = { id: String(tool.toolCallId || crypto.randomUUID()), title: String(tool.title || params.path || kind), kind, state: AiPermitState.Deny, why };
    if (session) {
      session.permits = [permit, ...session.permits.filter((item) => item.id !== permit.id)].slice(0, 40);
      const msg = Transcript.agent(session);
      msg.parts.push({ t: AiPartKind.Deny, id: permit.id, title: permit.title, why });
      this.emit(session);
      void this.saveSoon();
    }
    return permit;
  }

  private pick(options: Record<string, unknown>[], allow: boolean): Record<string, unknown> {
    const kinds = allow ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
    const hit = options.find((item) => kinds.includes(String(item.kind))) || options[allow ? 0 : options.length - 1];
    if (!hit) return { outcome: { outcome: 'cancelled' } };
    const result: Record<string, unknown> = { outcome: { outcome: 'selected', optionId: hit.optionId } };
    if (!allow) result._meta = { reason: PermKind.DenyWhy };
    return result;
  }

  private async permit(params: Record<string, unknown>): Promise<unknown> {
    const tool = (params.toolCall || {}) as Record<string, unknown>;
    const kind = String(tool.kind || '').toLowerCase();
    const title = String(tool.title || kind || 'tool');
    const options = Array.isArray(params.options) ? params.options as Record<string, unknown>[] : [];
    const session = this.byAgent(String(params.sessionId || '')) || this.sessions.find((item) => item.state === AiSessionState.Busy);
    const allowList = this.config.allow || PermKind.Allow;
    const denyList = this.config.deny || PermKind.Deny;
    const deny = denyList.includes(kind) || /edit|write|delete|move|execut|bash|shell/i.test(`${kind} ${title}`);
    const allow = !deny && (allowList.includes(kind) || /read|search|fetch|think|list/i.test(kind));
    const once = session ? this.once.get(session.id) : undefined;
    if (once?.has(title)) { once.delete(title); return this.pick(options, true); }
    if (allow) return this.pick(options, true);
    if (!session) return this.pick(options, false);
    if (deny && this.listeners.size === 0) {
      this.markDeny({ ...params, toolCall: { ...tool, title } }, kind || 'edit', PermKind.DenyWhy);
      return this.pick(options, false);
    }
    const id = String(tool.toolCallId || crypto.randomUUID());
    const permit: AiPermit = { id, title, kind: kind || 'other', state: AiPermitState.Pending, why: deny ? PermKind.DenyWhy : '等待确认' };
    session.permits = [permit, ...session.permits.filter((item) => item.id !== id)].slice(0, 40);
    this.emit(session);
    const choice = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { this.waits.delete(id); resolve(false); }, deny ? AiConst.HoldMs : AiConst.HoldMs);
      this.waits.set(id, (value) => { clearTimeout(timer); this.waits.delete(id); resolve(value); });
    });
    permit.state = choice ? AiPermitState.Allow : AiPermitState.Deny;
    if (!choice) {
      const msg = Transcript.agent(session);
      msg.parts.push({ t: AiPartKind.Deny, id, title, why: PermKind.DenyWhy });
    }
    this.emit(session);
    return this.pick(options, choice);
  }

  async allow(sessionId: string, permitId: string): Promise<AiSession> {
    const session = this.must(sessionId);
    const wait = this.waits.get(permitId);
    if (wait) wait(true);
    else {
      const bag = this.once.get(session.id) || new Set<string>();
      const permit = session.permits.find((item) => item.id === permitId);
      if (permit) bag.add(permit.title);
      this.once.set(session.id, bag);
    }
    this.emit(session);
    return this.pub(session);
  }

  private byAgent(id: string): AiSession | undefined { return this.sessions.find((item) => item.agentId === id); }
  private must(id: string): AiSession { const session = this.sessions.find((item) => item.id === id); if (!session) throw new AiFail('会话不存在'); return session; }
  private pub(session: AiSession): AiSession { return { ...session, messages: session.messages.slice(), queue: session.queue.slice(), permits: session.permits.slice(), toolSizes: session.toolSizes.slice(-40), calls: session.calls.slice() }; }

  async state(): Promise<AiState> {
    await this.init();
    return { sessions: this.sessions.map((item) => this.pub(item)), config: { ...this.config }, link: this.link(), agent: this.host?.alive ? { name: this.host.caps.name, version: this.host.caps.version } : undefined, steering: !!this.host?.caps.steering };
  }

  private link(): AiLink {
    if (!this.host?.alive) return this.sessions.some((item) => item.error) ? AiLink.Fail : AiLink.Off;
    if (this.sessions.some((item) => item.state === AiSessionState.Busy)) return AiLink.Work;
    return AiLink.Ready;
  }

  async configure(input: Partial<AiConfig>): Promise<AiConfig> {
    await this.init();
    const next = { ...this.config, ...input };
    if (input.envAllow) next.envAllow = input.envAllow.map(String).filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item));
    if (input.allow) next.allow = input.allow.map(String);
    if (input.deny) next.deny = input.deny.map(String);
    this.config = next;
    if (this.host && this.hostKey !== this.config.command) { await this.host.close(); this.host = null; }
    await this.write(this.configPath(), this.config);
    this.emit();
    return { ...this.config };
  }

  async probe(command?: string): Promise<AiProbe> {
    await this.init();
    const previous = this.config.command;
    const cmd = command?.trim() || previous;
    const { env, secrets } = this.env();
    let host: AcpHost | null = null;
    try {
      host = await AcpHost.open(cmd, this.root, env, secrets);
      const caps: AcpCaps = host.caps;
      return { name: caps.name, version: caps.version, load: caps.load, http: caps.http, steering: caps.steering, auth: caps.auth };
    } catch (error) {
      return { name: '', version: '', load: false, http: false, steering: false, auth: [], error: error instanceof Error ? error.message : '连接失败' };
    } finally { await host?.close(); }
  }

  async login(): Promise<{ opened: boolean; command: string }> {
    await this.init();
    const parts = await AcpCmd.resolve(this.config.command, this.env().env);
    const exe = parts[0];
    const command = this.config.login && this.config.login !== AiCmd.Login ? this.config.login : `"${exe}" auth login`;
    const terminal = this.deps.terminal?.(exe) || new AiTerminal();
    return terminal.open(this.root, command);
  }

  async repository(input: AiRepositoryInput): Promise<AiRepositoryState> {
    await this.init();
    return this.lock(`${AiConst.RepositoryLock}${input.logId}`, async () => {
      const log = await this.history.get(input.logId);
      const source = this.deps.sources || new (await import('./sourceService')).SourceService(path.join(this.root, AiConst.SourceConfigFile));
      const chosen = input.repository?.trim() ? await source.repository(input.repository.trim()) : undefined;
      const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
      const prior = this.sessions.filter((session) => session.logId === input.logId && session.mode === AiMode.Source && session.repository);
      const stored = log.repository || prior[0]?.repository;
      if (stored) {
        const bound = await source.repository(stored);
        if (chosen && !same(chosen, bound)) throw new AiFail(`此日志已绑定代码仓 ${bound}，不能切换到另一代码仓。`);
        if (log.repository !== bound) await this.history.update(log.id, { repository: bound });
        return { logId: log.id, repository: bound, candidates: [], origin: AiRepositoryOrigin.Bound };
      }
      const targets = (Array.isArray(input.targets) ? input.targets : []).filter((target): target is SourceTarget => !!target && typeof target.file === 'string' && !!target.file.trim()).slice(0, AiConst.MaxSourceTargets);
      const candidates = this.deps.sources ? await this.deps.sources.repositories(targets) : [];
      const repository = chosen || (candidates.length === 1 ? candidates[0].repository : undefined);
      if (!repository) return { logId: log.id, candidates, origin: candidates.length ? AiRepositoryOrigin.Index : AiRepositoryOrigin.Missing };
      const anchor = candidates.find((candidate) => same(candidate.repository, repository));
      await this.history.update(log.id, { repository, sourceAnchor: anchor ? { file: anchor.file, line: anchor.line } : undefined });
      return { logId: log.id, repository, candidates, origin: chosen ? AiRepositoryOrigin.Manual : AiRepositoryOrigin.Index };
    });
  }

  async create(input: AiCreateInput): Promise<AiSession> {
    await this.init();
    const mode = input.mode ?? this.config.mode ?? AiMode.Source;
    if (!Object.values(AiMode).includes(mode)) throw new AiFail('请选择日志隔离或源码模式');
    const binding = mode === AiMode.Source ? await this.repository({ logId: input.logId, targets: input.targets, repository: input.repository }) : undefined;
    if (mode === AiMode.Source && !binding?.repository) throw new AiFail(binding?.candidates.length ? '日志索引匹配多个代码仓，请先选定仓库。' : '未能确定代码仓，请配置索引或手动绑定。');
    const log = await this.history.get(input.logId);
    const content = await this.history.content(input.logId);
    const area = await this.workspace({ ...input, mode, repository: binding?.repository }, content);
    if (input.installRecipe ?? this.config.installRecipe) await this.recipes(area.directory);
    const host = await this.ensure();
    if (!host.caps.http) throw new AiFail('Agent 不支持 MCP HTTP，无法注入日志工具');
    await this.bag(input.logId);
    const token = crypto.randomBytes(18).toString('hex');
    const session = this.blank(input.logId, mode, area.directory, area.repository, area.trackLog, log.name);
    session.snapshot = path.dirname(this.history.contentPath(log.id));
    this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
    this.bindMcp(token, session);
    const servers = [{ type: 'http', name: AiConst.McpName, url: this.mcp.url(token), headers: [] }];
    const params: Record<string, unknown> = { cwd: area.directory, mcpServers: servers };
    if (host.caps.extraDirs && session.snapshot) params.additionalDirectories = [session.snapshot];
    let created: Record<string, unknown>;
    try { created = await host.call(AcpMethod.New, params, AiConst.BootMs) as Record<string, unknown>; }
    catch (error) { this.sessions = this.sessions.filter((item) => item.id !== session.id); throw new AiFail(error instanceof Error ? error.message : '创建会话失败'); }
    session.agentId = String(created.sessionId || '');
    if (!session.agentId) throw new AiFail('Agent 返回了无效会话');
    session.options = AcpHost.options(created.configOptions);
    const model = session.options.find((item) => item.id === 'model');
    session.model = model?.value || '';
    const modeOption = session.options.find((item) => item.id === 'mode');
    session.modeId = modeOption?.value || '';
    session.link = AiLink.Ready;
    this.flush(session);
    await this.saveSoon();
    this.emit(session);
    return this.pub(session);
  }

  private blank(logId: string, mode: AiMode, directory: string, repository: string | undefined, trackLog: boolean, title: string): AiSession {
    return { id: crypto.randomUUID(), legacy: false, title, logId, mode, directory, repository, trackLog, created: new Date().toISOString(), options: [], commands: [], state: AiSessionState.Idle, messages: [], queue: [], queuePaused: false, permits: [], link: AiLink.Off, usage: AiDefaults.usage(), toolSizes: [], calls: [], view: AiDefaults.view() };
  }

  private bindMcp(token: string, session: AiSession): void {
    const ctx: McpCtx = {
      bag: () => this.bags.get(session.logId) || { name: session.title, lines: [], logs: [] },
      view: () => session.view,
      notes: this.notes,
      logId: session.logId,
      onTool: (name, out) => {
        session.calls.push(name);
        session.toolSizes.push({ name, bytes: out.bytes, truncated: out.truncated, at: new Date().toISOString() });
        this.emit(session);
      },
      onNote: (note) => {
        const msg = Transcript.agent(session);
        msg.parts.push({ t: AiPartKind.Note, id: note.id, name: note.name, kind: note.kind });
        this.emit(session);
        void this.saveSoon();
      },
    };
    this.mcp.tokens.set(token, ctx);
  }

  private async bag(logId: string): Promise<McpBag> {
    const cached = this.bags.get(logId);
    if (cached) return cached;
    const log = await this.history.get(logId);
    const content = await this.history.content(logId);
    const lines = content.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const parsed = parseLogContent(content, log.name, Buffer.byteLength(content));
    const bag = { name: log.name, lines, logs: parsed.logs };
    this.bags.set(logId, bag);
    return bag;
  }

  async prompt(input: AiPromptInput): Promise<AiSession> {
    await this.init();
    const session = this.must(input.sessionId);
    if (session.legacy) throw new AiFail('旧版会话只读，不能继续发送');
    if (session.closed) throw new AiFail('会话已关闭');
    const text = String(input.text || '').trim();
    if (!text) throw new AiFail('请输入内容');
    if (input.view) session.view = { ...AiDefaults.view(), ...input.view };
    const item: AiQueueItem = { id: crypto.randomUUID(), text, steer: input.steer, created: new Date().toISOString() };
    session.queue.push(item);
    if (input.steer && session.state === AiSessionState.Busy && this.host?.caps.steering) void this.steer(session, item);
    else if (session.state !== AiSessionState.Busy && !session.queuePaused) void this.drain(session);
    await this.saveSoon();
    this.emit(session);
    return this.pub(session);
  }

  private async steer(session: AiSession, item: AiQueueItem): Promise<void> {
    try {
      const host = await this.ensure();
      await host.call(AcpMethod.Prompt, { sessionId: session.agentId, prompt: [{ type: 'text', text: item.text }], _meta: { steering: true } }, AiConst.PromptMs);
      session.queue = session.queue.filter((row) => row.id !== item.id);
      Transcript.user(session, item.text);
    } catch { /* keep queued */ }
    this.emit(session);
    await this.saveSoon();
  }

  private async drain(session: AiSession): Promise<void> {
    if (this.stopped || session.state === AiSessionState.Busy || session.queuePaused || !session.queue.length) return;
    const item = session.queue[0];
    session.state = AiSessionState.Busy;
    session.error = undefined;
    session.link = AiLink.Work;
    this.emit(session);
    let stopped = false;
    try {
      await this.turn(session, item);
      session.queue = session.queue.filter((row) => row.id !== item.id);
      session.state = session.queuePaused ? AiSessionState.Aborted : AiSessionState.Idle;
    } catch (error) {
      stopped = session.queuePaused || /cancel|abort|停止/i.test(error instanceof Error ? error.message : '');
      session.state = stopped ? AiSessionState.Aborted : AiSessionState.Error;
      if (!stopped) session.error = error instanceof Error ? error.message : '发送失败';
      if (!stopped) session.queuePaused = true;
      Transcript.finish(session, stopped);
    }
    session.link = this.host?.alive ? AiLink.Ready : AiLink.Fail;
    this.emit(session);
    await this.saveSoon();
    if (session.state === AiSessionState.Idle && !session.queuePaused) await this.drain(session);
  }

  private async turn(session: AiSession, item: AiQueueItem): Promise<void> {
    const host = await this.ensure();
    if (!session.agentId) throw new AiFail('会话尚未连接 Agent');
    const first = !session.messages.some((msg) => msg.role === 'user');
    const text = first ? `${this.guide(session)}\n\n用户问题：\n${item.text}` : this.contextLine(session, item.text);
    Transcript.user(session, item.text);
    this.emit(session);
    const result = await host.call(AcpMethod.Prompt, { sessionId: session.agentId, prompt: [{ type: 'text', text }] }, AiConst.PromptMs) as Record<string, unknown>;
    const usage = (result.usage || {}) as Record<string, unknown>;
    session.usage.input += Number(usage.inputTokens || usage.input || 0);
    session.usage.output += Number(usage.outputTokens || usage.output || 0);
    session.usage.total += Number(usage.totalTokens || usage.total || 0) || Number(usage.inputTokens || 0) + Number(usage.outputTokens || 0);
    const reason = String(result.stopReason || '');
    Transcript.finish(session, reason === 'cancelled');
    if (reason === 'cancelled') session.queuePaused = true;
  }

  private guide(session: AiSession): string {
    const view = session.view;
    const selected = view.use && view.selected.length ? `当前选中 ${view.selected.length} 行 ${view.selected.slice(0, 12).map((line) => `L${line}`).join(' ')}` : '未选中行';
    return [
      '你是 LogViewer 里的诊断助手。不要假设已经看到日志全文，请用工具按需读取。',
      `工具：${ToolName.All.join('、')}。`,
      '引用日志必须写成 L行号，例如 L1234。',
      `仓库内直接写文件会被系统拒绝。若用户要求写入 README 等文件，先尝试一次写文件以确认拒绝，再改用 note_write 或 report_write。${PermKind.DenyWhy}。`,
      AiDiagnosis.Core,
      this.config.recipe ? AiDiagnosis.Report : '',
      `日志：${session.title}。${selected}。${view.search ? `搜索 ${view.search}。` : ''}${view.filter ? `筛选 ${view.filter}。` : ''}`,
    ].filter(Boolean).join('\n');
  }

  private contextLine(session: AiSession, text: string): string {
    const view = session.view;
    if (!view.use && !view.search && !view.filter) return text;
    const bits = [view.use && view.selected.length ? `选中 ${view.selected.slice(0, 12).map((line) => `L${line}`).join(' ')}` : '', view.search ? `搜索 ${view.search}` : '', view.filter || ''].filter(Boolean);
    return bits.length ? `${bits.join(' · ')}\n\n${text}` : text;
  }

  async abort(id: string): Promise<AiSession> {
    const session = this.must(id);
    session.queuePaused = true;
    if (session.agentId && this.host?.alive) this.host.notify(AcpMethod.Cancel, { sessionId: session.agentId });
    session.state = AiSessionState.Aborted;
    Transcript.finish(session, true);
    this.emit(session);
    await this.saveSoon();
    return this.pub(session);
  }

  async resume(id: string): Promise<AiSession> {
    const session = this.must(id);
    session.queuePaused = false;
    if (session.state !== AiSessionState.Busy) session.state = AiSessionState.Idle;
    void this.drain(session);
    this.emit(session);
    return this.pub(session);
  }

  async drop(id: string, itemId: string): Promise<AiSession> {
    const session = this.must(id);
    session.queue = session.queue.filter((item) => item.id !== itemId);
    this.emit(session);
    await this.saveSoon();
    return this.pub(session);
  }

  async order(id: string, ids: string[]): Promise<AiSession> {
    const session = this.must(id);
    const map = new Map(session.queue.map((item) => [item.id, item]));
    const next = ids.map((item) => map.get(item)).filter((item): item is AiQueueItem => !!item);
    for (const item of session.queue) if (!next.includes(item)) next.push(item);
    session.queue = next;
    this.emit(session);
    await this.saveSoon();
    return this.pub(session);
  }

  async view(id: string, view: Partial<AiView>): Promise<AiSession> {
    const session = this.must(id);
    session.view = { ...session.view, ...view };
    return this.pub(session);
  }

  async refresh(id: string): Promise<AiSession> {
    const session = this.must(id);
    if (session.legacy || !session.agentId) return this.pub(session);
    const host = await this.ensure();
    if (!host.caps.load) throw new AiFail('Agent 不支持恢复会话');
    const token = crypto.randomBytes(18).toString('hex');
    this.bindMcp(token, session);
    const servers = [{ type: 'http', name: AiConst.McpName, url: this.mcp.url(token), headers: [] }];
    const prev = session.messages;
    const users = prev.filter((item) => item.role === 'user').length;
    session.messages = [];
    session.replay = true;
    try {
      await host.call(AcpMethod.Load, { sessionId: session.agentId, cwd: session.directory, mcpServers: servers }, AiConst.PromptMs);
      this.flush(session);
    } finally { session.replay = false; }
    const rebuilt = session.messages.filter((item) => item.role === 'user').length;
    if (!session.messages.length || rebuilt < users) session.messages = prev;
    session.link = AiLink.Ready;
    this.emit(session);
    await this.saveSoon();
    return this.pub(session);
  }

  async closeSession(id: string): Promise<AiSession> {
    const session = this.must(id);
    if (session.agentId && this.host?.alive) await this.host.call(AcpMethod.Close, { sessionId: session.agentId }).catch(() => undefined);
    session.closed = true;
    session.state = AiSessionState.Idle;
    this.emit(session);
    await this.saveSoon();
    return this.pub(session);
  }

  async remove(id: string): Promise<AiState> {
    const session = this.must(id);
    if (session.agentId && this.host?.alive) await this.host.call(AcpMethod.Delete, { sessionId: session.agentId }).catch(() => undefined);
    this.sessions = this.sessions.filter((item) => item.id !== id);
    await this.saveSoon();
    this.emit();
    return this.state();
  }

  async option(id: string, configId: string, value: string): Promise<AiSession> {
    const session = this.must(id);
    if (session.legacy || !session.agentId) throw new AiFail('旧版会话不能切换模型');
    const host = await this.ensure();
    const result = await host.call(AcpMethod.SetOption, { sessionId: session.agentId, configId, value }) as Record<string, unknown>;
    session.options = AcpHost.options(result.configOptions);
    if (configId === 'model') session.model = value;
    if (configId === 'mode') session.modeId = value;
    this.emit(session);
    await this.saveSoon();
    return this.pub(session);
  }

  async commands(id: string): Promise<AiCommand[]> {
    const session = this.must(id);
    if (this.host?.alive && session.agentId) {
      try {
        const listed = await this.host.call(AcpMethod.List, {}) as { sessions?: { sessionId: string; cwd: string; title?: string }[] };
        const known = new Set(this.sessions.map((item) => item.agentId));
        for (const row of listed.sessions || []) {
          if (known.has(row.sessionId)) continue;
          if (!AiService.inside(session.directory, row.cwd) && row.cwd !== session.directory) continue;
        }
      } catch { /* list is optional */ }
    }
    return session.commands;
  }

  async listed(): Promise<{ sessionId: string; cwd: string; title: string }[]> {
    if (!this.host?.alive) return [];
    try {
      const listed = await this.host.call(AcpMethod.List, {}) as { sessions?: { sessionId: string; cwd?: string; title?: string }[] };
      const dirs = new Set(this.sessions.map((item) => item.directory.toLowerCase()));
      return (listed.sessions || []).filter((item) => dirs.has(String(item.cwd || '').toLowerCase())).map((item) => ({ sessionId: item.sessionId, cwd: String(item.cwd || ''), title: String(item.title || item.sessionId) }));
    } catch { return []; }
  }

  cli(id: string): string {
    const session = this.must(id);
    const sid = session.agentId || session.id;
    return (this.config.resume || AiCmd.Resume).split(AiCmd.SessionToken).join(sid);
  }

  async openTerminal(id: string): Promise<{ opened: boolean; command: string }> {
    const session = this.must(id);
    if (session.legacy) throw new AiFail('旧版会话不能在终端继续');
    const command = this.cli(id);
    const terminal = this.deps.terminal?.(this.config.command) || new AiTerminal();
    return terminal.open(session.directory, command);
  }

  async notesOf(logId: string): Promise<AiNote[]> { await this.init(); return this.notes.list(logId); }
  async saveNote(logId: string, name: string, text: string, id?: string): Promise<AiNote> {
    await this.init();
    if (id) { const note = await this.notes.update(id, text, name); if (!note) throw new AiFail('笔记不存在'); return note; }
    return this.notes.write(AiNoteKind.Note, logId, name, text);
  }
  async undo(id: string): Promise<{ removed: boolean }> { await this.init(); return { removed: await this.notes.remove(id) }; }

  private async workspace(input: AiCreateInput, content: string): Promise<{ directory: string; repository?: string; trackLog: boolean }> {
    const base = path.join(this.root, AiConst.WorkspaceDir, input.logId);
    await fs.mkdir(base, { recursive: true });
    if (input.mode === AiMode.Isolated) {
      await fs.writeFile(path.join(base, AiConst.InputName), content, 'utf8');
      return { directory: base, trackLog: false };
    }
    if (!input.repository) throw new AiFail('source 模式需要 repository');
    if (!path.isAbsolute(input.repository) || !(await fs.stat(input.repository).catch(() => null))?.isDirectory()) throw new AiFail('repository 必须是存在的绝对目录');
    if (input.trackLog) {
      const exact = path.join(input.repository, '.logviewer-ai', input.logId, AiConst.InputName);
      await fs.mkdir(path.dirname(exact), { recursive: true });
      await fs.writeFile(exact, content, 'utf8');
    }
    return { directory: input.repository, repository: input.repository, trackLog: !!input.trackLog };
  }

  private async recipes(directory: string): Promise<void> {
    const dir = path.join(directory, AiConst.RecipeDir);
    await fs.mkdir(dir, { recursive: true });
    const entries: [string, string][] = [[AiConst.DiagnoseRecipe, AiDiagnosis.PrimaryRecipe], [AiConst.EvidenceRecipe, AiDiagnosis.EvidenceRecipe]];
    for (const [name, text] of entries) {
      const file = path.join(dir, name);
      try { await fs.writeFile(file, text, { encoding: 'utf8', flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
  }

  private lock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) || Promise.resolve();
    const run = prev.then(task, task);
    this.locks.set(key, run.then(() => undefined, () => undefined));
    return run;
  }

  private configPath(): string { return path.join(this.root, AiConst.ConfigFile); }
  private sessionsPath(): string { return path.join(this.root, AiConst.SessionsFile); }

  private async load(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(this.root, { recursive: true });
    try { this.config = this.readConfig(JSON.parse(await fs.readFile(this.configPath(), 'utf8')) as Record<string, unknown>); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { this.sessions = (JSON.parse(await fs.readFile(this.sessionsPath(), 'utf8')) as Record<string, unknown>[]).map((item) => this.readSession(item)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.loaded = true;
    await this.write(this.configPath(), this.config);
    await this.write(this.sessionsPath(), this.sessions);
  }

  private readConfig(raw: Record<string, unknown>): AiConfig {
    const base = AiDefaults.config();
    const exe = typeof raw[LegacyKey.Executable] === 'string' ? String(raw[LegacyKey.Executable]) : '';
    const command = typeof raw.command === 'string' && raw.command.trim() ? String(raw.command) : exe ? `"${exe}" acp` : base.command;
    const mode = raw.mode === AiMode.Isolated || raw.mode === AiMode.Source ? raw.mode : base.mode;
    const envAllow = Array.isArray(raw.envAllow) ? raw.envAllow.map(String) : base.envAllow;
    return { ...base, name: typeof raw.name === 'string' ? raw.name : base.name, command, mode, envAllow, resume: typeof raw.resume === 'string' ? raw.resume : base.resume, login: typeof raw.login === 'string' ? raw.login : base.login, recipe: raw.recipe !== false, installRecipe: raw.installRecipe === true, trackLog: raw.trackLog === true, allow: Array.isArray(raw.allow) ? raw.allow.map(String) : base.allow, deny: Array.isArray(raw.deny) ? raw.deny.map(String) : base.deny };
  }

  private readSession(raw: Record<string, unknown>): AiSession {
    const legacy = !raw.agentId && (LegacyKey.Endpoint in raw || LegacyKey.Pass in raw || (Array.isArray(raw.messages) && raw.messages.some((item) => item && typeof item === 'object' && 'info' in (item as object))));
    const base = this.blank(String(raw.logId || ''), raw.mode === AiMode.Isolated ? AiMode.Isolated : AiMode.Source, String(raw.directory || ''), typeof raw.repository === 'string' ? raw.repository : undefined, raw.trackLog === true, String(raw.title || '会话'));
    base.id = typeof raw.id === 'string' ? raw.id : base.id;
    base.agentId = typeof raw.agentId === 'string' ? raw.agentId : undefined;
    base.legacy = legacy;
    base.created = typeof raw.created === 'string' ? raw.created : base.created;
    base.model = typeof raw.model === 'string' ? raw.model : undefined;
    base.snapshot = typeof raw.snapshot === 'string' ? raw.snapshot : undefined;
    base.messages = Array.isArray(raw.messages) ? raw.messages.map((item) => AiService.msg(item)).filter((item): item is AiMsg => !!item) : [];
    base.queue = [];
    base.state = AiSessionState.Idle;
    base.closed = raw.closed === true;
    base.options = Array.isArray(raw.options) ? raw.options as AiOption[] : [];
    base.commands = Array.isArray(raw.commands) ? raw.commands as AiCommand[] : [];
    base.usage = raw.usage && typeof raw.usage === 'object' ? raw.usage as AiSession['usage'] : AiDefaults.usage();
    base.calls = Array.isArray(raw.calls) ? raw.calls.map(String) : [];
    base.toolSizes = Array.isArray(raw.toolSizes) ? raw.toolSizes as AiSession['toolSizes'] : [];
    return base;
  }

  private static msg(value: unknown): AiMsg | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (Array.isArray(row.parts) && (row.role === 'user' || row.role === 'agent') && row.parts.every((part) => part && typeof part === 'object' && 't' in (part as object))) {
      return { id: String(row.id || crypto.randomUUID()), role: row.role, parts: row.parts as AiPart[], done: row.done === true, stop: row.stop === true };
    }
    const info = (row.info || {}) as Record<string, unknown>;
    const parts = Array.isArray(row.parts) ? row.parts : [];
    const text = parts.map((part) => Transcript.textOf((part as Record<string, unknown>).text || (part as Record<string, unknown>).content || part)).join('\n');
    const role = info.role === 'user' ? 'user' : 'agent';
    return { id: crypto.randomUUID(), role, parts: [role === 'user' ? { t: AiPartKind.User, text } : { t: AiPartKind.Text, text }], done: true };
  }

  private saveSoon(): Promise<void> {
    this.tail = this.tail.then(() => this.write(this.sessionsPath(), this.sessions)).catch(() => undefined);
    return this.tail;
  }

  private async write(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value), 'utf8');
    await fs.rename(temp, file);
  }

  async close(): Promise<void> {
    this.stopped = true;
    await this.host?.close();
    this.host = null;
    await this.mcp.stop();
    await this.tail;
  }
}

