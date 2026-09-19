import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ManagedProcess } from '../server/services/managedProcess';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function port(open: boolean, value: number): Promise<void> {
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    const socket = net.createConnection({ host: '127.0.0.1', port: value });
    const connected = await new Promise<boolean>((resolve) => {
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (connected === open) return;
    await wait(50);
  }
  throw new Error(`port ${value} did not become ${open ? 'open' : 'closed'}`);
}
function freePort(): Promise<number> { return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const value = typeof address === 'object' && address ? address.port : 0; server.close(() => resolve(value)); }); }); }
function exited(child: ChildProcess): Promise<number> { if (child.exitCode !== null) return Promise.resolve(child.exitCode ?? 1); return new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); }); }
async function kill(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  // Kill only this PID. Tree-kill would hide a broken Job/parent-death mechanism.
  child.kill('SIGKILL');
  await Promise.race([exited(child).catch(() => 1), wait(3000)]);
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-managed-'));
const spaceDir = path.join(dir, 'fixture path with spaces');
await fs.mkdir(spaceDir);
const serverFile = path.join(spaceDir, 'server.mjs');
const commandFile = path.join(spaceDir, 'managed fixture.cmd');
const ownerFile = path.join(dir, 'owner.ts');
const managedFile = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/services/managedProcess.ts')).href;
let supervisor: ChildProcess | undefined;
let owner: ChildProcess | undefined;
try {
  await fs.writeFile(serverFile, "import net from 'node:net'; const s=net.createServer(); s.listen(Number(process.argv[2]), '127.0.0.1');", 'utf8');
  await fs.writeFile(commandFile, `@echo off\r\nnode "${serverFile}" %*\r\n`, 'utf8');
  const env = { ...process.env, PATH: `${spaceDir}${path.delimiter}${process.env.PATH || ''}` };
  const firstPort = await freePort();
  supervisor = ManagedProcess.spawn(path.basename(commandFile), [String(firstPort)], { cwd: spaceDir, env, stdio: 'ignore' });
  await port(true, firstPort);
  supervisor.stdin?.end();
  await port(false, firstPort);
  await exited(supervisor);
  supervisor = undefined;

  const secondPort = await freePort();
  supervisor = ManagedProcess.spawn(commandFile, [String(secondPort)], { cwd: spaceDir, env, stdio: 'ignore' });
  await port(true, secondPort);
  await kill(supervisor);
  supervisor = undefined;
  await port(false, secondPort);

  await fs.writeFile(ownerFile, `import { ManagedProcess } from ${JSON.stringify(managedFile)}; ManagedProcess.spawn(${JSON.stringify(commandFile)}, [process.argv[2]], { cwd: ${JSON.stringify(spaceDir)}, env: process.env, stdio: 'ignore' }); setInterval(() => undefined, 1000);`, 'utf8');
  const ownerPort = await freePort();
  const tsx = pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href;
  owner = spawn(process.execPath, ['--import', tsx, ownerFile, String(ownerPort)], { cwd: process.cwd(), env, stdio: 'ignore', windowsHide: true });
  await port(true, ownerPort);
  await kill(owner);
  owner = undefined;
  await port(false, ownerPort);

  const missing = ManagedProcess.spawn(path.join(spaceDir, 'missing command.exe'), [], { cwd: spaceDir, env, stdio: 'ignore' });
  const missingCode = await exited(missing);
  if (missingCode === 0) throw new Error('missing executable supervisor exited successfully');
  console.log(`managed process verification passed (launch failure exit ${missingCode})`);
} finally {
  await kill(supervisor);
  await kill(owner);
  await fs.rm(dir, { recursive: true, force: true });
}
