import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HistoryConst, HistoryKind, type HistoryLog } from '../../src/config/historyTypes';

export class HistoryStore {
  constructor(readonly root: string) {}

  private dir(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效的历史记录');
    return path.join(this.root, id);
  }

  async list(): Promise<HistoryLog[]> {
    await fs.mkdir(this.root, { recursive: true });
    const dirs = await fs.readdir(this.root, { withFileTypes: true });
    const logs = await Promise.all(dirs.filter((entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)).map(async (entry) => {
      try { return await this.get(entry.name); } catch { return null; }
    }));
    return logs.filter((item): item is HistoryLog => item !== null).sort((a, b) => b.created.localeCompare(a.created));
  }

  async get(id: string): Promise<HistoryLog> {
    return JSON.parse(await fs.readFile(path.join(this.dir(id), HistoryConst.Metadata), 'utf8'));
  }

  contentPath(id: string): string { return path.join(this.dir(id), HistoryConst.Content); }

  async content(id: string): Promise<string> { return fs.readFile(this.contentPath(id), 'utf8'); }

  async save(input: Pick<HistoryLog, 'name' | 'origin' | 'kind' | 'formatId'>, content: string): Promise<HistoryLog> {
    const log: HistoryLog = { ...input, id: crypto.randomUUID(), created: new Date().toISOString(), size: Buffer.byteLength(content) };
    const dir = this.dir(log.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.contentPath(log.id), content, 'utf8');
    await this.write(log);
    return log;
  }

  async local(file: string, formatId: string): Promise<HistoryLog> {
    if (!path.isAbsolute(file)) throw new Error('请输入本地文件绝对路径');
    const content = await fs.readFile(file, 'utf8');
    return this.save({ name: path.basename(file), origin: file, kind: HistoryKind.Local, formatId }, content);
  }

  async update(id: string, patch: Pick<HistoryLog, 'repository'>): Promise<HistoryLog> {
    const log = { ...await this.get(id), repository: patch.repository };
    await this.write(log);
    return log;
  }

  private async write(log: HistoryLog): Promise<void> {
    const file = path.join(this.dir(log.id), HistoryConst.Metadata);
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(log), 'utf8');
    await fs.rename(temp, file);
  }
}
