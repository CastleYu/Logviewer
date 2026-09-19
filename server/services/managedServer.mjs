import { spawn } from 'node:child_process';

let input = '';
let child;
let stopping = false;
const signal = (name) => { if (child?.pid) { try { process.kill(-child.pid, name); } catch {} } };
const stop = () => {
  if (stopping) return;
  stopping = true;
  signal('SIGTERM');
  setTimeout(() => { signal('SIGKILL'); process.exit(0); }, 500);
};
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (child || stopping) return;
  input += chunk;
  const end = input.indexOf('\n');
  if (end < 0) return;
  try {
    const { file, args, cwd } = JSON.parse(input.slice(0, end));
    child = spawn(file, args, { cwd, env: process.env, detached: true, shell: false, stdio: 'ignore' });
    child.once('error', () => process.exit(71));
    child.once('exit', (code) => { signal('SIGKILL'); if (!stopping) process.exit(code || 0); });
  } catch { process.exit(71); }
});
process.stdin.once('end', stop);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
