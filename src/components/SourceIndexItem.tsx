import React from 'react';
import { Folder, RefreshCw, Trash2 } from 'lucide-react';
import { SourceRootInfo } from '../config/sourceTypes';

interface SourceIndexItemProps {
  item: SourceRootInfo;
  busy: boolean;
  light: boolean;
  onRebuild: (path: string) => void;
  onRemove: (path: string) => void;
}

export const SourceIndexItem: React.FC<SourceIndexItemProps> = ({ item, busy, light, onRebuild, onRemove }) => {
  return (
    <li className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
      <Folder className="h-4 w-4 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs" title={item.path}>{item.path}</p>
        <p className={`text-[10px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>{item.count} 个文件</p>
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`重建索引 ${item.path}`}
        onClick={() => onRebuild(item.path)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-white' : 'border-slate-700 hover:bg-slate-800'}`}
      >
        <RefreshCw className="h-3 w-3" />
        重建
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={`移除索引 ${item.path}`}
        onClick={() => onRemove(item.path)}
        className={`rounded-md p-1 disabled:opacity-40 ${light ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-rose-950/40 hover:text-rose-300'}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
};
