import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { AiClient } from './aiClient';
import { AiConst, AiMode, AiSessionState, AiRepositoryOrigin, type AiConfig, type AiCreateInput, type AiPromptInput, type AiQueueItem, type AiSession, type AiState, type AiRepositoryInput, type AiRepositoryState } from '../../src/config/aiTypes';
import type { HistoryStore } from './historyStore';
import { AiRuntime } from './aiRuntime';
import { AiTerminal } from './aiTerminal';
import { AiConnection } from './aiConnection';
import { AiProtocol, type AiRemoteStatus } from './aiProtocol';
import { AiMessageRole, AiPartType, AiToolStatus } from '../../src/config/aiMessageTypes';
import { SourceService } from './sourceService';
import type { SourceTarget } from '../../src/config/sourceTypes';
import { AiDiagnosis } from '../../src/config/aiDiagnosis';

type Watch = { generation: number; controller: AbortController; error?: unknown; connected: boolean; next: number };
type AiDeps = { terminal?: (executable: string) => Pick<AiTerminal, 'open'>; sources?: Pick<SourceService, 'repositories' | 'repository'> };

export class AiService {
  private config: AiConfig = { endpoint: 'http://127.0.0.1:4096', executable: 'opencode', launch: false, mode: AiMode.Source, recipe: true };
  private sessions: AiSession[] = [];
  private loaded = false;
  private readonly active = new Set<string>();
  private readonly generations = new Map<string, number>();
  private persistTail: Promise<void> = Promise.resolve();
  private readonly runtime = new AiRuntime();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly watches = new Map<string, Watch>();
  private initTask?: Promise<void>;
  private stopped = false;

  constructor(private readonly root: string, private readonly history: HistoryStore, private readonly deps: AiDeps = {}) {}

  private configPath(): string { return path.join(this.root, AiConst.ConfigFile); }
  private sessionsPath(): string { return path.join(this.root, AiConst.SessionsFile); }

  async init(): Promise<void> {
    if (this.initTask) return this.initTask;
    this.initTask = this.load();
    return this.initTask;
  }

  private async load(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    this.config = { ...this.config, ...await this.read<Partial<AiConfig>>(this.configPath(), {}) };
    this.sessions = await this.read<AiSession[]>(this.sessionsPath(), []);
    this.loaded = true;
    for (const session of this.sessions) {
      session.queue ||= [];
      if (session.state === AiSessionState.Accepted) session.queuePaused = true;
      if (session.state === AiSessionState.Busy || session.state === AiSessionState.Accepted) this.monitor(session);
      else if (session.queue.length && !session.queuePaused) void this.lock(session.id, () => this.drain(session));
    }
  }

  private async ready(): Promise<void> { if (!this.loaded) await this.init(); }
  private async read<T>(file: string, fallback: T): Promise<T> { try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; } }
  private async write(file: string, data: unknown): Promise<void> {
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(temp, file);
  }
  private persist(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.sessions));
    this.persistTail = this.persistTail.catch(() => undefined).then(() => this.write(this.sessionsPath(), snapshot));
    return this.persistTail;
  }
  private session(id: string): AiSession { const item = this.sessions.find((session) => session.id === id); if (!item) throw new Error('AI 会话不存在'); return item; }
  private client(session?: AiSession): AiClient { return new AiClient(session?.endpoint ? { ...this.config, endpoint: session.endpoint, username: session.username, passwordEnv: session.passwordEnv } : this.config); }

  private lock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const task = (this.locks.get(id) || Promise.resolve()).catch(() => undefined).then(action);
    this.locks.set(id, task);
    void task.finally(() => { if (this.locks.get(id) === task) this.locks.delete(id); }).catch(() => undefined);
    return task;
  }

  private stopWatch(id: string): void { this.watches.get(id)?.controller.abort(); this.watches.delete(id); }

  private async watch(session: AiSession, generation: number): Promise<void> {
    let watch = this.watches.get(session.id);
    if (watch?.generation !== generation) {
      this.stopWatch(session.id);
      watch = { generation, controller: new AbortController(), connected: false, next: 0 };
      this.watches.set(session.id, watch);
    }
    if (watch.connected || watch.next > Date.now() || this.stopped) return;
    const target = watch;
    target.connected = true;
    try {
      const stream = await this.client(session).events(session.directory, target.controller.signal, (event) => {
        if (this.watches.get(session.id) !== target || event.properties?.sessionID !== session.id) return;
        if (event.type === AiProtocol.SessionError) target.error = event.properties.error;
      });
      session.streamError = undefined;
      void stream.done.catch((error) => {
        if (!target.controller.signal.aborted && this.watches.get(session.id) === target) {
          session.streamError = `${AiProtocol.error(error)}；正通过轮询同步，事件连接将重试。`;
          target.connected = false; target.next = Date.now() + AiProtocol.StreamRetryMs;
        }
      });
    } catch (error) {
      if (!target.controller.signal.aborted) session.streamError = `${AiProtocol.error(error)}；正通过轮询同步，事件连接将重试。`;
      target.connected = false; target.next = Date.now() + AiProtocol.StreamRetryMs;
    }
  }

  private async fail(session: AiSession, error: unknown, generation: number): Promise<void> {
    if (this.generations.get(session.id) !== generation || this.stopped) return;
    session.error = AiProtocol.error(error); session.state = AiSessionState.Error;
    session.queuePaused = true; session.activity = { type: AiSessionState.Error, message: session.error };
    this.active.delete(session.id); this.stopWatch(session.id);
    await this.persist();
  }

  async configure(input: Partial<AiConfig>): Promise<AiState['config']> {
    await this.ready();
    this.config = { ...this.config, ...input };
    await this.write(this.configPath(), this.config);
    return this.configView();
  }
  private configView(): AiState['config'] {
    return { ...this.config, passwordConfigured: !!(this.config.passwordEnv && process.env[this.config.passwordEnv]) };
  }
  async state(): Promise<AiState> { await this.ready(); return { sessions: this.sessions, config: this.configView() }; }

  async repository(input: AiRepositoryInput): Promise<AiRepositoryState> {
    await this.ready();
    return this.lock(`${AiConst.RepositoryLock}${input.logId}`, async () => {
      const log = await this.history.get(input.logId);
      const source = this.deps.sources || new SourceService(path.join(this.root, AiConst.SourceConfigFile));
      const chosen = input.repository?.trim() ? await source.repository(input.repository.trim()) : undefined;
      const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
      const prior = this.sessions.filter((session) => session.logId === input.logId && session.mode === AiMode.Source && session.repository);
      const stored = log.repository || prior[0]?.repository;
      if (stored) {
        const bound = await source.repository(stored);
        if (chosen && !same(chosen, bound)) throw new Error(`此日志已绑定代码仓 ${bound}，不能切换到另一代码仓。请在该仓库中继续诊断。`);
        const roots = await Promise.all(prior.map((session) => source.repository(session.repository!)));
        if (roots.some((root) => !same(root, bound))) throw new Error('历史会话存在多个源码仓库，请先核对该日志的仓库归属。');
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

  private async workspace(input: AiCreateInput, content: string): Promise<{ directory: string; repository?: string; trackLog: boolean }> {
    const base = path.join(this.root, AiConst.WorkspaceDir, input.logId);
    await fs.mkdir(base, { recursive: true });
    if (input.mode === AiMode.Isolated) {
      await fs.writeFile(path.join(base, AiConst.InputName), content, 'utf8');
      await this.git(base, ['init', '--quiet']);
      await this.gitAdd(base, AiConst.InputName);
      return { directory: base, trackLog: false };
    }
    if (!input.repository) throw new Error('source 模式需要 repository');
    if (!path.isAbsolute(input.repository) || !(await fs.stat(input.repository).catch(() => null))?.isDirectory()) throw new Error('repository 必须是存在的绝对目录');
    if (input.trackLog) {
      const exact = path.join(input.repository, '.logviewer-ai', input.logId, AiConst.InputName);
      await fs.mkdir(path.dirname(exact), { recursive: true });
      await fs.writeFile(exact, content, 'utf8');
      await this.gitAdd(input.repository, path.relative(input.repository, exact));
    }
    return { directory: input.repository, repository: input.repository, trackLog: !!input.trackLog };
  }

  private gitAdd(repository: string, relative: string): Promise<void> {
    return this.git(repository, ['add', '-f', '--', relative]);
  }

  private git(repository: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['-C', repository, ...args], { stdio: 'ignore', shell: false, windowsHide: true });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Git 工作区操作失败 (${code})`)));
    });
  }

  private async recipes(directory: string): Promise<void> {
    const dir = path.join(directory, AiConst.RecipeDir);
    await fs.mkdir(dir, { recursive: true });
    const entries: [string, string][] = [
      [AiConst.DiagnoseRecipe, AiDiagnosis.PrimaryRecipe],
      [AiConst.EvidenceRecipe, AiDiagnosis.EvidenceRecipe],
    ];
    for (const [name, text] of entries) { const file = path.join(dir, name); try { await fs.writeFile(file, text, { encoding: 'utf8', flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
  }

  async create(input: AiCreateInput): Promise<AiSession> {
    await this.ready();
    const mode = input.mode ?? this.config.mode ?? AiMode.Source;
    if (!Object.values(AiMode).includes(mode)) throw new Error('请选择日志隔离或源码模式');
    const binding = mode === AiMode.Source ? await this.repository({ logId: input.logId, targets: input.targets, repository: input.repository }) : undefined;
    if (mode === AiMode.Source && !binding?.repository) throw new Error(binding?.candidates.length ? '日志索引匹配多个代码仓，请先选定该日志对应的仓库。' : '未能从日志源码索引确定代码仓，请配置索引或手动绑定该日志的仓库。');
    const log = await this.history.get(input.logId);
    const area = await this.workspace({ ...input, mode, repository: binding?.repository }, await this.history.content(input.logId));
    if (input.installRecipe) await this.recipes(area.directory);
    const config = await this.runtime.start(area.directory, this.config);
    const client = new AiClient(config);
    const remote = await client.createSession(area.directory, `LogViewer ${log.name}`);
    if (typeof remote.id !== 'string' || !remote.id) throw new Error('Agent 返回了无效会话');
    const session: AiSession = { id: remote.id, logId: input.logId, mode, directory: area.directory, repository: area.repository, logPath: this.history.contentPath(log.id), sourceAnchor: log.sourceAnchor, trackLog: area.trackLog, created: new Date().toISOString(), state: AiSessionState.Idle, messages: [], permissions: [], questions: [], queue: [], endpoint: config.endpoint, username: config.username, passwordEnv: config.passwordEnv, managed: config.managed, executable: config.executable };
    this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
    await this.persist();
    return session;
  }

  async prompt(input: AiPromptInput): Promise<AiSession> {
    await this.ready();
    if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error('请输入分析内容');
    return this.lock(input.sessionId, async () => {
      const session = this.session(input.sessionId);
      session.queue ||= [];
      session.queue.push({ id: crypto.randomUUID(), prompt: input.prompt, recipe: input.recipe, model: input.model, agent: input.agent, created: new Date().toISOString() });
      await this.persist();
      await this.drain(session);
      return session;
    });
  }

  private async startPrompt(session: AiSession, input: AiQueueItem): Promise<void> {
    this.active.add(session.id);
    const generation = (this.generations.get(session.id) || 0) + 1;
    this.generations.set(session.id, generation);
    const baseline = session.messages.length;
    const file = session.mode === AiMode.Isolated ? AiConst.InputName : `.logviewer-ai/${session.logId}/${AiConst.InputName}`;
    const context = session.mode === AiMode.Isolated || session.trackLog ? `日志快照：${file}。` : `完整日志快照：${session.logPath || this.history.contentPath(session.logId)}。`;
    const prompt = `${context}以下为用户问题及选择的日志范围：\n\n${input.prompt}`;
    try {
      session.state = AiSessionState.Accepted;
      session.lastPrompt = input;
      session.activity = { type: AiSessionState.Accepted };
      session.submittedAt = Date.now(); session.error = undefined;
      await this.persist();
      await this.ensureRuntime(session);
      await this.watch(session, generation);
      if (this.stopped) return;
      const log = await this.history.get(session.logId);
      const system = `${AiDiagnosis.Core}\n\n${AiDiagnosis.context({ mode: session.mode, repository: session.repository, logId: log.id, logName: log.name, logPath: session.logPath || this.history.contentPath(log.id), anchor: session.sourceAnchor || log.sourceAnchor })}${(input.recipe ?? this.config.recipe ?? true) ? `\n\n${AiDiagnosis.Report}` : ''}`;
      await this.client(session).prompt(session.directory, session.id, prompt, input.model || (this.config.providerID && this.config.modelID ? { providerID: this.config.providerID, modelID: this.config.modelID } : undefined), input.agent || this.config.agent, system);
      session.queue = (session.queue || []).filter((item) => item.id !== input.id);
      session.state = AiSessionState.Busy;
      session.activity = { type: AiSessionState.Busy };
      await this.persist();
      void this.poll(session, generation, baseline).catch((error) => this.fail(session, error, generation)).catch(() => undefined);
    } catch (error) { await this.fail(session, error, generation); }
  }

  private async drain(session: AiSession): Promise<void> {
    if (this.stopped || this.active.has(session.id) || session.queuePaused || !session.queue?.length) return;
    try {
      await this.ensureRuntime(session);
      const status = (await this.client(session).status(session.directory))[session.id] as AiRemoteStatus | undefined;
      if (status?.type === AiProtocol.Busy || status?.type === AiProtocol.Retry) { session.state = AiSessionState.Busy; session.activity = { type: status.type, message: status.message, attempt: status.attempt, next: status.next }; await this.persist(); this.monitor(session); return; }
    } catch (error) {
      const generation = (this.generations.get(session.id) || 0) + 1;
      this.generations.set(session.id, generation);
      await this.fail(session, error, generation); return;
    }
    if (this.stopped || this.active.has(session.id) || session.queuePaused || !session.queue?.length) return;
    await this.startPrompt(session, session.queue[0]);
  }

  private async poll(session: AiSession, generation: number, baseline: number, recovering = false): Promise<void> {
    const started = Date.now();
    while (!this.stopped && Date.now() - started < AiConst.PollTimeoutMs) {
      if (this.generations.get(session.id) !== generation) return;
      try {
        const client = this.client(session);
        const [messages, permissions, questions, statuses] = await Promise.all([client.messages(session.directory, session.id), client.permissions(session.directory), client.questions(session.directory), client.status(session.directory)]);
        if (this.stopped || this.generations.get(session.id) !== generation) return;
        session.messages = messages;
        session.permissions = permissions.filter((item) => item.sessionID === session.id);
        session.questions = questions.filter((item) => item.sessionID === session.id);
        const status = statuses[session.id] as AiRemoteStatus | undefined;
        const last = messages.at(-1);
        const info = last?.info as { role?: string; summary?: boolean; error?: unknown; time?: { completed?: number }; finish?: string } | undefined;
        const parts = (Array.isArray(last?.parts) ? last.parts : []) as { type?: string; tool?: string; state?: { status?: string; title?: string } }[];
        const fresh = recovering || messages.length > baseline;
        const knownError = AiProtocol.errorKey(info) === session.clearedError;
        const remoteError = this.watches.get(session.id)?.error || (fresh && !knownError ? info?.error : undefined);
        if (AiProtocol.isAbort(remoteError)) {
          session.state = AiSessionState.Aborted; session.error = undefined; session.queuePaused = true;
          session.activity = { type: AiSessionState.Aborted }; session.permissions = []; session.questions = [];
          this.active.delete(session.id); this.stopWatch(session.id); await this.persist(); return;
        }
        if (remoteError) { await this.fail(session, remoteError, generation); return; }
        const busy = status?.type === AiProtocol.Busy || status?.type === AiProtocol.Retry || session.permissions.length > 0 || session.questions.length > 0;
        const summary = (info?.role === AiMessageRole.Assistant && info.summary === true) || (info?.role === AiMessageRole.User && parts.some((part) => part.type === AiPartType.Compaction));
        const tool = [...parts].reverse().find((part) => part.type === AiPartType.Tool && (part.state?.status === AiToolStatus.Running || part.state?.status === AiToolStatus.Pending));
        const finished = info?.role === AiMessageRole.Assistant && !summary && !!(info.time?.completed || info.finish) && info.finish !== AiProtocol.ToolCalls && info.finish !== AiProtocol.Unknown;
        const compactPart = [...messages].reverse().flatMap((message) => Array.isArray(message.parts) ? message.parts : []).find((part) => part.type === AiPartType.Compaction);
        const continuingCompact = summary && compactPart?.auto === true;
        const intermediate = !!tool || info?.finish === AiProtocol.ToolCalls || info?.finish === AiProtocol.Unknown || (info?.role === AiMessageRole.Assistant && !summary && !finished);
        const completed = !busy && !continuingCompact && !intermediate && (recovering || (fresh && finished));
        if (completed) {
          if (session.state !== AiSessionState.Aborted) session.state = AiSessionState.Idle;
          session.activity = { type: session.state }; session.error = undefined;
          this.active.delete(session.id); this.stopWatch(session.id);
          await this.persist();
          await this.lock(session.id, () => this.drain(session));
          return;
        }
        session.state = AiSessionState.Busy;
        session.activity = session.permissions.length ? { type: 'permission' } : session.questions.length ? { type: 'question' } : status?.type === AiProtocol.Retry ? { type: AiProtocol.Retry, message: status.message, attempt: status.attempt, next: status.next } : summary ? { type: 'compacting' } : tool ? { type: 'tool', message: `正在执行 ${tool.tool || '工具'}${tool.state?.title ? `：${tool.state.title}` : ''}` } : { type: AiSessionState.Busy };
        await this.persist();
        await this.watch(session, generation);
      } catch (error) { await this.fail(session, error, generation); return; }
      await new Promise((resolve) => setTimeout(resolve, AiClient.PollMs));
    }
    if (!this.stopped && this.generations.get(session.id) === generation) await this.fail(session, 'OpenCode 等待超时；请重新同步会话确认运行状态。', generation);
  }

  async abort(id: string): Promise<AiSession> {
    await this.ready();
    return this.lock(id, async () => {
      const session = this.session(id);
      session.queuePaused = true;
      const generation = (this.generations.get(id) || 0) + 1;
      this.generations.set(id, generation); this.stopWatch(id);
      try { await this.client(session).abort(session.directory, id); }
      catch (error) { await this.fail(session, error, generation); throw error; }
      session.state = AiSessionState.Aborted; session.error = undefined;
      session.activity = { type: AiSessionState.Aborted }; this.active.delete(id);
      session.permissions = []; session.questions = [];
      await this.persist(); return session;
    });
  }
  async replyPermission(id: string, requestId: string, body: unknown): Promise<AiSession> { await this.ready(); const session = this.session(id); if (!session.permissions.some((item) => (item.id || item.requestID) === requestId)) throw new Error('权限请求不属于当前会话'); if (!['once', 'always', 'reject'].includes((body as { reply: string })?.reply)) throw new Error('无效权限回复'); await this.client(session).permission(session.directory, requestId, body); session.permissions = session.permissions.filter((item) => (item.id || item.requestID) !== requestId); await this.persist(); return session; }
  async replyQuestion(id: string, requestId: string, body: unknown, reject = false): Promise<AiSession> { await this.ready(); const session = this.session(id); if (!session.questions.some((item) => (item.id || item.requestID) === requestId)) throw new Error('问题请求不属于当前会话'); await this.client(session).question(session.directory, requestId, body, reject); session.questions = session.questions.filter((item) => (item.id || item.requestID) !== requestId); await this.persist(); return session; }
  async catalogs(id: string): Promise<{ providers: unknown; agents: unknown }> { await this.ready(); const session = this.session(id); const client = this.client(session); return { providers: await client.providers(session.directory), agents: await client.agents(session.directory) }; }
  async refresh(id: string): Promise<AiSession> {
    await this.ready();
    return this.lock(id, async () => { const session = this.session(id); this.monitor(session); return session; });
  }

  async resume(id: string): Promise<AiSession> {
    await this.ready();
    return this.lock(id, async () => {
      const session = this.session(id);
      if (this.active.has(id) && (session.state === AiSessionState.Busy || session.state === AiSessionState.Accepted)) throw new Error('Agent 仍在工作，请等待本轮完成');
      const status = (await this.client(session).status(session.directory))[id] as AiRemoteStatus | undefined;
      if (status?.type === AiProtocol.Busy || status?.type === AiProtocol.Retry) { this.monitor(session); throw new Error('OpenCode 仍在工作，请先同步或停止当前工作'); }
      session.messages = await this.client(session).messages(session.directory, id);
      session.clearedError = AiProtocol.errorKey(session.messages.at(-1)?.info);
      session.queuePaused = false; session.error = undefined; session.state = AiSessionState.Idle;
      await this.persist(); await this.drain(session); return session;
    });
  }
  async removeQueue(id: string, itemId: string): Promise<AiSession> {
    await this.ready();
    return this.lock(id, async () => {
      const session = this.session(id);
      if (!session.queue?.some((item) => item.id === itemId)) throw new Error('队列项不存在或已发送');
      session.queue = session.queue.filter((item) => item.id !== itemId); await this.persist(); return session;
    });
  }
  async openTerminal(id: string): Promise<{ opened: boolean }> {
    await this.ready();
    const session = this.session(id);
    await this.ensureRuntime(session);
    if ((session.username || this.config.username || 'opencode') !== 'opencode') throw new Error('OpenCode v1.2.27 的 attach 仅支持 opencode 用户名；当前实例使用自定义用户名，无法用此 CLI 恢复。请使用兼容该认证方式的 CLI。');
    const env: NodeJS.ProcessEnv = { ...process.env, OPENCODE_SERVER_USERNAME: session.username || this.config.username || 'opencode' };
    const passwordEnv = session.passwordEnv || this.config.passwordEnv;
    if (passwordEnv && process.env[passwordEnv]) env.OPENCODE_SERVER_PASSWORD = process.env[passwordEnv];
    const executable = AiConnection.expand(session.executable || this.config.executable).trim().replace(/^"(.*)"$/, '$1');
    const terminal = this.deps.terminal?.(executable) || new AiTerminal({ executable });
    return terminal.open(session.directory, session.endpoint || this.config.endpoint, session.id, env);
  }

  async launch(): Promise<{ managed: boolean; endpoint: string }> {
    await this.ready();
    const connected = await this.runtime.start(this.root, this.config);
    return { managed: Boolean(connected.managed), endpoint: connected.endpoint };
  }
  private async ensureRuntime(session: AiSession): Promise<void> {
    if (!session.managed) return;
    const config = await this.runtime.startOwned(session.directory, { ...this.config, executable: session.executable || this.config.executable });
    session.endpoint = config.endpoint; session.username = config.username; session.passwordEnv = config.passwordEnv;
  }
  private monitor(session: AiSession): void {
    if (this.active.has(session.id)) return;
    this.active.add(session.id);
    const generation = (this.generations.get(session.id) || 0) + 1;
    this.generations.set(session.id, generation);
    void this.ensureRuntime(session).then(() => this.poll(session, generation, 0, true)).catch((error) => this.fail(session, error, generation)).catch(() => undefined);
  }
  async close(): Promise<void> { this.stopped = true; for (const id of this.watches.keys()) this.stopWatch(id); await Promise.allSettled([...this.locks.values()]); await this.persistTail; await this.runtime.close(); }
}
