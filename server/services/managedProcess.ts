import { fileURLToPath } from 'node:url';
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import path from 'node:path';

export type { SpawnOptions };

const PowerShell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

export class ManagedProcess {
  static spawn(file: string, args: string[] = [], options: SpawnOptions = {}): ChildProcess {
    if (process.platform !== 'win32') {
      const child = nodeSpawn(process.execPath, [fileURLToPath(new URL('./managedServer.mjs', import.meta.url))], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'ignore', 'ignore'] });
      child.stdin?.on('error', () => undefined);
      child.stdin?.write(`${JSON.stringify({ file, args, cwd: options.cwd || process.cwd() })}\n`);
      return child;
    }

    const script = fileURLToPath(new URL('./managedServer.ps1', import.meta.url));
    const parent = String(process.pid);
    const child = nodeSpawn(PowerShell, [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-ParentPid', parent,
    ], {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['pipe', options.stdio && Array.isArray(options.stdio) ? options.stdio[1] : 'ignore', options.stdio && Array.isArray(options.stdio) ? options.stdio[2] : 'ignore'],
    });
    const spec = JSON.stringify({ file, args, cwd: options.cwd || process.cwd() });
    // Keep the pipe open: the supervisor uses its EOF as the abrupt-parent signal.
    child.stdin?.write(`${spec}\n`);
    child.stdin?.on('error', () => undefined);
    return child;
  }
}

export default ManagedProcess;
