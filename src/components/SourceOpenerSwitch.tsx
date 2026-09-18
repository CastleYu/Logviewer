import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SourceOpener } from '../config/sourceTypes';
import { majorityOpener } from '../utils/openerMatch';
import { useSource } from './SourceNavigation';

function shortName(opener: SourceOpener | null, fallback: string): string {
  if (!opener) return fallback;
  return opener.name || opener.exe.split(/[/\\]/).pop() || fallback;
}

export function SourceOpenerSwitch({ files, light }: { files: string[]; light: boolean }) {
  const source = useSource();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const auto = majorityOpener(files, source.openers);
  const current = (source.overrideId && source.openers.find((item) => item.id === source.overrideId)) || auto;
  const label = source.overrideId ? shortName(current, '临时指定') : shortName(auto, files.length ? '无匹配' : '自动');

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="当前打开程序"
        title={current?.exe || '根据当前日志中的源文件匹配打开程序，可临时指定'}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-7 max-w-[180px] items-center gap-1 rounded-md border px-2 text-xs ${light ? 'border-slate-500/40 hover:bg-indigo-500/10' : 'border-slate-500/40 hover:bg-indigo-500/10'}`}
      >
        <span className={`flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold ${light ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'}`}>
          {(current?.name || 'A').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </button>
      {open ? (
        <ul role="listbox" aria-label="选择打开程序" className={`absolute left-0 top-full z-[80] mt-1 w-64 overflow-hidden rounded-lg border py-1 text-xs shadow-xl ${light ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'}`}>
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!source.overrideId}
              onClick={() => { source.setOverrideId(null); setOpen(false); }}
              className={`flex w-full flex-col px-3 py-1.5 text-left ${!source.overrideId ? 'bg-indigo-500/15' : light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
            >
              <span className="font-semibold">自动</span>
              <span className={light ? 'text-slate-500' : 'text-slate-400'}>{auto ? `当前日志倾向 ${shortName(auto, '')}` : '按后缀/正则匹配'}</span>
            </button>
          </li>
          {source.openers.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={source.overrideId === item.id}
                disabled={!item.exe}
                onClick={() => { source.setOverrideId(item.id); setOpen(false); }}
                className={`flex w-full flex-col px-3 py-1.5 text-left disabled:opacity-40 ${source.overrideId === item.id ? 'bg-indigo-500/15' : light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
              >
                <span className="font-semibold">{shortName(item, item.id)}</span>
                <span className={`truncate font-mono ${light ? 'text-slate-500' : 'text-slate-400'}`}>{item.pattern || '未设置后缀'}{item.exe ? '' : ' · 未配置程序'}</span>
              </button>
            </li>
          ))}
          {source.openers.length === 0 ? <li className={`px-3 py-2 ${light ? 'text-slate-500' : 'text-slate-400'}`}>请先在源码索引中添加打开程序</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
