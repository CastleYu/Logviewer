import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SourceConfig, SourceConst, SourceMatch, SourceOpener, SourcePreset, SourceRepository, SourceRootInfo, SourceState, SourceTarget } from '../../src/config/sourceTypes';
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
      const index = await this.scanRoots(config.roots, 0);
      await this.commit(config, persist);
      this.index = index;
    });
  }

  async addRoot(input: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const real = await this.validateRoot(input);
      const known = this.config.roots.find((root) => this.samePath(root, real));
      if (!known && this.config.roots.length >= SourceConst.MaxRoots) throw new SourceError('索引目录数量已达上限');
      const index = await this.indexReplacing(known || real);
      const roots = known ? this.config.roots : [...this.config.roots, real];
      await this.commit({ roots, openers: this.config.openers });
      this.index = index;
    });
  }

  async removeRoot(input: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const requested = await this.validateRoot(input, false);
      const known = this.config.roots.find((root) => this.samePath(root, requested));
      if (!known) throw new SourceError('未找到该索引目录', 404);
      const roots = this.config.roots.filter((root) => !this.samePath(root, known));
      const index = this.indexWithout(known, roots);
      await this.commit({ roots, openers: this.config.openers });
      this.index = index;
    });
  }

  async rebuildRoot(input: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const real = await this.validateRoot(input);
      const known = this.config.roots.find((root) => this.samePath(root, real));
      if (!known) throw new SourceError('未找到该索引目录', 404);
      const index = await this.indexReplacing(known);
      await this.commit(this.config);
      this.index = index;
    });
  }

  async saveOpeners(openers: unknown): Promise<SourceState> {
    return this.locked(async () => {
      const config = await this.validate({ roots: this.config.roots, openers: openers as SourceOpener[] });
      await this.commit(config);
      this.allowPresetInsert = false;
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

  /** Replace every indexed file under root with a fresh scan. Overlapping roots do not keep stale paths. */
  private async indexReplacing(root: string): Promise<Map<string, string[]>> {
    const kept = this.fileCount() - this.rootFileCount(root);
    const scanned = await this.scanRoots([root], kept);
    const next = this.indexWithout(root, []);
    return this.merged(next, scanned);
  }

  /** Drop files under root unless another configured root still covers them. Does not mutate the live index. */
  private indexWithout(root: string, rest: string[]): Map<string, string[]> {
    const next = new Map<string, string[]>();
    for (const [key, files] of this.index) {
      const kept = files.filter((file) => !this.inside(root, file) || rest.some((item) => this.inside(item, file)));
      if (kept.length) next.set(key, kept);
    }
    return next;
  }

  private merged(base: Map<string, string[]>, extra: Map<string, string[]>): Map<string, string[]> {
    const next = new Map<string, string[]>();
    for (const [key, files] of base) next.set(key, [...files]);
    for (const [key, files] of extra) {
      const current = next.get(key) || [];
      for (const file of files) if (!current.includes(file)) current.push(file);
      current.sort();
      next.set(key, current);
    }
    return next;
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
        if (entry.isDirectory()) {
          if (await this.isJunction(file)) continue;
          pending.push(file);
        } else if (entry.isFile()) {
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

  /** Windows directory junctions are reparse points, not Dirent symlinks, and must not be walked. */
  private async isJunction(file: string): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    return fs.readlink(file).then(() => true, () => false);
  }

  private async validateRoot(input: unknown, mustExist = true): Promise<string> {
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new SourceError('索引目录必须是绝对路径');
    if (!mustExist) return path.normalize(input);
    const real = await fs.realpath(input).catch(() => { throw new SourceError(`目录不存在：${input}`); });
    if (!(await fs.stat(real)).isDirectory()) throw new SourceError(`不是目录：${input}`);
    return real;
  }

  private samePath(left: string, right: string): boolean {
    const identity = (value: string) => {
      const normalized = path.normalize(value).replace(/[\\/]+$/, '');
      return normalized || path.normalize(value);
    };
    return this.pathKey(identity(left)) === this.pathKey(identity(right));
  }

  private canonical(file: string): string {
    let value = file;
    if (value.startsWith('\\\\?\\UNC\\')) value = `\\\\${value.slice(8)}`;
    else if (value.startsWith('\\\\?\\')) value = value.slice(4);
    return path.normalize(value);
  }

  private pathEnds(candidate: string, suffix: string): boolean {
    const left = this.pathKey(candidate.replaceAll('\\', '/'));
    const right = this.pathKey(suffix.replaceAll('\\', '/'));
    return left === right || left.endsWith(`/${right}`);
  }

  private async commit(config: SourceConfig, persist = true): Promise<void> {
    if (persist) await this.persist(config);
    this.config = config;
    this.updated = new Date().toISOString();
    this.error = '';
  }

  private async persist(config: SourceConfig): Promise<void> {
    const temp = `${this.store}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
      await fs.rename(temp, this.store);
    } catch {
      await fs.rm(temp, { force: true }).catch(() => undefined);
      throw new SourceError('源码配置保存失败，旧索引已保留', 500);
    }
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

  private listed(file: string): SourceMatch[] {
    return (this.index.get(this.key(file)) || []).map((item) => {
      const opener = matchOpener(item, this.config.openers);
      return { path: item, openerId: opener?.id || null, openerName: opener?.name || null, ready: !!opener?.exe };
    });
  }

  private suffixOf(file: string): string {
    return path.posix.normalize(file.replaceAll('\\', '/')).replace(/^\.\/+/, '').replace(/^\/+/, '');
  }

  /** Basename lookup, narrowed when the query carries a directory suffix. No hit falls back to every basename match. */
  lookup(file: string): SourceMatch[] {
    const matches = this.listed(file);
    const suffix = this.suffixOf(file);
    if (!suffix.includes('/')) return matches;
    const narrowed = matches.filter((item) => this.pathEnds(item.path, suffix));
    return narrowed.length ? narrowed : matches;
  }

  async repositories(targets: SourceTarget[]): Promise<SourceRepository[]> {
    for (const target of targets) {
      if (!target || typeof target.file !== 'string' || !target.file.trim() || target.file.trim().startsWith('-')) continue;
      const matches = this.listed(target.file);
      const suffix = this.suffixOf(target.file);
      const narrowed = matches.filter((item) => this.pathEnds(item.path, suffix));
      const candidates = narrowed.length ? narrowed : matches;
      const found = await this.repositoriesFor(candidates, target.line);
      if (found.length) return found;
    }
    return [];
  }

  async repository(directory: string): Promise<string> {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new SourceError('源码目录必须是绝对路径');
    const real = await fs.realpath(directory).catch(() => { throw new SourceError(`目录不存在：${directory}`); });
    if (!(await fs.stat(real)).isDirectory()) throw new SourceError(`不是目录：${directory}`);
    const root = await this.gitRoot(real);
    return root || real;
  }

  private async repositoriesFor(matches: SourceMatch[], line: number): Promise<SourceRepository[]> {
    const anchorLine = Number.isSafeInteger(line) && line > 0 ? line : 0;
    const result: SourceRepository[] = [];
    const seen = new Set<string>();
    for (const match of matches) {
      const candidate = await this.validIndexedFile(match.path);
      if (!candidate) continue;
      const repository = await this.gitRoot(path.dirname(candidate)) || this.fallbackRoot(candidate);
      if (!repository || seen.has(this.pathKey(repository))) continue;
      seen.add(this.pathKey(repository));
      result.push({ repository, file: candidate, line: anchorLine });
    }
    return result;
  }

  private async validIndexedFile(file: string): Promise<string | null> {
    const real = await fs.realpath(file).catch(() => null);
    if (!real) return null;
    const canon = this.canonical(real);
    if (this.pathKey(canon) !== this.pathKey(this.canonical(file)) || !(await fs.stat(canon).catch(() => null))?.isFile()) return null;
    return this.config.roots.some((root) => this.inside(root, canon)) ? canon : null;
  }

  private fallbackRoot(file: string): string | null {
    return this.config.roots.filter((root) => this.inside(root, file)).sort((a, b) => b.length - a.length)[0] || null;
  }

  private async gitRoot(directory: string): Promise<string | null> {
    let current = directory;
    while (true) {
      const marker = path.join(current, '.git');
      const info = await fs.stat(marker).catch(() => null);
      if (info && (info.isDirectory() || info.isFile())) return current;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }

  private pathKey(value: string): string { return process.platform === 'win32' ? value.toLowerCase() : value; }

  async open(file: unknown, target: unknown, line: unknown, openerId?: unknown): Promise<{ message: string }> {
    if (typeof file !== 'string' || typeof target !== 'string' || !Number.isSafeInteger(line) || Number(line) < 1 || Number(line) > 2147483647) throw new SourceError('文件或源码行号无效');
    const match = this.listed(file).find((item) => this.samePath(item.path, target));
    if (!match) throw new SourceError('文件不在索引中，请重建索引', 404);
    const opener = (typeof openerId === 'string' && openerId
      ? this.config.openers.find((item) => item.id === openerId)
      : this.config.openers.find((item) => item.id === match.openerId)) || null;
    if (!opener) throw new SourceError('没有匹配的打开程序，请在源码索引中配置后缀或正则，或在主界面临时指定');
    if (!opener.exe) throw new SourceError(`请先配置 ${opener.name || '打开程序'} 的启动路径`);
    const real = await fs.realpath(match.path).catch(() => { throw new SourceError('文件已移动或删除，请重建索引', 404); });
    const canon = this.canonical(real);
    if (!this.config.roots.some((root) => this.inside(root, canon)) || this.pathKey(canon) !== this.pathKey(this.canonical(match.path)) || !(await fs.stat(canon)).isFile()) throw new SourceError('文件路径已变化，请重建索引', 409);
    const lineNo = Number(line);
    await this.launch(opener.exe, openerLaunchArgs(opener.exe, canon, lineNo));
    return { message: `已发送至 ${opener.name || path.basename(opener.exe)}：${path.basename(canon)}:${lineNo}` };
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
