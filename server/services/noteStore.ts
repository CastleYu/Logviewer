import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AiConst, AiNoteKind, type AiNote } from '../../src/config/aiTypes';

export class NoteStore {
  constructor(private readonly root: string) {}

  private file(): string { return path.join(this.root, AiConst.MemoryFile); }
  private dir(logId: string): string { return path.join(this.root, AiConst.NotesDir, logId); }

  async list(logId?: string): Promise<AiNote[]> {
    const notes = await this.readNotes();
    const memory = await this.readMemory();
    return [...notes, ...memory].filter((item) => !logId || item.kind === AiNoteKind.Memory || item.logId === logId)
      .sort((a, b) => b.created.localeCompare(a.created));
  }

  async write(kind: AiNoteKind, logId: string, name: string, text: string, tags: string[] = []): Promise<AiNote> {
    const note: AiNote = { id: crypto.randomUUID(), logId, name: name.trim() || (kind === AiNoteKind.Report ? 'RCA 报告' : '笔记'), text, kind, tags, created: new Date().toISOString() };
    if (kind === AiNoteKind.Memory) {
      const all = await this.readMemory();
      all.push(note);
      await this.saveMemory(all);
      return note;
    }
    const dir = this.dir(logId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${note.id}.json`), JSON.stringify(note), 'utf8');
    return note;
  }

  async read(id: string, logId?: string): Promise<AiNote | undefined> {
    return (await this.list(logId)).find((item) => item.id === id);
  }

  async search(query: string, tag?: string): Promise<AiNote[]> {
    const q = query.trim().toLowerCase();
    return (await this.readMemory()).filter((item) => {
      const tags = item.tags.map((value) => value.toLowerCase());
      if (tag && !tags.includes(tag.toLowerCase())) return false;
      if (!q) return true;
      return item.text.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || tags.some((value) => value.includes(q));
    });
  }

  async remove(id: string): Promise<boolean> {
    const memory = await this.readMemory();
    const next = memory.filter((item) => item.id !== id);
    if (next.length !== memory.length) { await this.saveMemory(next); return true; }
    const root = path.join(this.root, AiConst.NotesDir);
    let dirs: string[] = [];
    try { dirs = await fs.readdir(root); } catch { return false; }
    for (const dir of dirs) {
      const file = path.join(root, dir, `${id}.json`);
      try { await fs.unlink(file); return true; } catch { /* next log */ }
    }
    return false;
  }

  async update(id: string, text: string, name?: string): Promise<AiNote | undefined> {
    const memory = await this.readMemory();
    const hit = memory.find((item) => item.id === id);
    if (hit) {
      hit.text = text;
      if (name) hit.name = name;
      await this.saveMemory(memory);
      return hit;
    }
    const root = path.join(this.root, AiConst.NotesDir);
    let dirs: string[] = [];
    try { dirs = await fs.readdir(root); } catch { return undefined; }
    for (const dir of dirs) {
      const file = path.join(root, dir, `${id}.json`);
      try {
        const note = JSON.parse(await fs.readFile(file, 'utf8')) as AiNote;
        note.text = text;
        if (name) note.name = name;
        await fs.writeFile(file, JSON.stringify(note), 'utf8');
        return note;
      } catch { /* next */ }
    }
    return undefined;
  }

  private async readNotes(): Promise<AiNote[]> {
    const root = path.join(this.root, AiConst.NotesDir);
    let dirs: string[] = [];
    try { dirs = await fs.readdir(root); } catch { return []; }
    const notes: AiNote[] = [];
    for (const dir of dirs) {
      let files: string[] = [];
      try { files = await fs.readdir(path.join(root, dir)); } catch { continue; }
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try { notes.push(JSON.parse(await fs.readFile(path.join(root, dir, file), 'utf8')) as AiNote); } catch { /* skip */ }
      }
    }
    return notes;
  }

  private async readMemory(): Promise<AiNote[]> {
    try { return JSON.parse(await fs.readFile(this.file(), 'utf8')) as AiNote[]; } catch { return []; }
  }

  private async saveMemory(notes: AiNote[]): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(this.file(), JSON.stringify(notes), 'utf8');
  }
}
