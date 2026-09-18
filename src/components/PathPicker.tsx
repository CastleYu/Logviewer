import React, { useState } from 'react';
import { FolderOpen, FileSearch } from 'lucide-react';
import { SourceApi } from '../services/sourceApi';

interface PathPickerProps {
  value: string;
  onChange: (value: string) => void;
  kind: 'folder' | 'file';
  fileName?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  light: boolean;
  onPicked?: (path: string) => void;
  onError?: (message: string) => void;
}

export function PathPicker({ value, onChange, kind, fileName, disabled, placeholder, ariaLabel, light, onPicked, onError }: PathPickerProps) {
  const [picking, setPicking] = useState(false);
  const field = `h-9 w-full rounded-md border px-2 font-mono text-xs outline-none focus:border-indigo-500 ${light ? 'border-slate-300 bg-white' : 'border-slate-600 bg-slate-950'}`;
  const pick = async () => {
    if (disabled || picking) return;
    setPicking(true);
    try {
      const selected = kind === 'folder' ? await SourceApi.pickFolder() : await SourceApi.pickFile(fileName);
      if (!selected) return;
      onChange(selected);
      onPicked?.(selected);
    } finally {
      setPicking(false);
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={field}
      />
      <button
        type="button"
        onClick={() => { void pick().catch((cause) => onError?.(cause instanceof Error ? cause.message : '无法打开选择对话框')); }}
        disabled={disabled || picking}
        aria-label={`浏览${kind === 'folder' ? '文件夹' : '文件'}`}
        className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-600 hover:bg-slate-800'}`}
      >
        {kind === 'folder' ? <FolderOpen className="h-3.5 w-3.5" /> : <FileSearch className="h-3.5 w-3.5" />}
        {picking ? '选择中…' : '浏览'}
      </button>
    </div>
  );
}
