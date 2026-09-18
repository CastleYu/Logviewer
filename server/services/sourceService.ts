import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SourceConfig, SourceConst, SourceMatch, SourceOpener, SourcePreset, SourceRootInfo, SourceState } from '../../src/config/sourceTypes';
import { detectPresetOpeners } from './ideDetect';
import { openerLaunchArgs } from '../../src/utils/openerLaunch';
import { matchOpener } from '../../src/utils/openerMatch';

export class SourceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export class SourceService {
  private config: SourceConfig = { roots: [], openers: [] };
  private detected: SourceOpener[] = [];
  private index = new Map<string, string[]>();
  private updated: string | null = null;
  private busy = false;
  private error = '';
  private allowPresetInsert = true;

  constructor(
    private store: string,
    private launch = SourceService.launch,
    private detectOpeners = detectPresetOpeners,
  ) {}

  async init(): Promise<void> {
    try {
      const saved = JSON.parse(await fs.readFile(this.store, 'utf8')) as Record<string, unknown>;
      this.config = this.migrate(saved);
      this.allowPresetInsert = !Array.isArray(saved.openers);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = error instanceof SourceError ? error.message : '无法读取源码配置，请重新保存目录和程序路径';
    }
    await this.applyDetectedOpeners();
    if (this.config.roots.length) {
      try { await this.rebuild(this.config, false); }
      catch (error) { this.error = error instanceof SourceError ? error.message : '无法读取源码配置，请重新保存目录和程序路径'; }
    }
  }

  state(): SourceState {
    return {
      ...this.config,
      count: this.fileCount(),
      updated: this.updated,
      busy: this.busy,
      error: this.error || undefined,
      rootsInfo: this.rootsInfo(),
      detected: this.detected.map((item) => ({ ...item })),
    };
  }

  private key(file: string): string {
    const name = file.replaceAll('\\', '/').split('/').pop() || '';
    return process.platform === 'win32' ? name.toLowerCase() : name;
  }

  private inside(root: string, file: string): boolean {
    const rel = path.relative(root, file);
    return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  }

  private migrate(saved: Record<string, unknown>): SourceConfig {
    const roots = Array.isArray(saved.roots) ? saved.roots.filter((item): item is string => typeof item === 'string') : [];
    if (Array.isArray(saved.openers)) {
      return { roots, openers: saved.openers.map((item) => this.asOpener(item)).filter((item): item is SourceOpener => !!item) };
    }
    const programs = saved.programs && typeof saved.programs === 'object' ? saved.programs as Record<string, unknown> : {};
    const openers: SourceOpener[] = [];
    for (const preset of SourcePreset.All) {
      const exe = programs[preset.id];
      if (typeof exe === 'string' && exe) openers.push({ id: preset.id, name: preset.name, exe, pattern: preset.pattern });
    }
    return { roots, openers };
  }

  private asOpener(value: unknown): SourceOpener | null {
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) return null;
    if (typeof item.exe !== 'string' || typeof item.pattern !== 'string') return null;
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : path.basename(item.exe) || '打开程序';
    return { id: item.id.trim(), name, exe: item.exe, pattern: item.pattern };
  }

  private async validate(input: unknown): Promise<SourceConfig> {
    const value = input as Partial<SourceConfig> & { programs?: unknown };
    if (!value || !Array.isArray(value.roots) || value.roots.length > SourceConst.MaxRoots) throw new SourceError('目录和打开程序配置无效');
    const roots: string[] = [];
    for (const root of value.roots) {
      if (typeof root !== 'string' || !path.isAbsolute(root)) throw new SourceError('索引目录必须是绝对路径');
      const real = await fs.realpath(root).catch(() => { throw new SourceError(`目录不存在：${root}`); });
      if (!(await fs.stat(real)).isDirectory()) throw new SourceError(`不是目录：${root}`);
      if (!roots.includes(real)) roots.push(real);
    }
    const rawOpeners = Array.isArray(value.openers) ? value.openers : this.config.openers;
    if (rawOpeners.length > SourceConst.MaxOpeners) throw new SourceError('打开程序数量已达上限');
    const openers: SourceOpener[] = [];
    const seen = new Set<string>();
    for (const item of rawOpeners) {
      const opener = this.asOpener(item);
      if (!opener) throw new SourceError('打开程序条目无效');
      if (seen.has(opener.id)) throw new SourceError('打开程序编号重复');
      seen.add(opener.id);
      if (opener.pattern.length > 300) throw new SourceError('后缀或正则过长');
      if (opener.exe) {
        if (!path.isAbsolute(opener.exe)) throw new SourceError('启动程序必须是绝对路径');
        if (!(await fs.stat(opener.exe).catch(() => null))?.isFile()) throw new SourceError(`启动程序不存在：${opener.exe}`);
      }
      openers.push(opener);
    }
    return { roots, openers };
  }

  async rebuild(input: unknown = this.config, persist = true): Promise<SourceState> {
    return this.locked(async () => {
      const config = await this.validate(input);
      this.index = await this.scanRoots(config.roots, 0);
      await this.commit(config, persist);
    });
  }

  async addRoot(input: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const real = await this.validateRoot(input);
      if (this.config.roots.includes(real)) {
        await this.replaceRootIndex(real);
        return;
      }
      if (this.config.roots.length >= SourceConst.MaxRoots) throw new SourceError('索引目录数量已达上限');
      const scanned = await this.scanRoots([real], this.fileCount());
      this.mergeIndex(scanned);
      await this.commit({ roots: [...this.config.roots, real], openers: this.config.openers });
    });
  }

  async removeRoot(input: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const real = await this.validateRoot(input, false);
      const roots = this.config.roots.filter((root) => root !== real);
      if (roots.length === this.config.roots.length) throw new SourceError('未找到该索引目录', 404);
      this.dropRootFiles(real);
      await this.commit({ roots, openers: this.config.openers });
    });
  }

  async rebuildRoot(input: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const real = await this.validateRoot(input);
      if (!this.config.roots.includes(real)) throw new SourceError('未找到该索引目录', 404);
      await this.replaceRootIndex(real);
      await this.commit(this.config);
    });
  }

  async saveOpeners(openers: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const config = await this.validate({ roots: this.config.roots, openers: openers as SourceOpener[] });
      this.allowPresetInsert = false;
      await this.commit(config);
    });
  }

  private async applyDetectedOpeners(): Promise<void> {
    this.detected = await this.detectOpeners().catch(() => []);
    let changed = false;
    const openers = [...this.config.openers];
    const byId = new Map(openers.map((item) => [item.id, item]));
    const byExe = new Set(openers.map((item) => path.basename(item.exe).toLowerCase()).filter(Boolean));
    for (const preset of this.detected) {
      const current = byId.get(preset.id);
      if (current && !current.exe) {
        current.exe = preset.exe;
        if (!current.name) current.name = preset.name;
        if (!current.pattern) current.pattern = preset.pattern;
        changed = true;
        continue;
      }
      if (!this.allowPresetInsert) continue;
      if (current || byExe.has(path.basename(preset.exe).toLowerCase())) continue;
      openers.push({ ...preset });
      byId.set(preset.id, preset);
      byExe.add(path.basename(preset.exe).toLowerCase());
      changed = true;
    }
    if (!changed) return;
    this.config = { ...this.config, openers };
    await this.persist(this.config).catch(() => undefined);
  }

  private async replaceRootIndex(root: string): Promise<void> {
    const kept = this.fileCount() - this.rootFileCount(root);
    const scanned = await this.scanRoots([root], kept);
    this.dropRootFiles(root);
    this.mergeIndex(scanned);
  }

  private async scanRoots(roots: string[], already: number): Promise<Map<string, string[]>> {
    const index = new Map<string, string[]>();
    const seen = new Set<string>();
    const pending = [...roots];
    let count = already;
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
    return index;
  }

  private mergeIndex(scanned: Map<string, string[]>): void {
    for (const [key, files] of scanned) {
      const current = this.index.get(key) || [];
      for (const file of files) if (!current.includes(file)) current.push(file);
      current.sort();
      this.index.set(key, current);
    }
  }

  private dropRootFiles(root: string): void {
    for (const [key, files] of [...this.index.entries()]) {
      const next = files.filter((file) => !this.inside(root, file));
      if (next.length) this.index.set(key, next);
      else this.index.delete(key);
    }
  }

  private async validateRoot(input: unknown, mustExist = true): Promise<string> {
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new SourceError('索引目录必须是绝对路径');
    if (!mustExist) {
      const match = this.config.roots.find((root) => root.toLowerCase() === path.normalize(input).toLowerCase()) || this.config.roots.find((root) => root === input);
      return match || path.normalize(input);
    }
    const real = await fs.realpath(input).catch(() => { throw new SourceError(`目录不存在：${input}`); });
    if (!(await fs.stat(real)).isDirectory()) throw new SourceError(`不是目录：${input}`);
    return real;
  }

  private async commit(config: SourceConfig, persist = true): Promise<void> {
    if (persist) await this.persist(config);
    this.config = config;
    this.updated = new Date().toISOString();
    this.error = '';
  }

  private async persist(config: SourceConfig): Promise<void> {
    const temp = `${this.store}.tmp`;
    await fs.writeFile(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
    await fs.rename(temp, this.store);
  }

  private async locked(work: () => Promise<void>): Promise<SourceState> {
    if (this.busy) throw new SourceError('索引正在构建，请稍后重试', 409);
    this.busy = true;
    try { await work(); }
    finally { this.busy = false; }
    return this.state();
  }

  private fileCount(): number {
    return [...this.index.values()].reduce((n, list) => n + list.length, 0);
  }

  private rootFileCount(root: string): number {
    return [...this.index.values()].reduce((n, list) => n + list.filter((file) => this.inside(root, file)).length, 0);
  }

  private rootsInfo(): SourceRootInfo[] {
    return this.config.roots.map((root) => ({ path: root, count: this.rootFileCount(root) }));
  }

  lookup(file: string): SourceMatch[] {
    return (this.index.get(this.key(file)) || []).map((item) => {
      const opener = matchOpener(item, this.config.openers);
      return { path: item, openerId: opener?.id || null, openerName: opener?.name || null, ready: !!opener?.exe };
    });
  }

  async open(file: unknown, target: unknown, line: unknown, openerId?: unknown): Promise<{ message: string }> {
    if (typeof file !== 'string' || typeof target !== 'string' || !Number.isSafeInteger(line) || Number(line) < 1 || Number(line) > 2147483647) throw new SourceError('文件或源码行号无效');
    const match = this.lookup(file).find((item) => item.path === target);
    if (!match) throw new SourceError('文件不在索引中，请重建索引', 404);
    const opener = (typeof openerId === 'string' && openerId
      ? this.config.openers.find((item) => item.id === openerId)
      : this.config.openers.find((item) => item.id === match.openerId)) || null;
    if (!opener) throw new SourceError('没有匹配的打开程序，请在源码索引中配置后缀或正则，或在主界面临时指定');
    if (!opener.exe) throw new SourceError(`请先配置 ${opener.name || '打开程序'} 的启动路径`);
    const real = await fs.realpath(target).catch(() => { throw new SourceError('文件已移动或删除，请重建索引', 404); });
    if (!this.config.roots.some((root) => this.inside(root, real)) || real !== target || !(await fs.stat(real)).isFile()) throw new SourceError('文件路径已变化，请重建索引', 409);
    const lineNo = Number(line);
    await this.launch(opener.exe, openerLaunchArgs(opener.exe, real, lineNo));
    return { message: `已发送至 ${opener.name || path.basename(opener.exe)}：${path.basename(real)}:${lineNo}` };
  }

  static launch(exe: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // The requested target is a visible IDE, not a background helper.
      const child = spawn(exe, args, { shell: false, windowsHide: false, stdio: 'ignore' });
      child.once('error', () => reject(new SourceError('IDE 启动失败，请检查程序路径', 503)));
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
}
