import { access, constants as fsConstants, readFile, stat } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export type TerminalDeps = { platform?: NodeJS.Platform; spawn?: typeof spawn; executable?: string };

class TerminalEnv {
  static readonly executable = 'LOGVIEWER_AI_EXECUTABLE';
  static readonly endpoint = 'LOGVIEWER_AI_ENDPOINT';
  static readonly session = 'LOGVIEWER_AI_SESSION';
  static readonly directory = 'LOGVIEWER_AI_DIRECTORY';
}

class TerminalText {
  static readonly cmd = 'cmd.exe';
  static readonly powershell = 'powershell.exe';
  static readonly attach = 'attach';
  static readonly sessionFlag = '--session';
  static readonly directoryFlag = '--dir';
  static readonly missingDirectory = '终端目录不存在或不是目录';
  static readonly missingExecutable = '找不到可执行文件';
  static readonly unsupported = 'CLI 终端按钮仅支持 Windows';
  static readonly unsafeShim = '该 CLI shim 无法安全转发特殊参数，请配置 opencode.exe';
}

export class AiTerminal {
  private readonly platform: NodeJS.Platform;
  private readonly makeSpawn: typeof spawn;
  private readonly executable: string;

  constructor(deps: TerminalDeps = {}) {
    this.platform = deps.platform || process.platform;
    this.makeSpawn = deps.spawn || spawn;
    this.executable = deps.executable || 'opencode';
  }

  async open(directory: string, endpoint: string, sessionId: string, env: NodeJS.ProcessEnv = process.env): Promise<{ opened: boolean }> {
    if (this.platform !== 'win32') throw new Error(TerminalText.unsupported);
    await AiTerminal.checkDirectory(directory);
    const executable = await AiTerminal.findExecutable(this.executable, directory, env);
    if (AiTerminal.isUnsafeShim(executable) && AiTerminal.hasShellMeta(endpoint, sessionId, directory)) throw new Error(TerminalText.unsafeShim);
    const encoded = Buffer.from(AiTerminal.script(), 'utf16le').toString('base64');
    const childEnv = {
      ...env,
      [TerminalEnv.executable]: executable,
      [TerminalEnv.endpoint]: endpoint,
      [TerminalEnv.session]: sessionId,
      [TerminalEnv.directory]: directory,
    };
    let child: ChildProcess;
    try {
      child = this.makeSpawn(TerminalText.cmd, ['/d', '/k', TerminalText.powershell, '-NoProfile', '-EncodedCommand', encoded], {
      cwd: directory,
      env: childEnv,
      windowsHide: false,
      detached: true,
      stdio: 'ignore',
      shell: false,
      });
    } catch (error) {
      throw AiTerminal.spawnError(error);
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(AiTerminal.spawnError(error));
      child.once('error', onError);
      child.once('spawn', () => { child.removeListener('error', onError); resolve(); });
    });
    child.unref();
    return { opened: true };
  }

  private static async checkDirectory(directory: string): Promise<void> {
    if (!path.win32.isAbsolute(directory)) throw new Error('终端目录必须是绝对路径');
    try {
      if (!(await stat(directory)).isDirectory()) throw new Error(TerminalText.missingDirectory);
    } catch (error) {
      if (error instanceof Error && error.message === TerminalText.missingDirectory) throw error;
      throw new Error(`${TerminalText.missingDirectory}: ${directory}`);
    }
  }

  private static async findExecutable(executable: string, directory: string, env: NodeJS.ProcessEnv): Promise<string> {
    const hasPath = path.win32.isAbsolute(executable) || executable.includes('\\') || executable.includes('/');
    const candidates: string[] = [];
    if (hasPath) candidates.push(path.win32.isAbsolute(executable) ? executable : path.win32.resolve(directory, executable));
    else {
      const searchPath = env.Path || env.PATH || '';
      const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';');
      for (const folder of searchPath.split(path.delimiter).filter(Boolean)) {
        candidates.push(path.win32.join(folder, executable));
        if (!path.win32.extname(executable)) for (const extension of extensions) candidates.push(path.win32.join(folder, `${executable}${extension}`));
      }
    }
    for (const candidate of candidates) {
      try {
        await access(candidate, fsConstants.F_OK);
        if ((await stat(candidate)).isFile()) return await AiTerminal.resolveShim(candidate);
      } catch { /* continue searching PATH */ }
    }
    throw new Error(`${TerminalText.missingExecutable}: ${executable}`);
  }

  private static async resolveShim(candidate: string): Promise<string> {
    if (!/\.(cmd|bat)$/i.test(candidate)) return candidate;
    try {
      const source = await readFile(candidate, 'utf8');
      const match = source.match(/[%]dp0[%]\\node_modules\\opencode-ai\\bin\\opencode\.exe/i);
      if (!match) return candidate;
      const target = path.win32.resolve(path.win32.dirname(candidate), 'node_modules\\opencode-ai\\bin\\opencode.exe');
      if ((await stat(target)).isFile()) return target;
    } catch { /* retain the shim; normal validation/error handling follows */ }
    return candidate;
  }

  private static isUnsafeShim(resolved: string): boolean { return /\.(cmd|bat)$/i.test(resolved); }

  private static hasShellMeta(...values: string[]): boolean { return values.some((value) => /[&%|<>^!"\r\n]/.test(value)); }

  private static script(): string {
    return [
      '$ErrorActionPreference = "Stop"',
      `$exe = $env:${TerminalEnv.executable}`,
      `$endpoint = $env:${TerminalEnv.endpoint}`,
      `$session = $env:${TerminalEnv.session}`,
      `$directory = $env:${TerminalEnv.directory}`,
      `Set-Location -LiteralPath $directory`,
      `& $exe '${TerminalText.attach}' $endpoint '${TerminalText.sessionFlag}' $session '${TerminalText.directoryFlag}' $directory`,
      'exit $LASTEXITCODE',
    ].join('\n');
  }

  private static spawnError(error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(`无法打开 CLI 终端: ${detail}`);
  }
}
