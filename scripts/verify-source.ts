import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { SourceService } from '../server/services/sourceService';
import { registerSourceRoutes } from '../server/routes/sourceRoutes';
import { SourceConst, SourceIde } from '../src/config/sourceTypes';
import { shortPaths, sourceColumns, sourceTarget } from '../src/utils/sourceUtils';
import { FieldRole } from '../src/config/logFormatTypes';
import { localAccess } from '../server/routes/localAccess';
import { HttpConst } from '../server/config/httpConstants';

async function verify(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-source-'));
  const project = path.join(root, '项目 & space');
  const calls: { exe: string; args: string[] }[] = [];
  const service = new SourceService(path.join(root, 'config.json'), async (exe, args) => { calls.push({ exe, args }); });
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await fs.mkdir(path.join(project, 'a'), { recursive: true });
    await fs.mkdir(path.join(project, 'b'));
    for (const file of ['only.py', 'Main.java', 'main.c', 'main.cpp', 'readme.txt', 'a/same.py', 'b/same.py']) await fs.writeFile(path.join(project, file), 'one\ntwo\nthree\n');
    const programs = { [SourceIde.PyCharm]: '', [SourceIde.Idea]: '', [SourceIde.Clion]: '' };
    for (const ide of Object.values(SourceIde)) { programs[ide] = path.join(root, SourceConst.Exe[ide]); await fs.writeFile(programs[ide], 'fixture: launcher is injected'); }
    const config = { roots: [project, path.join(project, 'a')], programs };
    const state = await service.rebuild(config);
    assert.equal(state.count, 7, 'overlapping roots must not duplicate paths');
    assert.equal(service.lookup('abs/path/only.py').length, 1);
    assert.equal(service.lookup('same.py').length, 2);
    assert.equal(service.lookup('missing.py').length, 0);
    assert.equal(service.lookup('readme.txt')[0].ide, null);
    for (const [file, ide] of [['only.py', SourceIde.PyCharm], ['Main.java', SourceIde.Idea], ['main.c', SourceIde.Clion], ['main.cpp', SourceIde.Clion]] as const) {
      await service.open(file, path.join(project, file), 3);
      assert.deepEqual(calls.at(-1), { exe: programs[ide], args: [SourceConst.LineArg, '3', path.join(project, file)] });
    }
    for (const line of [0, -1, 1.5, '3', Infinity, 2147483648]) await assert.rejects(service.open('only.py', path.join(project, 'only.py'), line));
    await assert.rejects(service.open('only.py', programs.pycharm, 3));
    await assert.rejects(service.open('readme.txt', path.join(project, 'readme.txt'), 3));
    await assert.rejects(service.rebuild({ roots: [path.join(root, 'missing')], programs }));
    assert.equal(service.lookup('only.py').length, 1, 'failed rebuild preserves old index');
    const restored = new SourceService(path.join(root, 'config.json'));
    await restored.init(); assert.equal(restored.lookup('same.py').length, 2);
    await fs.unlink(path.join(project, 'only.py'));
    await assert.rejects(service.open('only.py', path.join(project, 'only.py'), 3));
    const app = express(); app.use(HttpConst.Api, localAccess); app.use(express.json()); registerSourceRoutes(app, service);
    app.get('/api/fixture', (_req, res) => res.json({ ok: true }));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}${SourceConst.Api}`;
    const headers = { [SourceConst.Header]: SourceConst.HeaderValue };
    assert.equal((await fetch(base + SourceConst.Config)).status, 403);
    assert.equal((await fetch(base + SourceConst.Config, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const rebound = await new Promise<number>((resolve, reject) => {
      http.get(base + SourceConst.Config, { headers: { ...headers, Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode!); }).on('error', reject);
    });
    assert.equal(rebound, 403);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/fixture`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base + SourceConst.Config, { headers: { ...headers, 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(base + SourceConst.Config, { headers })).status, 200);
    const opened = await fetch(base + SourceConst.Open, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ file: 'Main.java', path: path.join(project, 'Main.java'), line: 2 }) });
    assert.equal(opened.status, 200);
    assert.equal(calls.at(-1)?.args[1], '2');
    const format = { id: 'test', fields: [{ id: 'source', role: FieldRole.SourceFile }, { id: 'ln', role: FieldRole.SourceLine }] } as any;
    assert.deepEqual(sourceColumns(format, {}), { file: 'source', line: 'ln' });
    assert.deepEqual(sourceTarget({ fields: { source: 'main.py', ln: '3' } } as any, sourceColumns(format, {})), { file: 'main.py', line: 3 });
    assert.deepEqual(shortPaths(['H:/repo/a/same.py', 'H:/repo/b/same.py']), ['…/a/same.py', '…/b/same.py']);
    assert.ok(Number.isNaN(sourceTarget({ fields: { source: 'main.py', ln: '0x10' } } as any, sourceColumns(format, {})).line));
    await service.rebuild({ roots: [], programs });
    assert.equal(service.lookup('same.py').length, 0);
    await fs.writeFile(path.join(root, 'config.json'), JSON.stringify({ roots: [path.join(root, 'gone')], programs }));
    const missing = new SourceService(path.join(root, 'config.json'));
    await missing.init(); assert.ok(missing.state().error); assert.equal(missing.state().count, 0);
    console.log('PASS: indexing, duplicate/unique/missing lookup, four extension mappings, launch arguments, invalid input, stale files, rollback, restart, HTTP origin/host/header boundary, configurable fields, short paths');
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
}

await verify();
