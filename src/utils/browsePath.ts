export function normalizeRemotePath(value: string): string {
  const trimmed = (value || '').trim() || '/';
  const absolute = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const out: string[] = [];
  for (const part of absolute.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.length === 0 ? '/' : `/${out.join('/')}`;
}

export function joinRemotePath(base: string, name: string): string {
  if (!name || name === '.') return normalizeRemotePath(base);
  if (name.startsWith('/')) return normalizeRemotePath(name);
  const root = normalizeRemotePath(base);
  return normalizeRemotePath(root === '/' ? `/${name}` : `${root}/${name}`);
}

export function underAllowedRoot(pathValue: string, root: string): boolean {
  const current = normalizeRemotePath(pathValue);
  const base = normalizeRemotePath(root);
  return current === base || current.startsWith(`${base}/`) || base === '/';
}

export function allowedRoots(roots?: string[], fallback?: string): string[] {
  const list = (roots && roots.length > 0 ? roots : [fallback || '/']).map(normalizeRemotePath);
  return list.length > 0 ? list : ['/'];
}

export function isAllowedPath(pathValue: string, roots: string[]): boolean {
  // Registered paths are starting points/favorites only; browsing is unrestricted.
  return Boolean(normalizeRemotePath(pathValue));
}

export function parentRemotePath(current: string, roots: string[]): string | null {
  const normalized = normalizeRemotePath(current);
  if (normalized === '/') return null;
  const idx = normalized.lastIndexOf('/');
  const parent = idx <= 0 ? '/' : normalized.slice(0, idx);
  return parent;
}

export function pathCrumbs(current: string, roots: string[]): string[] {
  const normalized = normalizeRemotePath(current);
  const base = '/';
  if (normalized === base) return [base];
  const parts = normalized.slice(1).split('/').filter(Boolean);
  const items = [base];
  let cursor = base;
  for (const part of parts) {
    cursor = joinRemotePath(cursor, part);
    items.push(cursor);
  }
  return items;
}

export function logDirectory(roots: string[]): string {
  const list = roots.length > 0 ? roots.map(normalizeRemotePath) : ['/'];
  const named = list.find((item) => item === '/log' || item === '/var/log' || item.endsWith('/log'));
  return named || list[0];
}

export function denyOutsideRoots(pathValue: string, roots: string[]): string | null {
  return null;
}
