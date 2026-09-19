import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { AiConfig } from '../../src/config/aiTypes';

type SpawnFn = (file: string, args: string[], options: SpawnOptions) => ChildProcess;
type FetchFn = typeof fetch;
type RuntimeDeps = { spawn?: SpawnFn; fetch?: FetchFn; platform?: NodeJS.Platform; killTree?: (pid: number) => Promise<void> };
type Entry = { key: string; directory: string; child: ChildProcess; config: AiConfig; endpoint: string };

const Startup = {
  TimeoutMs: 15_000,
  PollMs: 100,
  Host: '127.0.0.1',
  PasswordPrefix: 'LOGVIEWER_OPENCODE_PASSWORD_',
  DisableAutoUpdate: 'OPENCODE_DISABLE_AUTOUPDATE',
  DisableModelsFetch: 'OPENCODE_DISABLE_MODELS_FETCH',
} as const;

export class AiRuntime {
  private readonly entries = new Map<string, Entry>();
  private readonly makeSpawn: SpawnFn;
  private readonly getFetch: FetchFn;
  private readonly platform: NodeJS.Platform;
  private readonly killTree: (pid: number) => Promise<void>;
  private readonly generatedAuth = new Map<string, { env: string; secret: string }>();
  private readonly pending = new Map<string, Promise<AiConfig>>();

  constructor(deps: RuntimeDeps = {}) {
    this.makeSpawn = deps.spawn || spawn;
    this.getFetch = deps.fetch || fetch;
    this.platform = deps.platform || process.platform;
    this.killTree = deps.killTree || (async (pid) => {
      if (this.platform === 'win32') {
        await new Promise<void>((resolve) => { const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); killer.once('close', () => resolve()); killer.once('error', () => resolve()); });
      } else process.kill(pid);
    });
  }

  async start(directory: string, config: AiConfig): Promise<AiConfig> {
    if (!config.launch) return config;
    const key = JSON.stringify([path.resolve(directory), config.executable, config.username, config.passwordEnv]);
    const running = this.pending.get(key);
    if (running) return running;
    const task = this.launch(directory, config);
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }

  private async launch(directory: string, config: AiConfig): Promise<AiConfig> {
    const resolved = path.resolve(directory);
    const username = config.username || 'opencode';
    const executable = config.executable || 'serve';
    const authBase = [resolved, executable, username].join('\0');
    const generated = config.passwordEnv ? undefined : (this.generatedAuth.get(authBase) || (() => {
      const value = { env: `${Startup.PasswordPrefix}${crypto.randomBytes(8).toString('hex').toUpperCase()}`, secret: crypto.randomBytes(24).toString('base64url') };
      this.generatedAuth.set(authBase, value);
      return value;
    })());
    const passwordEnv = config.passwordEnv || generated!.env;
    if (!process.env[passwordEnv]) process.env[passwordEnv] = generated?.secret || crypto.randomBytes(24).toString('base64url');
    const key = [resolved, executable, username, passwordEnv, process.env[passwordEnv]].join('\0');
    const existing = this.entries.get(key);
    if (existing && existing.child.exitCode === null && !existing.child.killed) return { ...existing.config };
    if (existing) this.entries.delete(key);
    const port = await this.freePort();
    const endpoint = this.endpoint(config.endpoint, port);
    const child = this.makeSpawn(executable, ['serve', '--hostname', Startup.Host, '--port', String(port)], {
      cwd: resolved, shell: false, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, OPENCODE_SERVER_USERNAME: username, OPENCODE_SERVER_PASSWORD: process.env[passwordEnv], [Startup.DisableAutoUpdate]: 'true', [Startup.DisableModelsFetch]: 'true' },
    });
    const entry: Entry = { key, directory: resolved, child, config: { ...config, endpoint, username, passwordEnv }, endpoint };
    this.entries.set(key, entry);
    let spawnError: Error | undefined;
    child.once('error', (error) => { spawnError = error; });
    try {
      await this.ready(entry, () => spawnError);
      child.once('exit', () => { if (this.entries.get(key) === entry) this.entries.delete(key); });
      child.once('error', () => { if (this.entries.get(key) === entry) this.entries.delete(key); });
      return { ...entry.config };
    } catch (error) {
      this.entries.delete(key);
      await this.stop(entry);
      throw error;
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.pending.values()]);
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((entry) => this.stop(entry)));
    for (const item of this.generatedAuth.values()) delete process.env[item.env];
    this.generatedAuth.clear();
  }

  private endpoint(base: string, port: number): string {
    const url = new URL('http://127.0.0.1');
    url.hostname = Startup.Host;
    url.port = String(port);
    return url.toString().replace(/\/$/, '');
  }

  private async freePort(): Promise<number> {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, Startup.Host, () => resolve()); });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!port) throw new Error('无法分配 AI 服务端口');
    return port;
  }

  private async ready(entry: Entry, getSpawnError: () => Error | undefined): Promise<void> {
    const auth = `Basic ${Buffer.from(`${entry.config.username}:${process.env[entry.config.passwordEnv!]}`).toString('base64')}`;
    const url = `${entry.endpoint}/path?directory=${encodeURIComponent(entry.directory)}`;
    const deadline = Date.now() + Startup.TimeoutMs;
    let last = 'AI 服务未就绪';
    while (Date.now() < deadline) {
      if (entry.child.exitCode !== null) throw new Error(`AI 服务启动失败，退出码 ${entry.child.exitCode}`);
      const spawnError = getSpawnError();
      if (spawnError) throw spawnError;
      try {
        const response = await this.getFetch(url, { headers: { authorization: auth }, signal: AbortSignal.timeout(1000), redirect: 'manual' });
        if (response.ok) {
          const body = await response.json().catch(() => ({})) as Record<string, unknown>;
          const seen = String(body.directory || body.path || body.cwd || '');
          if (seen && path.resolve(seen) === entry.directory) return;
          last = 'AI 服务返回了错误工作目录';
        } else last = `AI 服务 readiness 返回 ${response.status}`;
      } catch (error) { last = error instanceof Error ? error.message : String(error); }
      await new Promise((resolve) => setTimeout(resolve, Startup.PollMs));
    }
    throw new Error(`AI 服务启动超时：${last}`);
  }

  private async stop(entry: Entry): Promise<void> {
    const pid = entry.child.pid;
    if (!pid || entry.child.exitCode !== null) return;
    await this.killTree(pid).catch(() => undefined);
    await new Promise<void>((resolve) => { if (entry.child.exitCode !== null) resolve(); else { entry.child.once('exit', () => resolve()); setTimeout(resolve, 2_000).unref(); } });
  }
}
