import { SourceOpener } from '../config/sourceTypes';

export function fileBasename(file: string): string {
  return file.replaceAll('\\', '/').split('/').pop() || '';
}

export function patternMatches(pattern: string, file: string): boolean {
  const base = fileBasename(file);
  const ext = (() => {
    const index = base.lastIndexOf('.');
    return index > 0 ? base.slice(index).toLowerCase() : '';
  })();
  const parts = pattern.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^\.?\w+$/.test(part)) {
      const want = part.startsWith('.') ? part.toLowerCase() : `.${part.toLowerCase()}`;
      if (ext === want) return true;
      continue;
    }
    try {
      if (new RegExp(part).test(base)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function matchOpener(file: string, openers: SourceOpener[]): SourceOpener | null {
  return openers.find((item) => patternMatches(item.pattern, file)) || null;
}

export function majorityOpener(files: string[], openers: SourceOpener[]): SourceOpener | null {
  const counts = new Map<string, number>();
  for (const file of files) {
    const opener = matchOpener(file, openers);
    if (!opener) continue;
    counts.set(opener.id, (counts.get(opener.id) || 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [id, count] of counts) {
    if (count > max) {
      best = id;
      max = count;
    }
  }
  return openers.find((item) => item.id === best) || null;
}
