import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SourceConfig, SourceConst, SourceIde, SourceMatch, SourceState } from '../../src/config/sourceTypes';

export class SourceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export class SourceService {
  private config: SourceConfig = { roots: [], programs: { [SourceIde.PyCharm]: '', [SourceIde.Idea]: '', [SourceIde.Clion]: '' } };
  private index = new Map<string, string[]>();
  private updated: string | null = null;
  private busy = false;
  private error = '';

  constructor(private store: string, private launch = SourceService.launch) {}

  async init(): Promise<void> {
    try {
      const saved = JSON.parse(await fs.readFile(this.store, 'utf8')) as SourceConfig;
      if (Array.isArray(saved?.roots) && saved.roots.every((r) => typeof r === 'string') &&
          saved.programs && Object.values(SourceIde).every((ide) => typeof saved.programs[ide] === 'string')) this.config = saved;
      await this.rebuild(saved, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = error instanceof SourceError ? error.message : '无法读取源码配置，请重新保存目录和程序路径';
    }
  }

  state(): SourceState {
    return { ...this.config, count: [...this.index.values()].reduce((n, list) => n + list.length, 0), updated: this.updated, busy: this.busy, error: this.error || undefined };
  }

  private key(file: string): string {
    const name = file.replaceAll('\\', '/').split('/').pop() || '';
    return process.platform === 'win32' ? name.toLowerCase() : name;
  }

  private inside(root: string, file: string): boolean {
    const rel = path.relative(root, file);
    return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  }

  private async validate(input: unknown): Promise<SourceConfig> {
    const value = input as SourceConfig;
    if (!value || !Array.isArray(value.roots) || value.roots.length > SourceConst.MaxRoots || !value.programs) throw new SourceError('目录和 IDE 配置无效');
    const roots: string[] = [];
    for (const root of value.roots) {
      if (typeof root !== 'string' || !path.isAbsolute(root)) throw new SourceError('索引目录必须是绝对路径');
      const real = await fs.realpath(root).catch(() => { throw new SourceError(`目录不存在：${root}`); });
      if (!(await fs.stat(real)).isDirectory()) throw new SourceError(`不是目录：${root}`);
      if (!roots.includes(real)) roots.push(real);
    }
    const programs = { ...this.config.programs };
    for (const ide of Object.values(SourceIde)) {
      const exe = value.programs[ide];
      if (typeof exe !== 'string') throw new SourceError('IDE 路径必须是字符串');
      if (exe) {
        if (!path.isAbsolute(exe) || path.basename(exe).toLowerCase() !== SourceConst.Exe[ide]) throw new SourceError(`${SourceConst.Names[ide]} 必须选择 ${SourceConst.Exe[ide]}`);
        if (!(await fs.stat(exe).catch(() => null))?.isFile()) throw new SourceError(`${SourceConst.Names[ide]} 程序不存在`);
      }
      programs[ide] = exe;
    }
    return { roots, programs };
  }

  async rebuild(input: unknown = this.config, persist = true): Promise<SourceState> {
    if (this.busy) throw new SourceError('索引正在构建，请稍后重试', 409);
    this.busy = true;
    try {
      const config = await this.validate(input);
      const index = new Map<string, string[]>();
      const seen = new Set<string>();
      const pending = [...config.roots];
      let count = 0;
      while (pending.length) {
        const dir = pending.pop()!;
        if (seen.has(dir)) continue;
        seen.add(dir);
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => { throw new SourceError(`无法读取目录，旧索引已保留：${dir}`); });
        for (const entry of entries) {
          const file = path.join(dir, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) pending.push(file);
          else if (entry.isFile()) {
            if (++count > SourceConst.MaxFiles) throw new SourceError('文件数量超过 100 万，请缩小索引目录');
            const key = this.key(entry.name);
            const list = index.get(key) || [];
            list.push(file);
            index.set(key, list);
          }
        }
      }
      for (const list of index.values()) list.sort();
      if (persist) {
        const temp = `${this.store}.tmp`;
        await fs.writeFile(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
        await fs.rename(temp, this.store);
      }
      this.config = config;
      this.index = index;
      this.updated = new Date().toISOString();
      this.error = '';
    } finally { this.busy = false; }
    return this.state();
  }

  lookup(file: string): SourceMatch[] {
    return (this.index.get(this.key(file)) || []).map((file) => {
      const ide = SourceConst.Extensions[path.extname(file).toLowerCase()] || null;
      return { path: file, ide, ready: !!ide && !!this.config.programs[ide] };
    });
  }

  async open(file: unknown, target: unknown, line: unknown): Promise<{ message: string }> {
    if (typeof file !== 'string' || typeof target !== 'string' || !Number.isSafeInteger(line) || Number(line) < 1 || Number(line) > 2147483647) throw new SourceError('文件或源码行号无效');
    const match = this.lookup(file).find((item) => item.path === target);
    if (!match) throw new SourceError('文件不在索引中，请重建索引', 404);
    if (!match.ide) throw new SourceError('仅支持 .py、.java、.c、.cpp 文件');
    if (!match.ready) throw new SourceError(`请先配置 ${SourceConst.Names[match.ide]} 程序路径`);
    const real = await fs.realpath(target).catch(() => { throw new SourceError('文件已移动或删除，请重建索引', 404); });
    if (!this.config.roots.some((root) => this.inside(root, real)) || real !== target || !(await fs.stat(real)).isFile()) throw new SourceError('文件路径已变化，请重建索引', 409);
    await this.launch(this.config.programs[match.ide], [SourceConst.LineArg, String(line), real]);
    return { message: `已发送至 ${SourceConst.Names[match.ide]}：${path.basename(real)}:${line}` };
  }

  static launch(exe: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(exe, args, { shell: false, windowsHide: true, stdio: 'ignore' });
      child.once('error', () => reject(new SourceError('IDE 启动失败，请检查程序路径', 503)));
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
}
