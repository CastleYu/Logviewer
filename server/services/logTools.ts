import { AiNoteKind, AiPartKind, ToolCap, ToolName, type AiNote, type AiView } from '../../src/config/aiTypes';
import type { LogEntry } from '../../src/types';
import type { NoteStore } from './noteStore';

export type ToolOut = { text: string; bytes: number; truncated: boolean };

export class ToolText {
  static line(value: number): string { return `L${value}`; }

  static clip(value: string, max = ToolCap.Line): string {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  }

  static fit(body: Record<string, unknown>, cap: number): ToolOut {
    let text = JSON.stringify(body);
    if (Buffer.byteLength(text) <= cap) return { text, bytes: Buffer.byteLength(text), truncated: Boolean(body.truncated) };
    const hint = '结果超过上限，请缩小范围或使用 cursor 继续读取';
    const shrunk: Record<string, unknown> = { truncated: true, hint };
    for (const [key, value] of Object.entries(body)) {
      if (key === 'truncated' || key === 'hint') continue;
      shrunk[key] = value;
      const next = JSON.stringify(shrunk);
      if (Buffer.byteLength(next) > cap) {
        delete shrunk[key];
        break;
      }
      text = next;
    }
    if (Buffer.byteLength(text) > cap || !shrunk.truncated) {
      text = JSON.stringify({ truncated: true, hint, preview: text.slice(0, Math.max(0, cap - 160)) });
    }
    if (Buffer.byteLength(text) > cap) text = text.slice(0, cap);
    return { text, bytes: Buffer.byteLength(text), truncated: true };
  }
}

type Bag = { name: string; lines: string[]; logs: LogEntry[] };

export class LogTools {
  constructor(private readonly bag: Bag, private readonly view: AiView, private readonly notes: NoteStore, private readonly logId: string, private readonly onNote: (note: AiNote) => void) {}

  call(name: string, args: Record<string, unknown>): ToolOut {
    const arg = args || {};
    if (name === ToolName.Overview) return this.overview();
    if (name === ToolName.Search) return this.search(arg);
    if (name === ToolName.Read) return this.read(arg);
    if (name === ToolName.Record) return this.record(arg);
    if (name === ToolName.Stats) return this.stats(arg);
    if (name === ToolName.Errors) return this.errors(arg);
    if (name === ToolName.Selection) return this.selection();
    if (name === ToolName.View) return this.currentView();
    if (name === ToolName.NoteWrite) return this.saveNote(AiNoteKind.Note, arg);
    if (name === ToolName.ReportWrite) return this.saveNote(AiNoteKind.Report, arg);
    if (name === ToolName.NoteRead) return this.noteRead(arg);
    if (name === ToolName.NoteList) return this.noteList();
    if (name === ToolName.MemoryWrite) return this.memoryWrite(arg);
    if (name === ToolName.MemorySearch) return this.memorySearch(arg);
    return ToolText.fit({ error: `未知工具 ${name}` }, ToolCap.Body);
  }

  private overview(): ToolOut {
    const levels: Record<string, number> = {};
    const modules = new Map<string, number>();
    let failed = 0;
    let from = '';
    let to = '';
    for (const log of this.bag.logs) {
      if (!log.success) failed += 1;
      const level = String(log.fields?.level || 'OTHER').toUpperCase();
      levels[level] = (levels[level] || 0) + 1;
      const module = String(log.fields?.module || '');
      if (module) modules.set(module, (modules.get(module) || 0) + 1);
      const stamp = String(log.fields?.timestamp || '');
      if (stamp && (!from || stamp < from)) from = stamp;
      if (stamp && stamp > to) to = stamp;
    }
    const top = [...modules.entries()].sort((a, b) => b[1] - a[1]).slice(0, ToolCap.Modules).map(([name, count]) => ({ name, count }));
    return ToolText.fit({ file: this.bag.name, records: this.bag.logs.length, lines: this.bag.lines.length, from, to, levels, modules: top, failed }, ToolCap.Overview);
  }

  private search(args: Record<string, unknown>): ToolOut {
    const query = String(args.query || '');
    const limit = Math.min(ToolCap.Search, Math.max(1, Number(args.limit) || 20));
    const cursor = Math.max(0, Number(args.cursor) || 0);
    let pattern: RegExp | null = null;
    if (args.regex) { try { pattern = new RegExp(query, 'i'); } catch { return ToolText.fit({ error: '正则无效' }, ToolCap.Body); } }
    const level = String(args.level || '').toUpperCase();
    const module = String(args.module || '').toLowerCase();
    const from = String(args.from || '');
    const to = String(args.to || '');
    const hits = this.bag.logs.filter((log) => {
      const fields = log.fields;
      if (level && String(fields?.level || '').toUpperCase() !== level) return false;
      if (module && !String(fields?.module || '').toLowerCase().includes(module)) return false;
      const stamp = String(fields?.timestamp || '');
      if (from && stamp && stamp < from) return false;
      if (to && stamp && stamp > to) return false;
      const text = log.rawText || '';
      if (!query) return true;
      return pattern ? pattern.test(text) : text.toLowerCase().includes(query.toLowerCase());
    });
    const page = hits.slice(cursor, cursor + limit).map((log) => ({ line: ToolText.line(log.lineNumber), text: ToolText.clip(log.rawText) }));
    const next = cursor + limit < hits.length ? String(cursor + limit) : '';
    return ToolText.fit({ count: hits.length, hits: page, nextCursor: next, truncated: Boolean(next) }, ToolCap.Body);
  }

  private read(args: Record<string, unknown>): ToolOut {
    const line = Math.max(1, Number(args.line) || 1);
    const before = Math.min(ToolCap.Before, Math.max(0, Number(args.before) || 0));
    const after = Math.min(ToolCap.After, Math.max(0, Number(args.after) || 0));
    const start = Math.max(1, line - before);
    const end = Math.min(this.bag.lines.length, line + after);
    const rows = this.bag.lines.slice(start - 1, end).map((text, index) => `${ToolText.line(start + index)} ${text}`);
    return ToolText.fit({ line: ToolText.line(line), text: rows.join('\n') }, ToolCap.Body);
  }

  private record(args: Record<string, unknown>): ToolOut {
    const line = Number(args.line) || 0;
    const log = this.bag.logs.find((item) => item.lineNumber <= line && (item.endLineNumber ?? item.lineNumber) >= line) || this.bag.logs.find((item) => item.lineNumber === line);
    if (!log) return ToolText.fit({ error: `没有 ${ToolText.line(line)}` }, ToolCap.Body);
    return ToolText.fit({ line: ToolText.line(log.lineNumber), fields: log.fields || {}, stack: log.stack || null, raw: log.rawText, success: log.success }, ToolCap.Body);
  }

  private stats(args: Record<string, unknown>): ToolOut {
    const group = String(args.groupBy || 'level');
    const counts = new Map<string, number>();
    for (const log of this.bag.logs) {
      const key = group === 'module' ? String(log.fields?.module || '(none)')
        : group === 'thread' ? String(log.fields?.threadId || '(none)')
        : group === 'minute' ? String(log.fields?.timestamp || '').slice(0, 16) || '(none)'
        : String(log.fields?.level || 'OTHER').toUpperCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, ToolCap.Groups).map(([key, count]) => ({ key, count }));
    return ToolText.fit({ groupBy: group, groups, truncated: counts.size > groups.length }, ToolCap.Body);
  }

  private errors(args: Record<string, unknown>): ToolOut {
    const limit = Math.min(ToolCap.Errors, Math.max(1, Number(args.limit) || 20));
    const cursor = Math.max(0, Number(args.cursor) || 0);
    const bad = this.bag.logs.filter((log) => !log.success || ['ERROR', 'FATAL', 'ERR'].includes(String(log.fields?.level || '').toUpperCase()));
    const kinds = new Map<string, { count: number; line: number; text: string }>();
    for (const log of bad) {
      const kind = LogTools.kindOf(log);
      const hit = kinds.get(kind);
      if (hit) hit.count += 1;
      else kinds.set(kind, { count: 1, line: log.lineNumber, text: ToolText.clip(log.rawText) });
    }
    const rows = [...kinds.entries()].map(([kind, item]) => ({ kind, count: item.count, line: ToolText.line(item.line), text: item.text }));
    const page = rows.slice(cursor, cursor + limit);
    const next = cursor + limit < rows.length ? String(cursor + limit) : '';
    return ToolText.fit({ count: rows.length, errors: page, nextCursor: next, truncated: Boolean(next) }, ToolCap.Body);
  }

  private selection(): ToolOut {
    const lines = this.view.use ? this.view.selected : [];
    const hits = lines.map((line) => {
      const log = this.bag.logs.find((item) => item.lineNumber === line);
      return { line: ToolText.line(line), text: ToolText.clip(log?.rawText || '') };
    });
    return ToolText.fit({ count: hits.length, rows: hits }, ToolCap.Body);
  }

  private currentView(): ToolOut {
    return ToolText.fit({ search: this.view.search, filter: this.view.filter, from: this.view.from ? ToolText.line(this.view.from) : '', to: this.view.to ? ToolText.line(this.view.to) : '', selected: this.view.use ? this.view.selected.length : 0 }, ToolCap.Body);
  }

  private saveNote(kind: AiNoteKind, args: Record<string, unknown>): ToolOut {
    const name = String(args.name || args.title || '');
    const text = String(args.text || args.content || args.markdown || '');
    if (!text.trim()) return ToolText.fit({ error: '内容为空' }, ToolCap.Body);
    return { text: '', bytes: 0, truncated: false, ...this.pendingNote(kind, name, text, []) };
  }

  private pendingNote(kind: AiNoteKind, name: string, text: string, tags: string[]): ToolOut {
    const task = this.notes.write(kind, this.logId, name, text, tags).then((note) => {
      this.onNote(note);
      return note;
    });
    (this as LogTools & { last?: Promise<AiNote> }).last = task;
    return ToolText.fit({ accepted: true, kind, name: name || kind }, ToolCap.Body);
  }

  async finish(out: ToolOut, name: string, args: Record<string, unknown>): Promise<ToolOut> {
    if (name !== ToolName.NoteWrite && name !== ToolName.ReportWrite && name !== ToolName.MemoryWrite) return out;
    const note = await (this as LogTools & { last?: Promise<AiNote> }).last;
    if (!note) return out;
    return ToolText.fit({ ok: true, id: note.id, kind: note.kind, name: note.name, line: AiPartKind.Note }, ToolCap.Body);
  }

  private noteRead(args: Record<string, unknown>): ToolOut {
    return { text: '', bytes: 0, truncated: false };
  }

  private noteList(): ToolOut {
    return { text: '', bytes: 0, truncated: false };
  }

  private memoryWrite(args: Record<string, unknown>): ToolOut {
    const text = String(args.text || args.content || '');
    const tags = Array.isArray(args.tags) ? args.tags.map(String) : String(args.tags || '').split(/[,，\s]+/).filter(Boolean);
    if (!text.trim()) return ToolText.fit({ error: '内容为空' }, ToolCap.Body);
    return this.pendingNote(AiNoteKind.Memory, String(args.name || args.title || '记忆'), text, tags);
  }

  private memorySearch(_args: Record<string, unknown>): ToolOut {
    return { text: '', bytes: 0, truncated: false };
  }

  async resolve(name: string, args: Record<string, unknown>, out: ToolOut): Promise<ToolOut> {
    if (name === ToolName.NoteRead) {
      const note = await this.notes.read(String(args.id || ''), this.logId);
      return ToolText.fit(note ? { id: note.id, name: note.name, text: note.text, kind: note.kind } : { error: '没有这条笔记' }, ToolCap.Body);
    }
    if (name === ToolName.NoteList) {
      const notes = (await this.notes.list(this.logId)).filter((item) => item.kind !== AiNoteKind.Memory).map((item) => ({ id: item.id, name: item.name, kind: item.kind, created: item.created }));
      return ToolText.fit({ notes }, ToolCap.Body);
    }
    if (name === ToolName.MemorySearch) {
      const notes = (await this.notes.search(String(args.query || ''), args.tag ? String(args.tag) : undefined)).map((item) => ({ id: item.id, name: item.name, text: ToolText.clip(item.text, 400), tags: item.tags }));
      return ToolText.fit({ notes }, ToolCap.Body);
    }
    if (name === ToolName.NoteWrite || name === ToolName.ReportWrite || name === ToolName.MemoryWrite) return this.finish(out, name, args);
    return out;
  }

  private static kindOf(log: LogEntry): string {
    const text = `${log.rawText}\n${log.parseErrorReason || ''}`;
    const match = text.match(/([A-Za-z_][\w.]*(?:Exception|Error))/);
    if (match) return match[1];
    if (!log.success) return 'parse-failed';
    return String(log.fields?.level || 'ERROR').toUpperCase();
  }
}
