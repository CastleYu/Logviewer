import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import { RemoteDirEntry } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';
import { formatFileSize } from '../utils/logParser';
import { applyListingAction, listingAction } from '../utils/browseCommands';
import { joinRemotePath } from '../utils/browsePath';

interface RemoteFileExplorerProps {
  theme: ThemeMode;
  busy: boolean;
  listedPath: string;
  entries: RemoteDirEntry[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  onSelected: (path: string | null) => void;
  onEnter: (path: string) => void;
  onOpen: (path: string) => void;
  onRefresh: () => void;
}

interface MenuState {
  x: number;
  y: number;
  entry: RemoteDirEntry;
  full: string;
}

function formatTime(value?: number): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export const RemoteFileExplorer: React.FC<RemoteFileExplorerProps> = ({
  theme,
  busy,
  listedPath,
  entries,
  loading,
  error,
  selected,
  onSelected,
  onEnter,
  onOpen,
  onRefresh,
}) => {
  const light = theme === 'light';
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const rows = useMemo(() => entries.map((entry) => ({
    entry,
    full: joinRemotePath(listedPath || '/', entry.name),
  })), [entries, listedPath]);

  const activate = (entry: RemoteDirEntry) => {
    const action = applyListingAction(listedPath || '/', entry);
    if (action.kind === 'enter') onEnter(action.path);
    else onOpen(action.path);
  };

  return (
    <div className={`relative min-h-0 flex-1 overflow-auto overscroll-contain ${light ? 'bg-white' : 'bg-slate-950/40'}`}>
      {loading && entries.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-slate-500">正在读取目录…</p>
      ) : error ? (
        <p className="px-3 py-8 text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : entries.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-slate-500">目录为空</p>
      ) : (
        <table className="w-full text-left text-xs" aria-label="远程目录列表">
          <thead className={`sticky top-0 text-[10px] uppercase tracking-wide ${light ? 'bg-slate-50 text-slate-500' : 'bg-slate-900 text-slate-400'}`}>
            <tr>
              <th className="px-3 py-1.5 font-semibold">名称</th>
              <th className="w-20 px-2 py-1.5 font-semibold">类型</th>
              <th className="w-24 px-2 py-1.5 font-semibold">大小</th>
              <th className="w-40 px-2 py-1.5 font-semibold">修改时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, full }) => {
              const active = selected === full;
              return (
                <tr
                  key={`${entry.type}:${entry.name}`}
                  onClick={() => onSelected(full)}
                  onDoubleClick={() => activate(entry)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onSelected(full);
                    setMenu({ x: event.clientX, y: event.clientY, entry, full });
                  }}
                  className={`cursor-default select-none ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : light ? 'hover:bg-slate-50 text-slate-800' : 'hover:bg-slate-900 text-slate-200'
                  }`}
                >
                  <td className="flex items-center gap-2 px-3 py-1.5 font-mono">
                    {entry.type === 'dir'
                      ? (active ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />)
                      : <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-500" />}
                    <span className="truncate">{entry.name}</span>
                  </td>
                  <td className={`px-2 py-1.5 ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{entry.type === 'dir' ? '目录' : '文件'}</td>
                  <td className={`px-2 py-1.5 font-mono ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{entry.type === 'dir' ? '' : formatFileSize(entry.size)}</td>
                  <td className={`px-2 py-1.5 font-mono ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{formatTime(entry.modifyTime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {menu ? (
        <div
          role="menu"
          aria-label="目录项菜单"
          style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 160) }}
          className={`fixed z-[80] w-44 rounded-lg border py-1 text-xs shadow-xl ${light ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => { activate(menu.entry); setMenu(null); }}
            className={`flex w-full px-3 py-1.5 text-left ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
          >
            {listingAction(menu.entry) === 'enter' ? '打开目录' : '打开为日志'}
          </button>
          {menu.entry.type === 'dir' ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => { onEnter(menu.full); setMenu(null); }}
              className={`flex w-full px-3 py-1.5 text-left ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
            >
              进入目录
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => { onOpen(menu.full); setMenu(null); }}
              className={`flex w-full px-3 py-1.5 text-left ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
            >
              在主界面打开
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { void navigator.clipboard?.writeText(menu.full); setMenu(null); }}
            className={`flex w-full px-3 py-1.5 text-left ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
          >
            复制路径
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onRefresh(); setMenu(null); }}
            className={`flex w-full px-3 py-1.5 text-left ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
          >
            刷新
          </button>
        </div>
      ) : null}
    </div>
  );
};
