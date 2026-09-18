import React from 'react';
import { Trash2 } from 'lucide-react';
import { SourceOpener } from '../config/sourceTypes';
import { PathPicker } from './PathPicker';

interface SourceOpenerItemProps {
  item: SourceOpener;
  detected: SourceOpener[];
  busy: boolean;
  light: boolean;
  onChange: (item: SourceOpener) => void;
  onRemove: (id: string) => void;
  onError?: (message: string) => void;
}

export const SourceOpenerItem: React.FC<SourceOpenerItemProps> = ({ item, detected, busy, light, onChange, onRemove, onError }) => {
  const field = `h-9 w-full rounded-md border px-2 text-xs outline-none focus:border-indigo-500 ${light ? 'border-slate-300 bg-white' : 'border-slate-600 bg-slate-950'}`;
  return (
    <li className={`space-y-2 rounded-lg border p-2.5 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
      <div className="flex items-center gap-2">
        <input
          aria-label="打开程序名称"
          value={item.name}
          disabled={busy}
          placeholder="名称"
          onChange={(event) => onChange({ ...item, name: event.target.value })}
          className={`${field} max-w-[140px] font-semibold`}
        />
        <select
          aria-label="选择已探测的启动程序"
          disabled={busy || detected.length === 0}
          value={detected.some((preset) => preset.exe === item.exe) ? item.exe : ''}
          onChange={(event) => {
            const preset = detected.find((entry) => entry.exe === event.target.value);
            if (!preset) return;
            onChange({ ...item, name: item.name || preset.name, exe: preset.exe, pattern: item.pattern || preset.pattern });
          }}
          className={`${field} min-w-0 flex-1`}
        >
          <option value="">{detected.length ? '选择已探测程序…' : '未探测到本机程序'}</option>
          {detected.map((preset) => (
            <option key={preset.id + preset.exe} value={preset.exe}>{preset.name} · {preset.exe}</option>
          ))}
        </select>
        <button type="button" disabled={busy} aria-label={`删除打开程序 ${item.name || item.id}`} onClick={() => onRemove(item.id)} className={`rounded-md p-1 disabled:opacity-40 ${light ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-rose-950/40 hover:text-rose-300'}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <label className="block text-[11px]">
        启动程序
        <div className="mt-1">
          <PathPicker
            kind="file"
            fileName="*.exe"
            light={light}
            disabled={busy}
            value={item.exe}
            ariaLabel={`${item.name || '打开程序'} 启动路径`}
            placeholder="绝对路径，或从上方列表选择"
            onChange={(exe) => onChange({ ...item, exe })}
            onError={onError}
          />
        </div>
      </label>
      <label className="block text-[11px]">
        后缀或文件名正则
        <input
          aria-label={`${item.name || '打开程序'} 后缀或正则`}
          value={item.pattern}
          disabled={busy}
          placeholder=".py, .java  或  Controller$|Test.*\.cs"
          onChange={(event) => onChange({ ...item, pattern: event.target.value })}
          className={`${field} mt-1 font-mono`}
        />
      </label>
    </li>
  );
};
