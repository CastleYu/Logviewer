import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CornerDownLeft, Eraser, Square } from 'lucide-react';
import { ExecEventKind, RemoteDirEntry, RemoteUi } from '../config/fileLoadTypes';
import { RemoteFileApi } from '../services/remoteFileApi';
import { RemotePrefs } from '../utils/remotePrefs';
import { completeBrowseInput } from '../utils/browseCommands';
import { middleEllipsis } from '../utils/browsePath';

export interface RemoteConsoleHandle {
  insert: (text: string) => void;
  focus: () => void;
}

interface Block {
  id: number;
  cwd: string;
  command: string;
  out: string;
  code?: number | null;
  error?: string;
  truncated?: boolean;
  running: boolean;
  ms?: number;
}

interface RemoteConsoleProps {
  profileId: string;
  cwd: string;
  entries: RemoteDirEntry[];
  enabled: boolean;
  onCwd: (cwd: string) => void;
  onDone: () => void;
}

const quick = [
  { label: 'ls -lh', command: 'ls -lhA' },
  { label: 'du', command: 'du -sh * 2>/dev/null | sort -h | tail -n 20' },
  { label: 'df -h', command: 'df -h .' },
  { label: '最近修改', command: 'ls -lt | head -n 15' },
];

/**
 * 远程命令行：每条命令一块，保留滚动历史；输出实时流入；命令里的 cd 会同步到文件浏览。
 * 命令在当前浏览目录执行（每条命令都是独立 shell，所以以浏览目录作为“会话”目录）。
 */
export const RemoteConsole = React.forwardRef<RemoteConsoleHandle, RemoteConsoleProps>(({ profileId, cwd, entries, enabled, onCwd, onDone }, ref) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => RemotePrefs.history());
  const [cursor, setCursor] = useState(-1);
  const [hint, setHint] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const running = blocks.some((block) => block.running);

  useImperativeHandle(ref, () => ({
    insert: (text: string) => {
      setInput((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}${text}`);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    focus: () => inputRef.current?.focus(),
  }), []);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [blocks]);

  const patch = (id: number, change: (block: Block) => Block) => setBlocks((items) => items.map((block) => (block.id === id ? change(block) : block)));

  const run = async (raw: string) => {
    const command = raw.trim();
    if (!command || running || !enabled) return;
    if (command === 'clear') { setBlocks([]); setInput(''); return; }
    setHistory(RemotePrefs.remember(command));
    setCursor(-1);
    setInput('');
    setHint('');
    const id = ++seq.current;
    const started = performance.now();
    setBlocks((items) => [...items, { id, cwd, command, out: '', running: true }].slice(-RemoteUi.ConsoleBlocks));
    const controller = new AbortController();
    abortRef.current = controller;
    let nextCwd: string | null = null;
    let ok = false;
    try {
      await RemoteFileApi.execStream(profileId, cwd, command, (event) => {
        if (event.type === ExecEventKind.Out || event.type === ExecEventKind.Err) patch(id, (block) => ({ ...block, out: block.out + event.text }));
        else if (event.type === ExecEventKind.End) {
          nextCwd = event.cwd;
          ok = event.code === 0;
          patch(id, (block) => ({ ...block, code: event.code, truncated: event.truncated }));
        } else if (event.type === ExecEventKind.Fail) patch(id, (block) => ({ ...block, error: event.message }));
      }, controller.signal);
    } catch (cause) {
      const stopped = controller.signal.aborted;
      patch(id, (block) => ({ ...block, error: stopped ? '已停止' : cause instanceof Error ? cause.message : '命令执行失败' }));
    } finally {
      abortRef.current = null;
      patch(id, (block) => ({ ...block, running: false, ms: Math.round(performance.now() - started) }));
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (nextCwd && nextCwd !== cwd) onCwd(nextCwd);
    else if (ok) onDone();
  };

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); void run(input); return; }
    if (event.key === 'Tab') {
      event.preventDefault();
      const result = completeBrowseInput(input, entries);
      setInput(result.input);
      setHint(result.candidates.length > 1 ? result.candidates.slice(0, 40).join('   ') : result.candidates.length === 0 && input.trim() ? '当前目录没有匹配的名称' : '');
      return;
    }
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      const next = Math.min(cursor + 1, history.length - 1);
      setCursor(next);
      setInput(history[history.length - 1 - next]);
      return;
    }
    if (event.key === 'ArrowDown' && cursor >= 0) {
      event.preventDefault();
      const next = cursor - 1;
      setCursor(next);
      setInput(next < 0 ? '' : history[history.length - 1 - next]);
      return;
    }
    if (event.key === 'c' && event.ctrlKey && running) { event.preventDefault(); abortRef.current?.abort(); return; }
    if (event.key === 'l' && event.ctrlKey) { event.preventDefault(); setBlocks([]); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken font-mono text-[12px]">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-2" onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus(); }}>
        {blocks.length === 0 ? (
          <p className="py-1 font-sans text-[11.5px] text-ink-3">
            {enabled ? '命令在当前浏览目录下执行，支持管道与重定向；执行 cd 后文件列表会跟随切换。↑↓ 历史 · Tab 补全 · Ctrl+C 停止 · Ctrl+L 清屏' : 'SMB 共享不支持执行命令，只能浏览和打开文件。'}
          </p>
        ) : null}
        {blocks.map((block) => (
          <div key={block.id} className="mb-2">
            <div className="flex items-baseline gap-2 text-ink-3">
              <span className="shrink-0 text-accent" title={block.cwd}>{middleEllipsis(block.cwd, 32)}</span>
              <span className="shrink-0">$</span>
              <span className="min-w-0 break-all font-semibold text-ink">{block.command}</span>
              <span className="ml-auto shrink-0 text-[10.5px]">
                {block.running ? <span className="animate-pulse text-accent">运行中…</span> : (
                  <>
                    {block.error ? <span className="text-warn">{block.error}</span> : block.code === 0 ? <span className="text-ok">✓</span> : <span className="text-danger">退出码 {block.code ?? '?'}</span>}
                    {block.ms !== undefined ? <span className="ml-2">{block.ms < 1000 ? `${block.ms} ms` : `${(block.ms / 1000).toFixed(1)} s`}</span> : null}
                  </>
                )}
              </span>
            </div>
            {block.out ? <pre className="mt-0.5 whitespace-pre-wrap break-all leading-[1.55] text-ink-2">{block.out}</pre> : null}
            {block.truncated ? <p className="mt-0.5 font-sans text-[11px] text-warn">输出超过 2 MB 已截断并结束命令；请用 head、tail 或 grep 缩小范围。</p> : null}
          </div>
        ))}
      </div>
      {hint ? <p className="shrink-0 truncate border-t border-line px-3 py-1 text-[11px] text-ink-3" title={hint}>{hint}</p> : null}
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-2 py-1.5">
        <span className="max-w-[30%] shrink-0 truncate pl-1 text-accent" title={cwd}>{middleEllipsis(cwd, 28)} $</span>
        <input
          ref={inputRef}
          aria-label="远程命令"
          value={input}
          disabled={!enabled}
          onChange={(event) => { setInput(event.target.value); setHint(''); }}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          placeholder={enabled ? (running ? '等待当前命令结束…' : '输入命令，例如 tail -n 200 app.log | grep ERROR') : 'SMB 不支持命令'}
          className="h-7 min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <div className="hidden shrink-0 gap-1 @[640px]:flex">
          {quick.map((item) => (
            <button key={item.label} type="button" disabled={!enabled || running} onClick={() => void run(item.command)} className="lv-btn h-6 px-2 font-mono text-[11px]">{item.label}</button>
          ))}
        </div>
        {running ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="lv-btn lv-btn-danger h-6 px-2" title="停止 (Ctrl+C)"><Square className="h-3 w-3 fill-current" />停止</button>
        ) : (
          <button type="button" disabled={!enabled || !input.trim()} onClick={() => void run(input)} className="lv-icon-btn h-6 w-6" aria-label="执行"><CornerDownLeft className="h-3.5 w-3.5" /></button>
        )}
        <button type="button" onClick={() => setBlocks([])} className="lv-icon-btn h-6 w-6" aria-label="清屏" title="清屏 (Ctrl+L)"><Eraser className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
});
RemoteConsole.displayName = 'RemoteConsole';
