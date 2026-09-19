import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { AiClient } from './aiClient';
import { AiConst, AiMode, AiSessionState, type AiConfig, type AiCreateInput, type AiPromptInput, type AiSession, type AiState } from '../../src/config/aiTypes';
import type { HistoryStore } from './historyStore';
import { AiRuntime } from './aiRuntime';

export class AiService {
  private config: AiConfig = { endpoint: 'http://127.0.0.1:4096', executable: 'opencode', launch: false };
  private sessions: AiSession[] = [];
  private loaded = false;
  private readonly active = new Set<string>();
  private readonly generations = new Map<string, number>();
  private persistTail: Promise<void> = Promise.resolve();
  private readonly runtime = new AiRuntime();
  private initTask?: Promise<void>;
  private stopped = false;

  constructor(private readonly root: string, private readonly history: HistoryStore) {}

  private configPath(): string { return path.join(this.root, AiConst.ConfigFile); }
  private sessionsPath(): string { return path.join(this.root, AiConst.SessionsFile); }

  async init(): Promise<void> {
    if (this.initTask) return this.initTask;
    this.initTask = this.load();
    return this.initTask;
  }

  private async load(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    this.config = await this.read<AiConfig>(this.configPath(), this.config);
    this.sessions = await this.read<AiSession[]>(this.sessionsPath(), []);
    this.loaded = true;
    for (const session of this.sessions) {
      if (session.state === AiSessionState.Busy) this.monitor(session);
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
      [AiConst.DiagnoseRecipe, '---\ndescription: Diagnose a log failure from tracked source and supplied logs\nmode: primary\n---\nRead tracked source and supplied logs. Reconstruct the timeline, separate observed evidence from hypotheses, identify the failure chain, and propose a minimal repair with rollback. Do not edit or commit.'],
      [AiConst.EvidenceRecipe, '---\ndescription: Collect bounded evidence for the primary diagnosis agent\nmode: subagent\n---\nCollect exact source paths, timestamps, requests, responses, and reproduction steps. Return concise evidence and mark every unverified inference for the primary agent.'],
    ];
    for (const [name, text] of entries) { const file = path.join(dir, name); try { await fs.writeFile(file, text, { encoding: 'utf8', flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
  }

  async create(input: AiCreateInput): Promise<AiSession> {
    await this.ready();
    const log = await this.history.get(input.logId);
    if (!Object.values(AiMode).includes(input.mode)) throw new Error('请选择日志隔离或源码模式');
    const area = await this.workspace(input, await this.history.content(input.logId));
    if (area.repository) await this.history.update(input.logId, { repository: area.repository });
    if (input.installRecipe) await this.recipes(area.directory);
    const config = await this.runtime.start(area.directory, this.config);
    const client = new AiClient(config);
    const remote = await client.createSession(area.directory, `LogViewer ${log.name}`);
    if (typeof remote.id !== 'string' || !remote.id) throw new Error('Agent 返回了无效会话');
    const session: AiSession = { id: remote.id, logId: input.logId, mode: input.mode, directory: area.directory, repository: area.repository, trackLog: area.trackLog, created: new Date().toISOString(), state: AiSessionState.Idle, messages: [], permissions: [], questions: [], endpoint: config.endpoint, username: config.username, passwordEnv: config.passwordEnv, managed: config.managed, executable: config.executable };
    this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
    await this.persist();
    return session;
  }

  async prompt(input: AiPromptInput): Promise<AiSession> {
    await this.ready();
    const session = this.session(input.sessionId);
    if (this.active.has(session.id)) throw new Error('AI 会话正在处理，请等待完成');
    if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error('请输入分析内容');
    this.active.add(session.id);
    const file = session.mode === AiMode.Isolated ? AiConst.InputName : `.logviewer-ai/${session.logId}/${AiConst.InputName}`;
    const context = session.mode === AiMode.Isolated || session.trackLog ? `日志快照：${file}。` : '日志通过本次提示词提供；源码工作区未复制日志文件。';
    const prompt = `${context}以下内容来自用户选择的日志分析范围。\n\n${input.prompt}${input.recipe ? `\n\n${AiConst.Recipe}` : ''}`;
    try {
      session.state = AiSessionState.Busy;
      session.error = undefined;
      await this.ensureRuntime(session);
      await this.persist();
      this.active.add(session.id);
      const generation = (this.generations.get(session.id) || 0) + 1;
      this.generations.set(session.id, generation);
      await this.client(session).prompt(session.directory, session.id, prompt, input.model || (this.config.providerID && this.config.modelID ? { providerID: this.config.providerID, modelID: this.config.modelID } : undefined), input.agent || this.config.agent);
      void this.poll(session, generation).catch(() => this.active.delete(session.id));
      return session;
    } catch (error) { session.state = AiSessionState.Error; session.error = error instanceof Error ? error.message : String(error); await this.persist(); }
    finally { if (session.state === AiSessionState.Error) this.active.delete(session.id); }
    return session;
  }

  private async poll(session: AiSession, generation: number, recovering = false): Promise<void> {
    const client = this.client(session);
    const started = Date.now();
    const baseline = recovering ? 0 : session.messages.length;
    let observedBusy = false;
    while (!this.stopped && Date.now() - started < AiConst.PollTimeoutMs) {
      try {
        if (this.generations.get(session.id) !== generation) return;
        const [messages, permissions, questions, statuses] = await Promise.all([client.messages(session.directory, session.id), client.permissions(session.directory), client.questions(session.directory), client.status(session.directory)]);
        if (this.stopped || this.generations.get(session.id) !== generation) return;
        session.messages = messages;
        session.permissions = permissions.filter((item) => item.sessionID === session.id);
        session.questions = questions.filter((item) => item.sessionID === session.id);
        const status = statuses[session.id] as { type?: string } | undefined;
        const busy = status?.type === 'busy' || status?.type === 'retry' || session.permissions.length > 0 || session.questions.length > 0;
        if (busy) observedBusy = true;
        const last = messages.at(-1)?.info as { role?: string; error?: unknown; time?: { completed?: number }; finish?: string } | undefined;
        const completed = !busy && messages.length > baseline && last?.role === 'assistant' && !!(observedBusy || last.time?.completed || last.finish || last.error);
        session.state = completed ? AiSessionState.Idle : AiSessionState.Busy;
        session.error = last?.error ? JSON.stringify(last.error) : undefined;
        if (completed && last?.error) session.state = AiSessionState.Error;
        if (completed) this.active.delete(session.id);
        await this.persist();
        if (completed) return;
      } catch (error) { if (this.stopped || this.generations.get(session.id) !== generation) return; session.error = error instanceof Error ? error.message : String(error); session.state = AiSessionState.Error; await this.persist(); this.active.delete(session.id); return; }
      await new Promise((resolve) => setTimeout(resolve, AiClient.PollMs));
    }
    if (this.stopped) return;
    session.state = AiSessionState.Error;
    session.error = 'OpenCode poll timeout';
    await this.persist();
    this.active.delete(session.id);
  }

  async abort(id: string): Promise<AiSession> { await this.ready(); const session = this.session(id); await this.client(session).abort(session.directory, id); this.generations.set(id, (this.generations.get(id) || 0) + 1); session.state = AiSessionState.Aborted; this.active.delete(id); session.permissions = []; session.questions = []; await this.persist(); return session; }
  async replyPermission(id: string, requestId: string, body: unknown): Promise<AiSession> { await this.ready(); const session = this.session(id); if (!session.permissions.some((item) => (item.id || item.requestID) === requestId)) throw new Error('权限请求不属于当前会话'); if (!['once', 'always', 'reject'].includes((body as { reply: string })?.reply)) throw new Error('无效权限回复'); await this.client(session).permission(session.directory, requestId, body); session.permissions = session.permissions.filter((item) => (item.id || item.requestID) !== requestId); await this.persist(); return session; }
  async replyQuestion(id: string, requestId: string, body: unknown, reject = false): Promise<AiSession> { await this.ready(); const session = this.session(id); if (!session.questions.some((item) => (item.id || item.requestID) === requestId)) throw new Error('问题请求不属于当前会话'); await this.client(session).question(session.directory, requestId, body, reject); session.questions = session.questions.filter((item) => (item.id || item.requestID) !== requestId); await this.persist(); return session; }
  async catalogs(id: string): Promise<{ providers: unknown; agents: unknown }> { await this.ready(); const session = this.session(id); const client = this.client(session); return { providers: await client.providers(session.directory), agents: await client.agents(session.directory) }; }
  async refresh(id: string): Promise<AiSession> { await this.ready(); const session = this.session(id); session.error = undefined; this.monitor(session); return session; }

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
    void this.ensureRuntime(session).then(() => this.poll(session, generation, true)).catch(async (error) => { session.error = error.message; session.state = AiSessionState.Error; await this.persist(); }).finally(() => { if (this.generations.get(session.id) === generation) this.active.delete(session.id); });
  }
  async close(): Promise<void> { this.stopped = true; await this.persistTail; await this.runtime.close(); }
}
