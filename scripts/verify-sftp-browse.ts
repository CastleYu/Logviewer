import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { RemoteRegistry } from '../server/config/remoteRegistry';
import { registerErrorRoute, registerSftpRoutes } from '../server/routes/sftpRoutes';
import { DownloadService } from '../server/services/downloadService';
import { applyBrowseCommand, applyListingAction, completeBrowseInput, listingAction, resolveCd } from '../src/utils/browseCommands';
import { filterServerProfiles, parseExecOutput, shQuote, wrapRemoteCommand } from '../src/utils/remoteExec';
import {
  createBrowseSession,
  hideBrowseWindow,
  needsRemoteList,
  rememberListing,
  setBrowseProfile,
  shouldFetchBrowseListing,
  showBrowseWindow,
} from '../src/utils/browseSession';

const listing = [
  { name: 'app', type: 'dir' as const },
  { name: 'app.log', type: 'file' as const, size: 12 },
  { name: 'nginx', type: 'dir' as const },
  { name: 'other.log', type: 'file' as const, size: 8 },
];
const roots = ['/var/log', '/opt/app/log'];

async function json(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function verifyCommands(): void {
  const cdName = applyBrowseCommand('cd app', '/var/log', roots, listing);
  assert.equal(cdName.kind, 'enter');
  assert.equal(cdName.path, '/var/log/app');

  const cdUp = applyBrowseCommand('cd ..', '/var/log/app', roots, listing);
  assert.equal(cdUp.kind, 'enter');
  assert.equal(cdUp.path, '/var/log');

  const cdAbs = applyBrowseCommand('cd /opt/app/log', '/var/log', roots, listing);
  assert.equal(cdAbs.kind, 'enter');
  assert.equal(cdAbs.path, '/opt/app/log');

  const cdDenied = applyBrowseCommand('cd /etc', '/var/log', roots, listing);
  assert.equal(cdDenied.kind, 'reject');
  assert.equal(cdDenied.path, '/var/log');

  const resolved = resolveCd('/var/log', '/etc/passwd', roots);
  assert.equal(resolved.ok, false);

  const logJump = applyBrowseCommand('log', '/opt/app/log', roots, listing);
  assert.equal(logJump.kind, 'exec');
  if (logJump.kind === 'exec') assert.equal(logJump.command, 'log');
  const pwd = applyBrowseCommand('pwd', '/var/log', roots, listing);
  assert.equal(pwd.kind, 'exec');
  if (pwd.kind === 'exec') assert.equal(pwd.command, 'pwd');
  const wrapped = wrapRemoteCommand('/var/log', 'echo hi');
  assert.match(wrapped, /bash --login -c/);
  assert.match(wrapped, /\/var\/log/);
  assert.match(wrapped, /echo hi/);
  assert.equal(shQuote("a'b"), `'a'\\''b'`);
  const parsed = parseExecOutput("hello\n__LV_CWD__/tmp/log\n");
  assert.equal(parsed.text, 'hello');
  assert.equal(parsed.cwd, '/tmp/log');
  const names = filterServerProfiles(
    [{ id: 'a', name: 'prod-sftp', protocol: 'sftp' as const }, { id: 'b', name: 'nas', protocol: 'smb' as const }],
    'smb',
  );
  assert.deepEqual(names.map((item) => item.id), ['b']);

  const unique = completeBrowseInput('cd oth', listing);
  assert.equal(unique.input, 'cd other.log');
  assert.deepEqual(unique.candidates, ['other.log']);

  const ambiguous = completeBrowseInput('cd app', listing);
  assert.ok(ambiguous.candidates.includes('app'));
  assert.ok(ambiguous.candidates.includes('app.log'));
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal(ambiguous.input, 'cd app');

  const missing = completeBrowseInput('cd missing', listing);
  assert.equal(missing.input, 'cd missing');
  assert.deepEqual(missing.candidates, []);

  assert.equal(listingAction({ name: 'app', type: 'dir' }), 'enter');
  assert.equal(listingAction({ name: 'app.log', type: 'file' }), 'open');
  const enter = applyListingAction('/var/log', { name: 'nginx', type: 'dir' });
  const open = applyListingAction('/var/log', { name: 'app.log', type: 'file' });
  assert.equal(enter.kind, 'enter');
  assert.equal(enter.path, '/var/log/nginx');
  assert.equal(open.kind, 'open');
  assert.equal(open.path, '/var/log/app.log');
  assert.notEqual(enter.kind, open.kind);

  const implicitFile = applyBrowseCommand('app.log', '/var/log', roots, listing);
  const implicitDir = applyBrowseCommand('app', '/var/log', roots, listing);
  assert.equal(implicitFile.kind, 'open');
  assert.equal(implicitDir.kind, 'enter');
}

function verifySession(): void {
  const idle = createBrowseSession('', '/');
  assert.equal(idle.profileId, '');
  assert.equal(shouldFetchBrowseListing(idle), false, 'always-mounted window with empty profileId must not list');
  assert.equal(needsRemoteList(idle), false);
  const assigned = setBrowseProfile(idle, 'sftp-1', '/var/log');
  assert.equal(assigned.profileId, 'sftp-1');
  assert.equal(shouldFetchBrowseListing(assigned), true, 'list only after setBrowseProfile has a real id');

  let session = createBrowseSession('sftp-1', '/var/log');
  assert.equal(needsRemoteList(session), true);
  session = rememberListing(session, { path: '/var/log', entries: listing });
  assert.equal(session.listCalls, 1);
  assert.equal(needsRemoteList(session), false);
  const hidden = hideBrowseWindow(session);
  assert.equal(hidden.visible, false);
  assert.equal(hidden.path, '/var/log');
  assert.equal(hidden.listCalls, 1);
  assert.equal(needsRemoteList(hidden), false);
  const shown = showBrowseWindow(hidden);
  assert.equal(shown.visible, true);
  assert.equal(shown.path, '/var/log');
  assert.equal(shown.listing?.path, '/var/log');
  assert.equal(shown.listCalls, 1);
  assert.equal(needsRemoteList(shown), false);
}

function verifyWindowSource(): void {
  const windowSrc = readFileSync(path.resolve('src/components/RemoteBrowseWindow.tsx'), 'utf8');
  assert.match(windowSrc, /aria-label="目录命令"/);
  assert.match(windowSrc, /aria-label="远程目录列表"|RemoteFileExplorer/);
  assert.match(windowSrc, /onPointerDown/);
  assert.match(windowSrc, /aria-label="隐藏目录窗口"/);
  assert.match(windowSrc, /aria-label="显示目录窗口"/);
  assert.match(windowSrc, /shouldFetchBrowseListing\(current/);
  assert.doesNotMatch(windowSrc, /profileId:\s*profile\.id/);
  assert.match(windowSrc, /RemoteFileApi\.list\(current\.profileId/);
  assert.match(windowSrc, /RemoteFileApi\.exec/);
  assert.match(windowSrc, /ServerPicker/);
  const pickerSrc = readFileSync(path.resolve('src/components/ServerPicker.tsx'), 'utf8');
  assert.match(pickerSrc, /搜索服务器/);
  assert.match(pickerSrc, /filterServerProfiles/);
  const explorerSrc = readFileSync(path.resolve('src/components/RemoteFileExplorer.tsx'), 'utf8');
  assert.match(explorerSrc, /onDoubleClick/);
  assert.match(explorerSrc, /onContextMenu/);
  assert.match(explorerSrc, /listingAction/);
}

async function verifyRegistryAndHttp(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-sftp-browse-'));
  const file = path.join(root, 'remotes.json');
  try {
    const registry = new RemoteRegistry(file);
    const created = registry.create({
      protocol: 'sftp',
      name: 'prod',
      host: '192.168.3.20',
      port: 22,
      user: 'log',
      password: 'secret',
      paths: ['/var/log', '/opt/app/log'],
    });
    const views = registry.publicViews();
    assert.equal(views.length, 1);
    assert.equal(views[0].id, created.id);
    assert.equal(views[0].ready, true);
    assert.equal(views[0].source, 'registry');
    assert.equal(views[0].protocol, 'sftp');
    assert.deepEqual(views[0].roots, ['/var/log', '/opt/app/log']);
    const profile = registry.toProfile(created.id);
    assert.ok(profile);
    assert.equal(profile.root, '/var/log');
    assert.equal(profile.host, '192.168.3.20');

    registry.update(created.id, {
      protocol: 'sftp',
      name: 'prod-2',
      host: '192.168.3.21',
      port: 22,
      user: 'log',
      password: 'secret',
      paths: ['/var/log'],
    });
    const reloaded = new RemoteRegistry(file);
    const stored = reloaded.get(created.id);
    assert.equal(stored?.name, 'prod-2');
    assert.equal(stored?.host, '192.168.3.21');
    assert.deepEqual(reloaded.publicViews()[0].roots, ['/var/log']);
    assert.equal(reloaded.toProfile(created.id)?.root, '/var/log');

    const app = express();
    app.use(express.json());
    const httpRegistry = new RemoteRegistry(path.join(root, 'http-remotes.json'));
    registerSftpRoutes(app, new DownloadService(null, root, (id) => httpRegistry.toProfile(id)), null, httpRegistry);
    registerErrorRoute(app);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const address = server.address() as { port: number };
      const base = `http://127.0.0.1:${address.port}`;
      const createdHttp = await json(`${base}/api/sftp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: 'sftp',
          name: 'frontend',
          host: '10.0.0.8',
          port: 22,
          user: 'viewer',
          password: 'pw',
          paths: ['/var/log'],
        }),
      });
      assert.equal(createdHttp.status, 201, JSON.stringify(createdHttp.body));
      assert.equal(createdHttp.body.server.name, 'frontend');
      const profiles = await json(`${base}/api/sftp/profiles`);
      assert.equal(profiles.status, 200);
      assert.ok(Array.isArray(profiles.body.profiles));
      const registered = profiles.body.profiles.find((item: { id: string }) => item.id === createdHttp.body.server.id);
      assert.ok(registered, 'browse/open path must see the saved frontend server as a profile');
      assert.equal(registered.ready, true);
      assert.equal(registered.source, 'registry');
      assert.deepEqual(registered.roots, ['/var/log']);

      const updated = await json(`${base}/api/sftp/servers/${createdHttp.body.server.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: 'sftp',
          name: 'frontend-edit',
          host: '10.0.0.9',
          port: 22,
          user: 'viewer',
          password: 'pw',
          paths: ['/var/log', '/home/log'],
        }),
      });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.server.name, 'frontend-edit');
      const after = await json(`${base}/api/sftp/profiles`);
      const seen = after.body.profiles.find((item: { id: string }) => item.id === createdHttp.body.server.id);
      assert.equal(seen.name, 'frontend-edit');
      assert.deepEqual(seen.roots, ['/var/log', '/home/log']);
      const execDenied = await json(`${base}/api/sftp/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: createdHttp.body.server.id, path: '/var/log', command: '' }),
      });
      assert.equal(execDenied.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function verify(): Promise<void> {
  verifyCommands();
  verifySession();
  verifyWindowSource();
  await verifyRegistryAndHttp();
  console.log('PASS: frontend SFTP registry persists as browse profiles; cd/tab/root-jail; remote exec wrap/parse; hide/show keeps path without a new list; file open is distinct from directory enter');
}

await verify();
