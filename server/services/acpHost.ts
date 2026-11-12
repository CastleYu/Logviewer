import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import fs from 'node:fs/promises';
import { AcpCapKey, AcpMethod, AiCmd, AiConst, type AiAuthMethod, type AiOption } from '../../src/config/aiTypes';

type Pending = { ok: (value: unknown) => void; fail: (error: Error) => void; timer: NodeJS.Timeout };
type Ask = (method: string, params: Record<string, unknown>) => Promise<unknown>;
type Note = (method: string, params: Record<string, unknown>) => void;
type Child = ChildProcessByStdio<Writable, Readable, Readable>;

export class AcpError extends Error {
  constructor(message: string) { super(message); this.name = 'AcpError'; }
}

export class AcpCaps {
  load = false;
  http = false;
  steering = false;
  extraDirs = false;
  name = '';
  version = '';
  auth: AiAuthMethod[] = [];
  raw: Record<string, unknown> = {};
}

export class Redact {
  constructor(private readonly secrets: string[]) {}
  text(value: string): string {
    let out = value;
    for (const secret of this.secrets) {
      if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]');
    }
    return out;
  }
}

export class AcpCmd {
  static expand(line: string, env: NodeJS.ProcessEnv): string {
    return line
      .replace(/%([^%\r\n]+)%/g, (_all, key: string) => env[key] ?? '')
      .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_all, key: string) => env[key] ?? '')
      .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/g, (_all, key: string) => env[key] ?? '');
  }

  static split(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote = '';
    for (const ch of line.trim()) {
      if (quote) {
        if (ch === quote) quote = '';
        else cur += ch;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  static async resolve(command: string, env: NodeJS.ProcessEnv): Promise<string[]> {
    const parts = AcpCmd.split(AcpCmd.expand(command, env));
    if (!parts.length) throw new AcpError('启动命令为空');
    const head = parts[0].replace(/^"|"$/g, '');
    if (new RegExp(`^${AiCmd.ExeName}(\\.cmd)?$`, 'i').test(head)) {
      const found = await AcpCmd.which(head);
      parts[0] = found || AiCmd.Bin;
    }
    return parts;
  }

  private static async which(name: string): Promise<string> {
    const paths = (process.env.PATH || '').split(';').filter(Boolean);
    const suffixes = name.toLowerCase().endsWith('.cmd') ? [''] : ['.cmd', '.exe', ''];
    for (const dir of paths) {
      for (const suffix of suffixes) {
        const file = `${dir}\\${name}${suffix}`;
        try { await fs.access(file); return file; } catch { /* next */ }
      }
    }
    return '';
  }
}

export class AcpHost {
  private child: Child | null = null;
  private buf = '';
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private stderr = Buffer.alloc(0);
  readonly caps = new AcpCaps();
  alive = false;
  onNote: Note = () => undefined;
  onAsk: Ask = async () => ({});
  private redact: Redact;

  private constructor(private readonly secrets: string[]) { this.redact = new Redact(secrets); }

  static async open(command: string, cwd: string, env: NodeJS.ProcessEnv, secrets: string[]): Promise<AcpHost> {
    const host = new AcpHost(secrets);
    const parts = await AcpCmd.resolve(command, env);
    let child: Child;
    try {
      child = spawn(parts[0], parts.slice(1), { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: true }) as Child;
    } catch (error) {
      throw new AcpError(AcpHost.spawnText(error, parts[0]));
    }
    host.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => host.feed(chunk));
    child.stderr.on('data', (chunk: Buffer) => { host.stderr = Buffer.concat([host.stderr, chunk]).subarray(-4000); });
    child.once('error', (error) => host.die(AcpHost.spawnText(error, parts[0])));
    child.once('exit', (code) => host.die(code === 0 ? 'Agent 进程已退出' : `Agent 进程退出，代码 ${code}${host.tail()}`));
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new AcpError('等待 Agent 进程超时')), AiConst.BootMs);
      child.once('spawn', () => { clearTimeout(timer); resolve(); });
      child.once('error', (error) => { clearTimeout(timer); reject(new AcpError(AcpHost.spawnText(error, parts[0]))); });
    });
    try { await ready; } catch (error) { await host.close(); throw error; }
    host.alive = true;
    try {
      const result = await host.call(AcpMethod.Initialize, {
        protocolVersion: AiConst.Protocol,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: false }, terminal: false },
        clientInfo: { name: AiConst.Client, version: '1' },
      }, AiConst.BootMs) as Record<string, unknown>;
      host.readCaps(result);
    } catch (error) {
      await host.close();
      throw error instanceof AcpError ? error : new AcpError(host.redact.text((error as Error).message || 'initialize 失败'));
    }
    return host;
  }

  private static spawnText(error: unknown, exe: string): string {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return `找不到程序：${exe}`;
    const message = error instanceof Error ? error.message : '启动失败';
    if (/ENOENT|not found|不是内部或外部命令|无法将/.test(message)) return `找不到程序：${exe}`;
    return `启动失败：${message.split('\n')[0].slice(0, 240)}`;
  }

  private tail(): string {
    const text = this.redact.text(AcpHost.decode(this.stderr)).trim();
    return text ? `：${text.split('\n').slice(-2).join(' ').slice(0, 240)}` : '';
  }

  private static decode(value: Buffer): string {
    if (!value.length) return '';
    try { return new TextDecoder('utf-8', { fatal: true }).decode(value); }
    catch { try { return new TextDecoder('gbk').decode(value); } catch { return value.toString('utf8'); } }
  }

  private readCaps(result: Record<string, unknown>): void {
    const caps = (result.agentCapabilities || {}) as Record<string, unknown>;
    const mcp = (caps.mcpCapabilities || {}) as Record<string, unknown>;
    const sessions = (caps.sessionCapabilities || {}) as Record<string, unknown>;
    const meta = (result._meta || {}) as Record<string, unknown>;
    const steer = (meta[AcpCapKey.Steering] || {}) as Record<string, unknown>;
    const info = (result.agentInfo || {}) as Record<string, unknown>;
    this.caps.load = caps[AcpCapKey.Load] === true;
    this.caps.http = mcp[AcpCapKey.Http] === true;
    this.caps.steering = steer.supported === true;
    this.caps.extraDirs = Object.prototype.hasOwnProperty.call(sessions, AcpCapKey.ExtraDirs);
    this.caps.name = String(info.name || '');
    this.caps.version = String(info.version || '');
    this.caps.auth = Array.isArray(result.authMethods) ? result.authMethods.map((item) => {
      const row = item as Record<string, unknown>;
      return { id: String(row.id || ''), name: String(row.name || ''), description: String(row.description || '') };
    }) : [];
    this.caps.raw = result;
  }

  static options(value: unknown): AiOption[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const row = item as Record<string, unknown>;
      const options = Array.isArray(row.options) ? row.options.map((option) => {
        const cell = option as Record<string, unknown>;
        return { value: String(cell.value || ''), name: String(cell.name || cell.value || '') };
      }) : [];
      return { id: String(row.id || ''), name: String(row.name || row.id || ''), value: String(row.currentValue || ''), options };
    }).filter((item) => item.id);
  }

  call(method: string, params: unknown, ms = AiConst.BootMs): Promise<unknown> {
    if (!this.child || !this.alive) return Promise.reject(new AcpError('Agent 未连接'));
    const id = ++this.seq;
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { this.pending.delete(id); fail(new AcpError(`${method} 超时`)); }, ms);
      this.pending.set(id, { ok, fail, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    if (!this.child || !this.alive) return;
    this.write({ jsonrpc: '2.0', method, params });
  }

  private write(body: unknown): void {
    try { this.child?.stdin.write(`${JSON.stringify(body)}\n`); }
    catch (error) { this.die(error instanceof Error ? error.message : '写入 Agent 失败'); }
  }

  private feed(chunk: string): void {
    this.buf += chunk;
    let index = this.buf.indexOf('\n');
    while (index >= 0) {
      const line = this.buf.slice(0, index).trim();
      this.buf = this.buf.slice(index + 1);
      if (line) this.take(line);
      index = this.buf.indexOf('\n');
    }
  }

  private take(line: string): void {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(line) as Record<string, unknown>; }
    catch { return; }
    const id = typeof msg.id === 'number' ? msg.id : undefined;
    if (typeof msg.method === 'string' && id !== undefined) {
      void this.reply(id, msg.method, (msg.params || {}) as Record<string, unknown>);
      return;
    }
    if (id !== undefined && this.pending.has(id) && (Object.prototype.hasOwnProperty.call(msg, 'result') || msg.error)) {
      const pending = this.pending.get(id)!;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if (msg.error) {
        const error = msg.error as { message?: string };
        pending.fail(new AcpError(this.redact.text(error.message || 'Agent 返回错误')));
      } else pending.ok(msg.result);
      return;
    }
    if (typeof msg.method === 'string' && id === undefined) this.onNote(msg.method, (msg.params || {}) as Record<string, unknown>);
  }

  private async reply(id: number, method: string, params: Record<string, unknown>): Promise<void> {
    try {
      const result = await this.onAsk(method, params);
      this.write({ jsonrpc: '2.0', id, result });
    } catch (error) {
      const message = this.redact.text(error instanceof Error ? error.message : '请求被拒绝');
      this.write({ jsonrpc: '2.0', id, error: { code: -32603, message } });
    }
  }

  private die(reason: string): void {
    if (!this.alive && !this.pending.size) return;
    this.alive = false;
    const error = new AcpError(this.redact.text(reason));
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.fail(error);
      this.pending.delete(id);
    }
  }

  async close(): Promise<void> {
    this.alive = false;
    const child = this.child;
    this.child = null;
    this.die('Agent 已关闭');
    if (!child) return;
    try { child.kill(); } catch { /* already gone */ }
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode) { resolve(); return; }
      const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } resolve(); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
