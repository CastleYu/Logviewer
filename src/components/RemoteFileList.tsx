import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, File, FileArchive, FileText, Folder, FolderSymlink, Link2 } from 'lucide-react';
import { EntryAction, RemoteDirEntry, RemoteSortKey, RemoteUi } from '../config/fileLoadTypes';
import { formatFileSize } from '../utils/logParser';
import { joinRemotePath } from '../utils/browsePath';

interface RemoteFileListProps {
  path: string;
  entries: RemoteDirEntry[];
  loading: boolean;
  error: string | null;
  query: string;
  hidden: boolean;
  busy: boolean;
  shell: boolean;
  onActivate: (entry: RemoteDirEntry, full: string) => void;
  onAction: (action: EntryAction, entry: RemoteDirEntry, full: string) => void;
  onUp: () => void;
  onRetry: () => void;
}

const logPattern = /\.(log|txt|out|err|json|jsonl|trace|csv)(\.\d+)?$|\.log\.|\.\d+$/i;
const archivePattern = /\.(gz|zip|tar|tgz|bz2|xz|7z)$/i;

export function isDir(entry: RemoteDirEntry): boolean {
  return entry.type === 'dir' || entry.target === 'dir';
}

function stamp(value?: number): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return date.getFullYear() === new Date().getFullYear() ? `${day} ${time}` : `${date.getFullYear()}-${day}`;
}

function icon(entry: RemoteDirEntry) {
  if (entry.type === 'link') return entry.target === 'dir' ? <FolderSymlink className="h-4 w-4 shrink-0 text-amber-500" /> : <Link2 className="h-4 w-4 shrink-0 text-ink-3" />;
  if (entry.type === 'dir') return <Folder className="h-4 w-4 shrink-0 fill-amber-400/25 text-amber-500" />;
  if (archivePattern.test(entry.name)) return <FileArchive className="h-4 w-4 shrink-0 text-violet-500" />;
  if (logPattern.test(entry.name)) return <FileText className="h-4 w-4 shrink-0 text-accent" />;
  return <File className="h-4 w-4 shrink-0 text-ink-3" />;
}

export const RemoteFileList: React.FC<RemoteFileListProps> = ({ path, entries, loading, error, query, hidden, busy, shell, onActivate, onAction, onUp, onRetry }) => {
  const [sort, setSort] = useState<{ key: RemoteSortKey; desc: boolean }>({ key: RemoteSortKey.Name, desc: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: RemoteDirEntry; full: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelected(null); setAll(false); boxRef.current?.scrollTo({ top: 0 }); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [menu]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = entries.filter((entry) => (hidden || !entry.name.startsWith('.')) && (!needle || entry.name.toLowerCase().includes(needle)));
    const factor = sort.desc ? -1 : 1;
    return list.sort((left, right) => {
      const dirs = Number(isDir(right)) - Number(isDir(left));
      if (dirs !== 0) return dirs;
      if (sort.key === RemoteSortKey.Size) return ((left.size || 0) - (right.size || 0)) * factor;
      if (sort.key === RemoteSortKey.Time) return ((left.modifyTime || 0) - (right.modifyTime || 0)) * factor;
      return left.name.localeCompare(right.name, undefined, { numeric: true }) * factor;
    });
  }, [entries, hidden, query, sort]);
  const shown = all ? rows : rows.slice(0, RemoteUi.RenderCap);
  const hiddenCount = entries.filter((entry) => entry.name.startsWith('.')).length;

  const toggleSort = (key: RemoteSortKey) => setSort((value) => ({ key, desc: value.key === key ? !value.desc : key !== RemoteSortKey.Name }));
  const full = (entry: RemoteDirEntry) => joinRemotePath(path, entry.name);

  const onKey = (event: React.KeyboardEvent) => {
    if (menu) return;
    const index = shown.findIndex((entry) => full(entry) === selected);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = shown[Math.max(0, Math.min(shown.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        setSelected(full(next));
        boxRef.current?.querySelector(`[data-name="${CSS.escape(next.name)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter' && index >= 0) {
      event.preventDefault();
      onActivate(shown[index], full(shown[index]));
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      onUp();
    }
  };

  const head = (key: RemoteSortKey, label: string, className: string) => (
    <button type="button" onClick={() => toggleSort(key)} className={`flex items-center gap-1 hover:text-ink ${className}`}>
      {label}
      {sort.key === key ? (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : null}
    </button>
  );

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="max-w-md text-[13px] text-danger">{error}</p>
        <div className="flex gap-2">
          <button type="button" className="lv-btn" onClick={onUp}>返回上级</button>
          <button type="button" className="lv-btn" onClick={onRetry}>重试</button>
        </div>
      </div>
    );
  } else if (loading && entries.length === 0) {
    body = (
      <div className="space-y-1.5 px-3 py-3" aria-label="正在读取目录">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-6 animate-pulse rounded bg-sunken" style={{ width: `${88 - index * 7}%` }} />)}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="px-6 py-12 text-center text-[13px] text-ink-3">
        {query.trim() ? `没有名称包含“${query.trim()}”的项目` : entries.length > 0 ? `只有 ${hiddenCount} 个隐藏项，打开“显示隐藏文件”查看` : '空目录'}
      </p>
    );
  } else {
    body = (
      <ul role="listbox" aria-label="远程目录列表" className="py-1">
        {shown.map((entry) => {
          const target = full(entry);
          const active = selected === target;
          return (
            <li
              key={`${entry.type}:${entry.name}`}
              role="option"
              aria-selected={active}
              data-name={entry.name}
              onClick={() => setSelected(target)}
              onDoubleClick={() => { if (!busy || isDir(entry)) onActivate(entry, target); }}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelected(target);
                setMenu({ x: event.clientX, y: event.clientY, entry, full: target });
              }}
              className={`mx-1 grid cursor-default select-none grid-cols-[minmax(0,1fr)_76px] items-center gap-3 rounded-md px-2.5 py-[5px] text-[12.5px] @[520px]:grid-cols-[minmax(0,1fr)_76px_92px] ${
                active ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-raised'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2" title={entry.name}>
                {icon(entry)}
                <span className="truncate">{entry.name}</span>
                {entry.type === 'link' ? <span className="shrink-0 text-[10px] text-ink-3">链接</span> : null}
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-ink-3">{isDir(entry) ? '' : formatFileSize(entry.size)}</span>
              <span className="hidden text-right font-mono text-[11px] tabular-nums text-ink-3 @[520px]:block">{stamp(entry.modifyTime)}</span>
            </li>
          );
        })}
        {rows.length > shown.length ? (
          <li className="px-3 py-2 text-center">
            <button type="button" className="lv-btn" onClick={() => setAll(true)}>再显示 {rows.length - shown.length} 项（共 {rows.length} 项）</button>
          </li>
        ) : null}
      </ul>
    );
  }

  const menuDir = menu ? isDir(menu.entry) : false;
  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col bg-surface">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_76px] gap-3 border-b border-line px-[18px] py-1.5 text-[11px] font-semibold text-ink-3 @[520px]:grid-cols-[minmax(0,1fr)_76px_92px]">
        {head(RemoteSortKey.Name, '名称', '')}
        {head(RemoteSortKey.Size, '大小', 'justify-end')}
        {head(RemoteSortKey.Time, '修改时间', 'hidden justify-end @[520px]:flex')}
      </div>
      <div ref={boxRef} tabIndex={0} onKeyDown={onKey} className={`min-h-0 flex-1 overflow-auto overscroll-contain outline-none ${loading && entries.length > 0 ? 'opacity-60' : ''}`}>
        {body}
      </div>
      {menu ? (
        <div
          role="menu"
          aria-label="目录项菜单"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 260) }}
          className="lv-menu fixed z-[120] w-52"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menuDir ? (
            <button type="button" role="menuitem" className="lv-menu-item" onClick={() => { setMenu(null); onActivate(menu.entry, menu.full); }}>进入目录</button>
          ) : (
            <>
              <button type="button" role="menuitem" disabled={busy} className="lv-menu-item" onClick={() => { setMenu(null); onAction(EntryAction.Open, menu.entry, menu.full); }}>打开为日志</button>
              <button type="button" role="menuitem" disabled={busy || menu.entry.name.endsWith('.gz')} className="lv-menu-item" onClick={() => { setMenu(null); onAction(EntryAction.Tail, menu.entry, menu.full); }}>只看末尾…</button>
              <button type="button" role="menuitem" disabled={busy} className="lv-menu-item" onClick={() => { setMenu(null); onAction(EntryAction.Save, menu.entry, menu.full); }}>下载到本机</button>
            </>
          )}
          <div className="my-1 h-px bg-line" />
          {shell && !menuDir ? <button type="button" role="menuitem" className="lv-menu-item" onClick={() => { setMenu(null); onAction(EntryAction.Grep, menu.entry, menu.full); }}>在终端中 grep…</button> : null}
          {shell ? <button type="button" role="menuitem" className="lv-menu-item" onClick={() => { setMenu(null); onAction(EntryAction.Insert, menu.entry, menu.full); }}>插入路径到命令行</button> : null}
          <button type="button" role="menuitem" className="lv-menu-item" onClick={() => { setMenu(null); onAction(EntryAction.Copy, menu.entry, menu.full); }}>复制完整路径</button>
        </div>
      ) : null}
    </div>
  );
};
