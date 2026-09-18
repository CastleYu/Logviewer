import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SourceConst, SourceIde, SourceOpener, SourcePreset } from '../../src/config/sourceTypes';

export function emptyPrograms(): Record<SourceIde, string> {
  return Object.fromEntries(Object.values(SourceIde).map((id) => [id, ''])) as Record<SourceIde, string>;
}

export function parseRegSzPaths(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/REG_SZ\s+(.+)$/);
    if (!match) continue;
    const value = match[1].trim();
    if (/^[A-Za-z]:[\\/]/.test(value)) paths.push(value);
  }
  return paths;
}

export function versionRank(value: string): number[] {
  return (value.match(/\d+/g) || []).map((part) => Number(part));
}

export function compareVersionPath(left: string, right: string): number {
  const a = versionRank(left);
  const b = versionRank(right);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const diff = (b[i] || 0) - (a[i] || 0);
    if (diff) return diff;
  }
  return right.localeCompare(left);
}

export function pickIdeExe(ide: SourceIde, dirs: string[], exists: (file: string) => boolean): string {
  const exe = SourceConst.Exe[ide];
  for (const dir of [...dirs].sort(compareVersionPath)) {
    for (const candidate of [path.join(dir, 'bin', exe), path.join(dir, exe)]) {
      if (exists(candidate)) return candidate;
    }
  }
  return '';
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, shell: false });
    let out = '';
    child.stdout?.on('data', (chunk) => { out += String(chunk); });
    child.stderr?.on('data', () => undefined);
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out));
  });
}

async function registryDirs(): Promise<string[]> {
  const keys = [
    'HKLM\\SOFTWARE\\JetBrains',
    'HKLM\\SOFTWARE\\WOW6432Node\\JetBrains',
    'HKCU\\SOFTWARE\\JetBrains',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe',
  ];
  const chunks = await Promise.all(keys.map((key) => commandOutput('reg', ['query', key, '/s'])));
  return parseRegSzPaths(chunks.join('\n'));
}

async function toolboxDirs(): Promise<string[]> {
  const dirs: string[] = [];
  const local = process.env.LOCALAPPDATA || '';
  const settings = path.join(local, 'JetBrains', 'Toolbox', '.settings.json');
  try {
    const parsed = JSON.parse(await fs.readFile(settings, 'utf8')) as { install_location?: string };
    if (parsed.install_location) dirs.push(parsed.install_location);
  } catch { /* Toolbox is optional */ }
  if (local) dirs.push(path.join(local, 'Programs'), path.join(local, 'JetBrains', 'Toolbox', 'apps'));
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  dirs.push(path.join(programFiles, 'JetBrains'));
  if (local) dirs.push(path.join(local, 'Programs', 'Microsoft VS Code'));
  dirs.push(path.join(programFiles, 'Microsoft VS Code'));
  return dirs;
}

function likelyIdeDir(dir: string): boolean {
  return /jetbrains|pycharm|intellij|idea|clion|visual studio code|vscode/i.test(dir);
}

async function findExes(dir: string, depth: number, buckets: Record<SourceIde, string[]>, seen: Set<string>): Promise<void> {
  const key = dir.toLowerCase();
  if (depth < 0 || seen.has(key)) return;
  seen.add(key);
  for (const ide of Object.values(SourceIde)) {
    for (const candidate of [path.join(dir, 'bin', SourceConst.Exe[ide]), path.join(dir, SourceConst.Exe[ide])]) {
      if ((await fs.stat(candidate).catch(() => null))?.isFile()) buckets[ide].push(candidate);
    }
  }
  if (depth === 0) return;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) await findExes(path.join(dir, entry.name), depth - 1, buckets, seen);
  }
}

export async function detectIdePrograms(): Promise<Record<SourceIde, string>> {
  const found = emptyPrograms();
  if (process.platform !== 'win32') return found;
  const lists: Record<SourceIde, string[]> = Object.fromEntries(Object.values(SourceIde).map((id) => [id, [] as string[]])) as Record<SourceIde, string[]>;
  const seen = new Set<string>();
  const seeds = [...new Set([...(await registryDirs()), ...(await toolboxDirs())])];
  for (const seed of seeds) {
    const stat = await fs.stat(seed).catch(() => null);
    if (!stat) continue;
    if (stat.isFile()) {
      const name = path.basename(seed).toLowerCase();
      for (const ide of Object.values(SourceIde)) if (name === SourceConst.Exe[ide].toLowerCase()) lists[ide].push(seed);
      continue;
    }
    if (stat.isDirectory() && likelyIdeDir(seed)) await findExes(seed, 4, lists, seen);
  }
  for (const ide of Object.values(SourceIde)) found[ide] = lists[ide].sort(compareVersionPath)[0] || '';
  return found;
}

export async function detectPresetOpeners(): Promise<SourceOpener[]> {
  const found = await detectIdePrograms();
  return SourcePreset.All.filter((preset) => found[preset.id as SourceIde]).map((preset) => ({
    id: preset.id,
    name: preset.name,
    exe: found[preset.id as SourceIde],
    pattern: preset.pattern,
  }));
}
