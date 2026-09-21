import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SourceService } from '../server/services/sourceService';

class VerifySourceRepository {
  static async main(): Promise<void> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'logviewer-source-repository-'));
    try {
      const repoA = path.join(root, 'repo-a'); const repoB = path.join(root, 'repo-b'); const plain = path.join(root, 'plain');
      await VerifySourceRepository.file(path.join(repoA, '.git'), ''); await VerifySourceRepository.file(path.join(repoA, 'src', 'main.ts'), 'a'); await VerifySourceRepository.file(path.join(repoA, 'src', 'prefix-main.ts'), 'a'); await VerifySourceRepository.file(path.join(repoA, 'shared.ts'), 'a');
      await VerifySourceRepository.file(path.join(repoB, '.git'), 'gitdir: ../repo-a/.git'); await VerifySourceRepository.file(path.join(repoB, 'src', 'same.ts'), 'b'); await VerifySourceRepository.file(path.join(repoB, 'shared.ts'), 'b');
      await VerifySourceRepository.file(path.join(plain, 'src', 'only.ts'), 'plain');
      const service = new SourceService(path.join(root, 'config.json')); await service.rebuild({ roots: [root, plain], openers: [] });
      const a = await service.repository(path.join(repoA, 'src')); assert.equal(a, repoA);
      const b = await service.repository(repoB); assert.equal(b, repoB);
      assert.equal(await service.repository(plain), plain); assert.equal(await fs.stat(path.join(plain, '.git')).catch(() => null), null);
      const suffix = await service.repositories([{ file: 'repo-b/src/same.ts', line: 12 }]); assert.equal(suffix.length, 1); assert.equal(suffix[0].repository, repoB); assert.equal(suffix[0].file, path.join(repoB, 'src', 'same.ts')); assert.equal(suffix[0].line, 12);
      const shared = await service.repositories([{ file: 'shared.ts', line: 4 }]); assert.deepEqual(shared.map((item) => item.repository).sort(), [repoA, repoB].sort());
      const prefix = await service.repositories([{ file: 'main.ts', line: 2 }]); assert.equal(prefix.length, 1); assert.equal(prefix[0].file, path.join(repoA, 'src', 'main.ts')); assert.notEqual(prefix[0].file, path.join(repoA, 'src', 'prefix-main.ts'));
      await fs.rm(path.join(repoA, 'src', 'main.ts')); const staleThenValid = await service.repositories([{ file: 'main.ts', line: 2 }, { file: 'only.ts', line: 8 }]); assert.equal(staleThenValid.length, 1); assert.equal(staleThenValid[0].repository, plain); assert.equal(staleThenValid[0].file, path.join(plain, 'src', 'only.ts'));
      const unknownLine = await service.repositories([{ file: 'only.ts', line: 0 }]); assert.equal(unknownLine.length, 1); assert.equal(unknownLine[0].repository, plain); assert.equal(unknownLine[0].line, 0);
      const noMatch = await service.repositories([{ file: '', line: 1 }, { file: '-file.ts', line: 1 }, { file: 'missing.ts', line: 1 }]); assert.deepEqual(noMatch, []);
      process.stdout.write('verify-source-repository: ok\n');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  }

  private static async file(file: string, content: string): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content, 'utf8'); }
}

VerifySourceRepository.main().catch((error) => { console.error(error); process.exitCode = 1; });
