import { RemoteStoreKey, RemoteUi } from '../config/fileLoadTypes';

interface ServerPrefs {
  last?: string;
  recent: string[];
  used?: number;
}

interface PrefsFile {
  server?: string;
  servers: Record<string, ServerPrefs>;
}

/** 远程浏览的本机偏好：上次服务器、每台服务器的上次目录与最近目录。只存 localStorage，丢失不影响功能。 */
export class RemotePrefs {
  private static read(): PrefsFile {
    try {
      const raw = localStorage.getItem(RemoteStoreKey.Prefs);
      const parsed = raw ? JSON.parse(raw) as PrefsFile : null;
      if (parsed && typeof parsed === 'object' && parsed.servers) return parsed;
    } catch { /* 私有窗口或被清理时退回空偏好 */ }
    return { servers: {} };
  }

  private static write(value: PrefsFile): void {
    try { localStorage.setItem(RemoteStoreKey.Prefs, JSON.stringify(value)); } catch { /* ignore */ }
  }

  static server(): string | undefined {
    return this.read().server;
  }

  static last(id: string): string | undefined {
    return this.read().servers[id]?.last;
  }

  static recent(id: string): string[] {
    return this.read().servers[id]?.recent || [];
  }

  static used(id: string): number {
    return this.read().servers[id]?.used || 0;
  }

  static visit(id: string, dir: string): void {
    const value = this.read();
    const item = value.servers[id] || { recent: [] };
    item.last = dir;
    item.used = Date.now();
    item.recent = [dir, ...item.recent.filter((entry) => entry !== dir)].slice(0, RemoteUi.RecentLimit);
    value.servers[id] = item;
    value.server = id;
    this.write(value);
  }

  static forget(id: string): void {
    const value = this.read();
    delete value.servers[id];
    if (value.server === id) delete value.server;
    this.write(value);
  }

  static history(): string[] {
    try {
      const raw = localStorage.getItem(RemoteStoreKey.History);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch { return []; }
  }

  static remember(command: string): string[] {
    const next = [...this.history().filter((item) => item !== command), command].slice(-RemoteUi.HistoryLimit);
    try { localStorage.setItem(RemoteStoreKey.History, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }
}
