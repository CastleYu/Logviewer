import assert from 'node:assert/strict';
import SftpClient from 'ssh2-sftp-client';
import { SftpConfig } from '../server/config/sftpConfig';
import { listSftpDir } from '../server/services/sftpList';
import { execSftpCommand } from '../server/services/sftpExec';

async function verify(): Promise<void> {
  const profile = SftpConfig.load();
  assert.ok(profile, 'requires configured environment credentials');
  const legacy: number[] = [];
  const reused: number[] = [];
  for (let index = 0; index < 3; index++) {
    const start = performance.now();
    const client = new SftpClient();
    try {
      await client.connect({ host: profile.host, port: profile.port, username: profile.user, password: profile.password, privateKey: profile.privateKey });
      await client.exists('/etc');
      await client.list('/etc');
    } finally { await client.end(); }
    legacy.push(Math.round(performance.now() - start));
  }
  for (let index = 0; index < 3; index++) {
    const start = performance.now();
    const listed = await listSftpDir({ ...profile, root: '/var/log', roots: ['/var/log'] }, '/etc');
    assert.ok(listed.entries.length);
    reused.push(Math.round(performance.now() - start));
  }
  const result = await execSftpCommand(profile, '/etc', 'cd /tmp; printf "acceptance" | tr a-z A-Z');
  assert.equal(result.cwd, '/tmp');
  assert.ok(result.text.includes('ACCEPTANCE'));
  const failed = await execSftpCommand(profile, '/etc', 'false');
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 1);
  const client = new SftpClient();
  try {
    await client.connect({ host: profile.host, port: profile.port, username: profile.user, password: profile.password, privateKey: profile.privateKey });
    const content = await client.get('/etc/hostname');
    assert.ok(Buffer.isBuffer(content) && content.length > 0);
  } finally { await client.end(); }
  console.log(JSON.stringify({ legacyMs: legacy, reusedMs: reused, cwd: true, pipeline: true, exitCode: true, read: true }));
}

verify().catch((error) => { console.error(error instanceof Error ? error.message : 'live verification failed'); process.exitCode = 1; });
