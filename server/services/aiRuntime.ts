import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { AiConnectConst as Startup, AiConnectStage, type AiConfig } from '../../src/config/aiTypes';
import { AiConnection, AiConnectionError } from './aiConnection';
import { ManagedProcess } from './managedProcess';

type SpawnFn = (file: string, args: string[], options: SpawnOptions) => ChildProcess;
type FetchFn = typeof fetch;
type RuntimeDeps = { spawn?: SpawnFn; fetch?: FetchFn; platform?: NodeJS.Platform; killTree?: (pid: number) => Promise<void>; startupMs?: number };
type Entry = { key: string; directory: string; child: ChildProcess; config: AiConfig; endpoint: string };

export class AiRuntime {
  private readonly entries = new Map<string, Entry>();
  private readonly makeSpawn: SpawnFn;
  private readonly getFetch: FetchFn;
  private readonly platform: NodeJS.Platform;
  private readonly killTree: (pid: number) => Promise<void>;
  private readonly generatedAuth = new Map<string, { env: string; secret: string }>();
  private readonly pending = new Map<string, Promise<AiConfig>>();
  private closing = false;
  private readonly startupMs: number;

  constructor(deps: RuntimeDeps = {}) {
    this.makeSpawn = deps.spawn || ManagedProcess.spawn;
    this.startupMs = deps.startupMs ?? Startup.StartMs;
    this.getFetch = deps.fetch || fetch;
    this.platform = deps.platform || process.platform;
    this.killTree = deps.killTree || (async (pid) => {
      if (this.platform === 'win32') {
        await new Promise<void>((resolve) => { const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); killer.once('close', () => resolve()); killer.once('error', () => resolve()); });
      } else process.kill(pid);
    });
  }

  async start(directory: string, config: AiConfig): Promise<AiConfig> {
    this.assertOpen();
    let prior = '未填写已有实例地址';
    if (config.endpoint?.trim()) {
      try {
        const endpoint = await AiConnection.endpoint(config.endpoint);
        const connected = { ...config, endpoint, managed: false, launch: false };
        await AiConnection.probe(directory, connected, this.getFetch);
        this.assertOpen();
        return connected;
      } catch (error) { prior = `已有实例连接失败：${AiConnection.reason(error)}`; }
    }
    try { return await this.startOwned(directory, config); }
    catch (error) {
      const stage = error instanceof AiConnectionError ? error.stage : AiConnectStage.Start;
      throw new AiConnectionError(stage, `${prior}；${AiConnection.reason(error)}`);
    }
  }

  async startOwned(directory: string, config: AiConfig): Promise<AiConfig> {
    this.assertOpen();
    if (!config.executable?.trim()) throw new AiConnectionError(AiConnectStage.MissingProgram, '未填写回退启动程序，无法启动本地 server');
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
    let executable: string;
    try {
      executable = AiConnection.expand(config.executable).trim().replace(/^"(.*)"$/, '$1');
      if (!executable) throw new Error('程序路径展开后为空');
    } catch (error) { throw new AiConnectionError(AiConnectStage.Start, `无法启动回退程序：${AiConnection.reason(error)}`); }
    const authBase = [resolved, executable, username].join('\0');
    const supplied = config.passwordEnv && process.env[config.passwordEnv] ? config.passwordEnv : undefined;
    const generated = supplied ? undefined : (this.generatedAuth.get(authBase) || (() => {
      const value = { env: `${Startup.PasswordPrefix}${crypto.randomBytes(8).toString('hex').toUpperCase()}`, secret: crypto.randomBytes(24).toString('base64url') };
      this.generatedAuth.set(authBase, value);
      return value;
    })());
    const passwordEnv = supplied || generated!.env;
    if (generated) process.env[passwordEnv] = generated.secret;
    const key = [resolved, executable, username, passwordEnv, process.env[passwordEnv]].join('\0');
    const existing = this.entries.get(key);
    if (existing && existing.child.exitCode === null && !existing.child.killed) {
      try { await AiConnection.probe(resolved, existing.config, this.getFetch); this.assertOpen(); return { ...existing.config }; }
      catch { await this.stop(existing); }
    }
    if (existing) this.entries.delete(key);
    const port = await this.freePort();
    const endpoint = `http://${Startup.Host}:${port}`;
    this.assertOpen();
    let child: ChildProcess;
    try { child = this.makeSpawn(executable, ['serve', '--hostname', Startup.Host, '--port', String(port)], {
      cwd: resolved, shell: false, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, [Startup.Username]: username, [Startup.Password]: process.env[passwordEnv], [Startup.DisableUpdate]: 'true', [Startup.DisableModels]: 'true' },
    }); } catch { throw new AiConnectionError(AiConnectStage.Start, '无法启动回退程序，请检查程序路径及执行权限'); }
    const entry: Entry = { key, directory: resolved, child, config: { ...config, endpoint, executable, username, passwordEnv, managed: true, launch: true }, endpoint };
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
    this.closing = true;
    await Promise.allSettled([...this.pending.values()]);
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((entry) => this.stop(entry)));
    for (const item of this.generatedAuth.values()) delete process.env[item.env];
    this.generatedAuth.clear();
  }

  private assertOpen(): void { if (this.closing) throw new AiConnectionError(AiConnectStage.Closed, '应用正在关闭，已停止连接和启动 server'); }

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
    const deadline = Date.now() + this.startupMs;
    let last = 'AI 服务未就绪';
    while (Date.now() < deadline) {
      this.assertOpen();
      const spawnError = getSpawnError();
      if (spawnError) throw new AiConnectionError(AiConnectStage.Start, `无法启动回退程序（${(spawnError as NodeJS.ErrnoException).code || '启动错误'}），请检查路径及执行权限`);
      if (entry.child.exitCode !== null || entry.child.signalCode) {
        if (entry.child.exitCode === 71) throw new AiConnectionError(AiConnectStage.Start, '无法启动回退程序，请检查程序路径、权限和 cmd 包装程序');
        throw new AiConnectionError(AiConnectStage.Exit, `回退程序启动后提前退出（退出码 ${entry.child.exitCode ?? entry.child.signalCode}），未能连接 server`);
      }
      try {
        await AiConnection.probe(entry.directory, entry.config, this.getFetch, Math.min(1000, this.startupMs));
        this.assertOpen();
        return;
      } catch (error) { last = AiConnection.reason(error); }
      await new Promise((resolve) => setTimeout(resolve, Startup.PollMs));
    }
    throw new AiConnectionError(AiConnectStage.Ready, `回退程序已启动，但 server 无法连接或未就绪：${last}`);
  }

  private async stop(entry: Entry): Promise<void> {
    const pid = entry.child.pid;
    if (!pid || entry.child.exitCode !== null) return;
    if (entry.child.stdin && !entry.child.stdin.destroyed) {
      entry.child.stdin.end();
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); entry.child.off('exit', done); resolve(); };
        const timer = setTimeout(done, 700);
        entry.child.once('exit', done);
      });
      if (entry.child.exitCode !== null) return;
    }
    await this.killTree(pid).catch(() => undefined);
    await new Promise<void>((resolve) => { if (entry.child.exitCode !== null) resolve(); else { entry.child.once('exit', () => resolve()); setTimeout(resolve, 2_000).unref(); } });
  }
}
