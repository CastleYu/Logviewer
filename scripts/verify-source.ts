import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { SourceService } from '../server/services/sourceService';
import { registerSourceRoutes } from '../server/routes/sourceRoutes';
import { emptyPrograms, parseRegSzPaths, pickIdeExe } from '../server/services/ideDetect';
import { SourceConst, SourceIde, SourceOpener, SourcePreset } from '../src/config/sourceTypes';
import { matchOpener, patternMatches } from '../src/utils/openerMatch';
import { openerLaunchArgs } from '../src/utils/openerLaunch';
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
    for (const ide of [SourceIde.PyCharm, SourceIde.Idea, SourceIde.Clion] as const) { programs[ide] = path.join(root, SourceConst.Exe[ide]); await fs.writeFile(programs[ide], 'fixture: launcher is injected'); }
    const openers: SourceOpener[] = [
      { id: SourceIde.PyCharm, name: 'PyCharm', exe: programs[SourceIde.PyCharm], pattern: '.py' },
      { id: SourceIde.Idea, name: 'IDEA', exe: programs[SourceIde.Idea], pattern: '.java' },
      { id: SourceIde.Clion, name: 'CLion', exe: programs[SourceIde.Clion], pattern: '.c, .cpp' },
    ];
    const config = { roots: [project, path.join(project, 'a')], openers };
    const state = await service.rebuild(config);
    assert.equal(state.count, 7, 'overlapping roots must not duplicate paths');
    assert.equal(service.lookup('abs/path/only.py').length, 1);
    assert.equal(service.lookup('same.py').length, 2);
    assert.equal(service.lookup('missing.py').length, 0);
    assert.equal(service.lookup('readme.txt')[0].openerId, null);
    for (const [file, ide] of [['only.py', SourceIde.PyCharm], ['Main.java', SourceIde.Idea], ['main.c', SourceIde.Clion], ['main.cpp', SourceIde.Clion]] as const) {
      await service.open(file, path.join(project, file), 3);
      assert.deepEqual(calls.at(-1), { exe: programs[ide], args: [SourceConst.LineArg, '3', path.join(project, file)] });
    }
    const codeExe = path.join(root, 'Code.exe');
    await fs.writeFile(codeExe, 'code');
    await service.saveOpeners([...openers, { id: 'code', name: 'VS Code', exe: codeExe, pattern: '.md' }]);
    await service.open('only.py', path.join(project, 'only.py'), 3, 'code');
    assert.deepEqual(calls.at(-1), { exe: codeExe, args: ['-r', '-g', `${path.join(project, 'only.py')}:3`] });
    assert.equal(patternMatches('', 'only.py'), false);
    const vscodePreset = SourcePreset.All.find((item) => item.id === SourceIde.Code);
    assert.equal(vscodePreset?.pattern, '');
    const vscodeStore = path.join(root, 'vscode.json');
    await fs.writeFile(vscodeStore, JSON.stringify({ roots: [], programs: {} }));
    const vscodeSvc = new SourceService(vscodeStore, async () => undefined, async () => [{ id: SourceIde.Code, name: 'VS Code', exe: codeExe, pattern: '' }]);
    await vscodeSvc.init();
    const seeded = vscodeSvc.state().openers.find((item) => item.id === SourceIde.Code);
    assert.equal(seeded?.exe, codeExe);
    assert.equal(seeded?.pattern, '');
    assert.equal(matchOpener('only.py', vscodeSvc.state().openers), null);
    assert.equal(patternMatches('.py, .java', 'a.py'), true);
    assert.equal(patternMatches('Controller$', 'UserController'), true);
    assert.equal(matchOpener('main.cpp', openers)?.id, SourceIde.Clion);
    assert.deepEqual(openerLaunchArgs(programs[SourceIde.PyCharm], 'a.py', 9), [SourceConst.LineArg, '9', 'a.py']);
    for (const line of [0, -1, 1.5, '3', Infinity, 2147483648]) await assert.rejects(service.open('only.py', path.join(project, 'only.py'), line));
    await assert.rejects(service.open('only.py', programs.pycharm, 3));
    await assert.rejects(service.open('readme.txt', path.join(project, 'readme.txt'), 3));
    await assert.rejects(service.rebuild({ roots: [path.join(root, 'missing')], openers }));
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
    await service.rebuild({ roots: [], openers });
    assert.equal(service.lookup('same.py').length, 0);
    await fs.writeFile(path.join(root, 'config.json'), JSON.stringify({ roots: [path.join(root, 'gone')], programs }));
    const missing = new SourceService(path.join(root, 'config.json'));
    await missing.init(); assert.ok(missing.state().error); assert.equal(missing.state().count, 0);

    const extra = path.join(root, 'extra');
    await fs.mkdir(extra);
    await fs.writeFile(path.join(extra, 'extra.py'), 'one\n');
    const added = await service.addRoot(extra);
    assert.equal(service.lookup('extra.py').length, 1);
    assert.equal(added.rootsInfo.some((item) => item.path === extra), true);
    await fs.writeFile(path.join(extra, 'later.py'), 'two\n');
    await service.rebuildRoot(extra);
    assert.equal(service.lookup('later.py').length, 1);
    await service.removeRoot(extra);
    assert.equal(service.lookup('extra.py').length, 0);

    const detectedExe = path.join(root, SourceConst.Exe[SourceIde.PyCharm]);
    const detectStore = path.join(root, 'detect.json');
    await fs.writeFile(detectStore, JSON.stringify({ roots: [project], programs: emptyPrograms() }));
    const detected = new SourceService(detectStore, async () => undefined, async () => [{ id: SourceIde.PyCharm, name: 'PyCharm', exe: detectedExe, pattern: '.py' }]);
    await detected.init();
    assert.equal(detected.state().openers.find((item) => item.id === SourceIde.PyCharm)?.exe, detectedExe);
    assert.equal(detected.lookup('same.py').length, 2);
    const keepStore = path.join(root, 'keep.json');
    await fs.writeFile(keepStore, JSON.stringify({ roots: [], openers }));
    const kept = new SourceService(keepStore, async () => undefined, async () => [{ id: SourceIde.PyCharm, name: 'PyCharm', exe: path.join(root, 'other', SourceConst.Exe[SourceIde.PyCharm]), pattern: '.py' }]);
    await kept.init();
    assert.equal(kept.state().openers.find((item) => item.id === SourceIde.PyCharm)?.exe, programs.pycharm);

    const parsed = parseRegSzPaths('    (Default)    REG_SZ    D:\\Code\\ide\\JetBrains\\PyCharm\\PyCharm 2025.3.3\nInstallLocation    REG_SZ    D:\\Code\\ide\\JetBrains\\IDEA\n');
    assert.ok(parsed.some((item) => item.includes('PyCharm')));
    const newer = pickIdeExe(SourceIde.PyCharm, ['D:/old/PyCharm 2023.3.3', 'D:/new/PyCharm 2025.3.3'], (file) => file.includes('2025') && /bin[/\\]pycharm64\.exe$/i.test(file));
    assert.match(newer, /2025/);

    const createdRoot = await fetch(base + SourceConst.Root, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: extra }) });
    assert.equal(createdRoot.status, 201);
    const rebuiltOne = await fetch(base + SourceConst.RootRebuild, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: extra }) });
    assert.equal(rebuiltOne.status, 200);
    const savedOpeners = await fetch(base + SourceConst.Openers, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ openers: [...openers, { id: 'rx', name: 'Regex', exe: programs[SourceIde.PyCharm], pattern: '^later' }] }) });
    assert.equal(savedOpeners.status, 200);

    console.log('PASS: indexing, duplicate/unique/missing lookup, opener pattern/launch, invalid input, stale files, rollback, restart, HTTP origin/host/header boundary, configurable fields, short paths, per-root add/rebuild/remove, registry auto-fill, free-form openers');
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
}

await verify();
