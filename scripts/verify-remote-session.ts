import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ssh2 from 'ssh2';
import { execSftpCommand } from '../server/services/sftpExec';
import { closeRemoteSessions } from '../server/services/remoteSession';
import type { SftpProfile } from '../server/models/sftpModels';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'pkcs1', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
const server = new ssh2.Server({ hostKeys: [privateKey] });
let connections = 0;
let channels = 0;

server.on('connection', (client) => {
  connections += 1;
  client.on('error', () => undefined);
  client.on('authentication', (ctx) => ctx.accept());
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept();
      session.on('exec', (accept, _reject, info) => {
        channels += 1;
        const channel = accept();
        if (info.command.includes('sleep')) return;
        setImmediate(() => { channel.write('ok\n__LV_CWD__/tmp\n'); channel.exit(0); channel.end(); });
      });
    });
  });
});

const profile = (port: number, fingerprint?: string): SftpProfile => ({ id: 'test', name: 'test', host: '127.0.0.1', port, user: 'tester', password: 'pw', root: '/', maxBytes: 0, fingerprint });

async function run(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const p = profile(port);
  const [first, second] = await Promise.all([execSftpCommand(p, '/', 'printf first'), execSftpCommand(p, '/', 'printf second')]);
  assert.equal(first.cwd, '/tmp');
  assert.equal(second.code, 0);
  assert.equal(connections, 1, 'concurrent exec calls reuse one SSH connection');
  assert.equal(channels, 2, 'concurrent exec calls use separate channels');
  const controller = new AbortController();
  const pending = execSftpCommand(p, '/', 'sleep 1000', controller.signal);
  controller.abort();
  await assert.rejects(pending, /已取消/);
  await closeRemoteSessions();
  await execSftpCommand(p, '/', 'printf reconnect');
  assert.equal(connections, 2, 'closed pool reconnects');
  await assert.rejects(execSftpCommand(profile(port, 'SHA256:not-the-server'), '/', 'printf rejected'));
  await closeRemoteSessions();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log('PASS: in-process SSH verifies pooled concurrent exec, abort, reconnect, fingerprint isolation, and clean shutdown');
}

run().catch(async (error) => { await closeRemoteSessions(); server.close(); throw error; });
