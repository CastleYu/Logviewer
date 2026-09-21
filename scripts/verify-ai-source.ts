import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { HistoryKind } from '../src/config/historyTypes';
import { AiMode } from '../src/config/aiTypes';
import { AiDiagnosis } from '../src/config/aiDiagnosis';
import { HistoryStore } from '../server/services/historyStore';
import { SourceService } from '../server/services/sourceService';
import { AiService } from '../server/services/aiService';

type FixtureRun = { id: string; messages: unknown[]; status: string };

class VerifyAiSource {
  static async main(): Promise<void> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-ai-source-'));
    const fixture = await VerifyAiSource.startFixture();
    let closeService: (() => Promise<void>) | undefined;
    try {
      const repoA = path.join(root, 'repo-a'); const repoB = path.join(root, 'repo-b'); const plain = path.join(root, 'plain');
      await VerifyAiSource.file(path.join(repoA, '.git'), ''); await VerifyAiSource.file(path.join(repoA, 'src', 'service.ts'), 'a'); await VerifyAiSource.file(path.join(repoA, 'shared.ts'), 'a');
      await VerifyAiSource.file(path.join(repoB, '.git'), 'gitdir: ../repo-a/.git'); await VerifyAiSource.file(path.join(repoB, 'shared.ts'), 'b'); await VerifyAiSource.file(path.join(plain, 'only.log'), 'plain');
      const history = new HistoryStore(path.join(root, 'history')); const log1 = await history.save({ name: 'one.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR one\n'); const log2 = await history.save({ name: 'two.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR two\n'); const multi = await history.save({ name: 'multi.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR multi\n'); const missing = await history.save({ name: 'missing.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR missing\n'); const racing = await history.save({ name: 'racing.log', origin: 'fixture', kind: HistoryKind.Local, formatId: 'plain' }, 'ERROR racing\n');
      const sources = new SourceService(path.join(root, 'source.json')); await sources.rebuild({ roots: [root], openers: [] });
      const service = new AiService(path.join(root, 'ai'), history, { sources }); closeService = () => service.close(); await service.init(); await service.configure({ endpoint: fixture.endpoint, executable: 'fixture-opencode', recipe: true });
      const bound = await service.repository({ logId: log1.id, targets: [{ file: 'repo-a/src/service.ts', line: 11 }] }); assert.equal(bound.repository, repoA); assert.equal(bound.origin, 'index'); const stored = await history.get(log1.id); assert.equal(stored.repository, repoA); assert.deepEqual(stored.sourceAnchor, { file: path.join(repoA, 'src', 'service.ts'), line: 11 });
      const retained = await service.repository({ logId: log1.id, targets: [{ file: 'repo-b/shared.ts', line: 99 }] }); assert.equal(retained.repository, repoA); assert.equal(retained.origin, 'bound');
      const independent = await service.repository({ logId: log2.id, targets: [{ file: 'repo-b/shared.ts', line: 4 }] }); assert.equal(independent.repository, repoB); assert.notEqual((await history.get(log2.id)).repository, repoA);
      const beforeMulti = fixture.created; await assert.rejects(() => service.create({ logId: multi.id, mode: AiMode.Source, targets: [{ file: 'shared.ts', line: 2 }] }), /多个代码仓/); assert.equal(fixture.created, beforeMulti);
      const manually = await service.repository({ logId: multi.id, repository: repoA, targets: [{ file: 'shared.ts', line: 2 }] }); assert.equal(manually.repository, repoA); assert.equal(manually.origin, 'manual'); await assert.rejects(() => service.repository({ logId: multi.id, repository: repoB }), /不能切换/);
      const racingResults = await Promise.allSettled([service.repository({ logId: racing.id, repository: repoA }), service.repository({ logId: racing.id, repository: repoB })]); assert.equal(racingResults.filter((item) => item.status === 'fulfilled').length, 1); assert.equal(racingResults.filter((item) => item.status === 'rejected').length, 1);
      await assert.rejects(() => service.create({ logId: missing.id, mode: AiMode.Source, targets: [{ file: 'no-such.ts', line: 1 }] }), /未能从日志源码索引确定/); assert.equal(fixture.created, beforeMulti);
      const isolated = await service.create({ logId: missing.id, mode: AiMode.Isolated }); assert.equal(isolated.mode, AiMode.Isolated); assert.equal(fixture.created, beforeMulti + 1);
      const sourceSession = await service.create({ logId: log1.id, targets: [{ file: 'service.ts', line: 11 }] }); assert.equal(sourceSession.mode, AiMode.Source); assert.equal(sourceSession.repository, repoA);
      await service.configure({ sourceRoot: repoB }); const sourceRootIgnored = await service.create({ logId: log1.id }); assert.equal(sourceRootIgnored.repository, repoA);
      await service.prompt({ sessionId: sourceSession.id, prompt: 'without recipe', recipe: false }); await VerifyAiSource.until(() => fixture.prompts.length >= 1); const noRecipe = fixture.prompts.at(-1) as { system?: string }; assert.ok(noRecipe.system?.includes(AiDiagnosis.Core)); assert.match(noRecipe.system || '', /logPath|可信运行上下文/); assert.match(noRecipe.system || '', /service\.ts/); assert.doesNotMatch(noRecipe.system || '', new RegExp(AiDiagnosis.Report.slice(0, 20)));
      await VerifyAiSource.until(() => fixture.idle(sourceSession.id)); await service.prompt({ sessionId: sourceSession.id, prompt: 'with default recipe' }); await VerifyAiSource.until(() => fixture.prompts.length >= 2); const withRecipe = fixture.prompts.at(-1) as { system?: string }; assert.ok(withRecipe.system?.includes(AiDiagnosis.Report));
      const reloadedHistory = new HistoryStore(path.join(root, 'history')); const reloaded = new AiService(path.join(root, 'ai-reloaded'), reloadedHistory, { sources }); await reloaded.init(); const restored = await reloaded.repository({ logId: log1.id }); assert.equal(restored.repository, repoA); await reloaded.close(); process.stdout.write('verify-ai-source: ok\n');
    } finally { await closeService?.(); await fixture.close(); await fs.rm(root, { recursive: true, force: true }); }
  }

  private static async startFixture(): Promise<{ endpoint: string; created: number; prompts: { system?: string }[]; idle: (id: string) => boolean; close: () => Promise<void> }> {
    const runs = new Map<string, FixtureRun>(); const prompts: { system?: string }[] = []; let sequence = 0; let created = 0; const app = http.createServer(async (request, response) => {
      const url = new URL(request.url || '/', 'http://fixture'); const directory = url.searchParams.get('directory') || '';
      if (request.method === 'GET' && url.pathname === '/path') return VerifyAiSource.json(response, { directory });
      if (request.method === 'GET' && url.pathname === '/session/status') return VerifyAiSource.json(response, Object.fromEntries([...runs].map(([id, run]) => [id, { type: run.status }])));
      if (request.method === 'GET' && url.pathname.includes('/message')) { const id = url.pathname.split('/')[2]; return VerifyAiSource.json(response, runs.get(id)?.messages || []); }
      if (request.method === 'GET' && ['/permission', '/question'].includes(url.pathname)) return VerifyAiSource.json(response, []);
      if (request.method === 'GET' && url.pathname === '/event') { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('event: connected\ndata: {}\n\n'); return; }
      if (request.method === 'POST' && url.pathname === '/session') { const id = `fixture-${++sequence}`; runs.set(id, { id, messages: [], status: 'idle' }); created += 1; return VerifyAiSource.json(response, { id }); }
      if (request.method === 'POST' && url.pathname.endsWith('/prompt_async')) { const id = url.pathname.split('/')[2]; const body = JSON.parse(await VerifyAiSource.body(request)); const run = runs.get(id)!; prompts.push({ system: body.system }); run.status = 'busy'; setTimeout(() => { run.messages.push({ info: { role: 'assistant', finish: 'stop', time: { completed: Date.now() } }, parts: [{ type: 'text', text: 'fixture complete' }] }); run.status = 'idle'; }, 40); return VerifyAiSource.empty(response); }
      if (request.method === 'POST' && url.pathname.endsWith('/abort')) { const id = url.pathname.split('/')[2]; runs.get(id)!.status = 'idle'; return VerifyAiSource.empty(response); }
      response.writeHead(404); response.end();
    });
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve)); const address = app.address(); assert(address && typeof address !== 'string');
    return { endpoint: `http://127.0.0.1:${address.port}`, get created() { return created; }, prompts, idle: (id) => runs.get(id)?.status === 'idle', close: async () => new Promise<void>((resolve) => app.close(() => resolve())) };
  }

  private static async file(file: string, text: string): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text, 'utf8'); }
  private static async body(request: http.IncomingMessage): Promise<string> { let result = ''; for await (const chunk of request) result += String(chunk); return result; }
  private static json(response: http.ServerResponse, value: unknown): void { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); }
  private static empty(response: http.ServerResponse): void { response.statusCode = 204; response.end(); }
  private static async until(test: () => boolean): Promise<void> { const end = Date.now() + 5000; while (!test() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 30)); assert.equal(test(), true, 'AI source fixture timed out'); }
}

VerifyAiSource.main().catch((error) => { console.error(error); process.exitCode = 1; });
