import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { HistoryConst, HistoryKind, type HistoryLog } from '../src/config/historyTypes';
import { HistoryStore } from '../server/services/historyStore';
import { registerHistoryRoutes } from '../server/routes/historyRoutes';
import { localAccess } from '../server/routes/localAccess';

async function json(base: string, route: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${route}`, init);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function run(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-history-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())), 'test root must be inside the OS temp directory');
  const store = new HistoryStore(path.join(root, 'history'));
  const app = express();
  app.use(express.json());
  app.use(localAccess);
  registerHistoryRoutes(app, store);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const localFile = path.join(root, 'same.log');
    await fs.writeFile(localFile, 'local snapshot\n', 'utf8');
    const local = await store.local(localFile, 'plain');
    await fs.writeFile(localFile, 'changed original\n', 'utf8');
    const remoteA = await store.save({ name: 'same.log', origin: 'ssh://host-a/var/log/same.log', kind: HistoryKind.Remote, formatId: 'plain' }, 'remote A\n');
    const remoteB = await store.save({ name: 'same.log', origin: 'ssh://host-b/var/log/same.log', kind: HistoryKind.Remote, formatId: 'plain' }, 'remote B\n');
    assert.notEqual(remoteA.id, remoteB.id);
    assert.equal(await store.content(local.id), 'local snapshot\n');
    await store.update(remoteA.id, { repository: path.join(root, 'repo') });
    const before = await store.list();
    const beforeView = before.map(({ id, created, name, origin, size, formatId, kind, repository }) => ({ id, created, name, origin, size, formatId, kind, repository }));
    const reloaded = new HistoryStore(path.join(root, 'history'));
    const after = await reloaded.list();
    assert.deepEqual(after.map(({ id, created, name, origin, size, formatId, kind, repository }) => ({ id, created, name, origin, size, formatId, kind, repository })), beforeView);
    assert.equal((await reloaded.get(remoteA.id)).repository, path.join(root, 'repo'));

    const large = 'x'.repeat(40_000);
    const uploaded = await json(base, `${HistoryConst.Api}?name=large.log&origin=upload&kind=local&formatId=plain`, { method: 'POST', headers: { 'Content-Type': 'text/plain', [HistoryConst.Header]: HistoryConst.HeaderValue }, body: large });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal((await reloaded.content(uploaded.body.id)).length, large.length);

    const listed = await json(base, HistoryConst.Api);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.some((item: HistoryLog) => item.id === local.id));
    const content = await fetch(`${base}${HistoryConst.Api}/${local.id}/content`);
    assert.equal(content.status, 200);
    assert.equal(await content.text(), 'local snapshot\n');
    const localOpened = await json(base, HistoryConst.Api + HistoryConst.Local, { method: 'POST', headers: { 'content-type': 'application/json', [HistoryConst.Header]: HistoryConst.HeaderValue }, body: JSON.stringify({ path: localFile, formatId: 'plain' }) });
    assert.equal(localOpened.status, 201);

    for (const route of [`${HistoryConst.Api}/bad-id`, `${HistoryConst.Api}/../bad`, `${HistoryConst.Api}/not-a-uuid/content`]) {
      const failed = await json(base, route);
      assert.ok(failed.status >= 400, route);
    }
    const denied = await json(base, HistoryConst.Api, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'denied' });
    assert.equal(denied.status, 403);
    console.log('PASS: history persistence, origin disambiguation, reload/order/content stability, repository mapping, large upload, local open, sendFile content, invalid IDs, path handling, and access gate');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
