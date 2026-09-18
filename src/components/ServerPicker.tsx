import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SftpProfileView } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';
import { filterServerProfiles } from '../utils/remoteExec';

interface ServerPickerProps {
  profiles: SftpProfileView[];
  value: string;
  theme: ThemeMode;
  disabled?: boolean;
  onChange: (profile: SftpProfileView) => void;
}

export const ServerPicker: React.FC<ServerPickerProps> = ({ profiles, value, theme, disabled, onChange }) => {
  const light = theme === 'light';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = profiles.find((item) => item.id === value) || profiles[0];
  const filtered = useMemo(() => filterServerProfiles(profiles, query), [profiles, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);

  const pick = (item: SftpProfileView) => {
    onChange(item);
    setOpen(false);
    setQuery('');
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  const label = current
    ? `${current.name}${current.protocol === 'smb' ? ' · SMB' : ''}${current.ready ? '' : '（未配置）'}`
    : '选择服务器';

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-[200px] flex-1">
      <button
        type="button"
        aria-label="浏览服务器"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || profiles.length === 0}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 w-full items-center gap-1 rounded-md border px-2 text-left text-[11px] outline-none disabled:opacity-40 ${
          light ? 'border-slate-300 bg-white hover:border-indigo-300' : 'border-slate-700 bg-slate-950 hover:border-indigo-700'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      {open ? (
        <div className={`absolute left-0 top-full z-[90] mt-1 w-64 overflow-hidden rounded-lg border shadow-xl ${light ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
          <input
            ref={inputRef}
            aria-label="搜索服务器"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKey}
            placeholder="键入名称筛选…"
            className={`h-8 w-full border-b px-2.5 text-[11px] outline-none ${light ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'}`}
          />
          <ul role="listbox" aria-label="服务器列表" className="max-h-48 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className={`px-2.5 py-2 text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>没有匹配的服务器</li>
            ) : filtered.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === current?.id}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(item)}
                  className={`flex w-full flex-col px-2.5 py-1.5 text-left text-[11px] ${
                    index === active
                      ? 'bg-indigo-600 text-white'
                      : item.id === current?.id
                        ? light ? 'bg-indigo-50 text-indigo-800' : 'bg-indigo-950/40 text-indigo-200'
                        : light ? 'hover:bg-slate-50 text-slate-800' : 'hover:bg-slate-800 text-slate-100'
                  }`}
                >
                  <span className="truncate font-semibold">{item.name}{item.protocol === 'smb' ? ' · SMB' : ''}</span>
                  <span className={`truncate ${index === active ? 'text-indigo-100' : light ? 'text-slate-500' : 'text-slate-400'}`}>{item.ready ? item.root : '未配置'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
