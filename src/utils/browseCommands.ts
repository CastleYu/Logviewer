import { denyOutsideRoots, joinRemotePath, normalizeRemotePath } from './browsePath';

export interface BrowseEntry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  modifyTime?: number;
}

export type BrowseAction =
  | { kind: 'enter'; path: string }
  | { kind: 'open'; path: string }
  | { kind: 'stay'; path: string; message?: string }
  | { kind: 'refresh'; path: string }
  | { kind: 'exec'; path: string; command: string }
  | { kind: 'reject'; path: string; message: string };

export function listingAction(entry: BrowseEntry): 'enter' | 'open' {
  return entry.type === 'dir' ? 'enter' : 'open';
}

export function applyListingAction(current: string, entry: BrowseEntry): BrowseAction {
  const full = joinRemotePath(current, entry.name);
  return listingAction(entry) === 'enter'
    ? { kind: 'enter', path: full }
    : { kind: 'open', path: full };
}

export function splitCommand(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

export function resolveCd(current: string, target: string, roots: string[]): { ok: true; path: string } | { ok: false; path: string; message: string } {
  const trimmed = target.trim();
  let next: string;
  if (!trimmed || trimmed === '~') {
    next = roots[0] ? normalizeRemotePath(roots[0]) : '/';
  } else if (trimmed.startsWith('/')) {
    next = normalizeRemotePath(trimmed);
  } else {
    next = joinRemotePath(current, trimmed);
  }
  const denied = denyOutsideRoots(next, roots);
  if (denied) return { ok: false, path: current, message: denied };
  return { ok: true, path: next };
}

function sharedPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) index += 1;
    prefix = prefix.slice(0, index);
    if (!prefix) return '';
  }
  return prefix;
}

export function completeBrowseInput(input: string, entries: BrowseEntry[]): { input: string; candidates: string[] } {
  const lastSpace = input.lastIndexOf(' ');
  const prefix = lastSpace >= 0 ? input.slice(0, lastSpace + 1) : '';
  const token = lastSpace >= 0 ? input.slice(lastSpace + 1) : input;
  const candidates = entries.map((entry) => entry.name).filter((name) => name.startsWith(token)).sort();
  if (candidates.length === 0) return { input, candidates: [] };
  if (candidates.length === 1) {
    const name = candidates[0];
    const entry = entries.find((item) => item.name === name);
    const suffix = entry?.type === 'dir' && !name.endsWith('/') ? '/' : '';
    return { input: `${prefix}${name}${suffix}`, candidates };
  }
  return { input: `${prefix}${sharedPrefix(candidates)}`, candidates };
}

export function applyBrowseCommand(
  input: string,
  current: string,
  roots: string[],
  entries: BrowseEntry[],
): BrowseAction {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'stay', path: current };
  const parts = splitCommand(trimmed);
  const cmd = parts[0]?.toLowerCase() || '';
  const rest = parts.slice(1).join(' ');

  if (cmd === 'cd') {
    const resolved = resolveCd(current, rest, roots);
    if (resolved.ok === false) return { kind: 'reject', path: current, message: resolved.message };
    return { kind: 'enter', path: resolved.path };
  }

  if (cmd === 'ls') return { kind: 'refresh', path: current };

  if (cmd === 'open') {
    if (!rest) return { kind: 'reject', path: current, message: '请指定要打开的文件' };
    const full = rest.startsWith('/') ? normalizeRemotePath(rest) : joinRemotePath(current, rest);
    const denied = denyOutsideRoots(full, roots);
    if (denied) return { kind: 'reject', path: current, message: denied };
    return { kind: 'open', path: full };
  }

  if (parts.length === 1) {
    const entry = entries.find((item) => item.name === parts[0] || item.name === parts[0].replace(/\/$/, ''));
    if (entry) return applyListingAction(current, entry);
  }

  return { kind: 'exec', path: current, command: trimmed };
}
