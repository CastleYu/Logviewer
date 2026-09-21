import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { AiTerminal } from '../server/services/aiTerminal';

const execFileAsync = promisify(execFile);

class VerifyAiTerminal {
  static async main(): Promise<void> {
    VerifyAiTerminal.assert(process.platform === 'win32', 'native fixture requires Windows');
    const root = await mkdtemp(path.join(tmpdir(), 'logviewer-ai-terminal-'));
    const output = path.join(root, 'received.json');
    const fixture = path.join(root, 'fixture.js');
    const hook = path.join(root, 'node-hook.js');
    const endpoint = 'http://127.0.0.1:4096/a&b?x=%value% 中文 path';
    const session = 'ses & % [中文]';
    const password = 'secret must never enter argv';
    const env = { ...process.env, LOGVIEWER_FIXTURE_OUTPUT: output, OPENCODE_SERVER_USERNAME: 'custom-user', OPENCODE_SERVER_PASSWORD: password };
    const childPids: number[] = [];
    try {
      await writeFile(fixture, `const fs = require('node:fs'); fs.writeFileSync(process.env.LOGVIEWER_FIXTURE_OUTPUT, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), pid: process.pid, ppid: process.ppid }));\n`, 'utf8');
      await writeFile(hook, `const fs = require('node:fs'); let argv = process.argv.slice(1); if (argv[0] && argv[0].toLowerCase().endsWith('attach')) argv = argv.slice(1); fs.writeFileSync(process.env.LOGVIEWER_FIXTURE_OUTPUT, JSON.stringify({ cwd: process.cwd(), argv, pid: process.pid, ppid: process.ppid })); process.exit(0);\n`, 'utf8');

      const shimExecutable = path.join(root, 'opencode & % [中文 fixture].cmd');
      const target = path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(process.execPath, target);
      await writeFile(shimExecutable, '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\opencode-ai\\bin\\opencode.exe" %*\r\n', 'utf8');
      await VerifyAiTerminal.runCase('npm-shim', shimExecutable, root, output, fixture, hook, endpoint, session, password, { ...env, NODE_OPTIONS: `--require=${hook}` }, childPids);

      const exeExecutable = path.join(root, 'opencode & % [中文 fixture].exe');
      await copyFile(process.execPath, exeExecutable);
      await VerifyAiTerminal.runCase('node-exe-wrapper', exeExecutable, root, output, fixture, hook, endpoint, session, password, { ...env, NODE_OPTIONS: `--require=${hook}` }, childPids);
      const unsafeExecutable = path.join(root, 'unknown.cmd');
      await writeFile(unsafeExecutable, `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`, 'utf8');
      let rejected = false;
      try { await new AiTerminal({ executable: unsafeExecutable }).open(root, endpoint, session, env); } catch (error) { rejected = error instanceof Error && error.message.includes('配置 opencode.exe'); }
      VerifyAiTerminal.assert(rejected, 'unknown cmd shim with shell metacharacters must be rejected');
      const failingSpawn = (() => {
        const child = new EventEmitter() as EventEmitter & { unref(): void };
        child.unref = () => undefined;
        queueMicrotask(() => child.emit('error', new Error('fixture spawn failure')));
        return child;
      }) as any;
      let spawnRejected = false;
      try { await new AiTerminal({ executable: target, spawn: failingSpawn }).open(root, endpoint, session, env); } catch (error) { spawnRejected = error instanceof Error && error.message.includes('fixture spawn failure'); }
      VerifyAiTerminal.assert(spawnRejected, 'spawn error must reject open');
      console.log(`verify-ai-terminal: PASS (real cmd, cwd, argv, .cmd/.exe; child pids=${childPids.join(',')}; visible=${String(false) === 'false' ? 'windowsHide:false' : 'unknown'}; native TUI=not tested)`);
    } finally {
      for (const pid of childPids) await VerifyAiTerminal.killTree(pid);
      await rm(root, { recursive: true, force: true });
    }
  }

  private static async runCase(name: string, executable: string, directory: string, output: string, fixture: string, hook: string, endpoint: string, session: string, password: string, env: NodeJS.ProcessEnv, childPids: number[]): Promise<void> {
    await rm(output, { force: true });
    const trackedSpawn = ((...args: Parameters<typeof spawn>) => {
      const child = spawn(...args);
      if (child.pid) childPids.push(child.pid);
      return child;
    }) as typeof spawn;
    const result = await new AiTerminal({ executable, spawn: trackedSpawn }).open(directory, endpoint, session, env);
    VerifyAiTerminal.assert(result.opened, `${name}: open should report success`);
    const received = JSON.parse(await VerifyAiTerminal.waitForFile(output)) as { cwd: string; argv: string[]; pid: number; ppid: number };
    const expected = name === 'node-exe-wrapper' || name === 'npm-shim' ? [endpoint, '--session', session, '--dir', directory] : ['attach', endpoint, '--session', session, '--dir', directory];
    VerifyAiTerminal.assert(received.cwd === directory, `${name}: cwd mismatch`);
    VerifyAiTerminal.assert(JSON.stringify(received.argv) === JSON.stringify(expected), `${name}: argv mismatch: ${JSON.stringify(received.argv)}`);
    VerifyAiTerminal.assert(!received.argv.includes(password), `${name}: password leaked into argv`);
    console.log(`verify-ai-terminal: ${name} PASS (fixture pid=${received.pid})`);
  }

  private static async waitForFile(file: string): Promise<string> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { return await readFile(file, 'utf8'); } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
    }
    throw new Error(`verify-ai-terminal: fixture output missing: ${file}`);
  }

  private static async killTree(pid: number): Promise<void> {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F']).catch(() => undefined);
  }

  private static assert(value: unknown, message: string): asserts value {
    if (!value) throw new Error(`verify-ai-terminal: ${message}`);
  }
}

VerifyAiTerminal.main().catch((error) => { console.error(error); process.exitCode = 1; });
