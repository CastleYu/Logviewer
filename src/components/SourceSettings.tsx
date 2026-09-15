import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderSearch, X } from 'lucide-react';
import { SourceConst, SourceIde, SourceState } from '../config/sourceTypes';
import { LogFormatConfig } from '../config/logFormatTypes';
import { SourceApi } from '../services/sourceApi';
import { sourceColumns } from '../utils/sourceUtils';
import { useSource } from './SourceNavigation';

export function SourceSettings({ format, light }: { format: LogFormatConfig; light: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} title="预添加源码目录、构建文件索引并配置 IDE" className="flex h-7 items-center gap-1 rounded-md border border-slate-500/40 px-2 text-xs hover:bg-indigo-500/10"><FolderSearch size={14} />源码索引</button>{open ? <SourceSettingsPanel format={format} light={light} onClose={() => setOpen(false)} /> : null}</>;
}

export function SourceSettingsPanel({ format, light, onClose }: { format: LogFormatConfig; light: boolean; onClose: () => void }) {
  const source = useSource();
  const columns = sourceColumns(format, source.columns);
  const [state, setState] = useState<SourceState | null>(null);
  const [roots, setRoots] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    SourceApi.state().then((data) => { if (!cancelled) { setState(data); setRoots(data.roots.join('\n')); setError(data.error || ''); } }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const items = [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea')];
        if (!items.length) return;
        if (e.shiftKey && (document.activeElement === items[0] || document.activeElement === ref.current)) { e.preventDefault(); items.at(-1)!.focus(); }
        if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [busy, onClose]);
  const inputClass = `mt-1 w-full rounded-md border px-2 py-2 text-xs outline-none focus:border-indigo-500 ${light ? 'border-slate-300 bg-white' : 'border-slate-600 bg-slate-950'}`;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="源码索引设置" className={`max-h-[90vh] w-[620px] max-w-full overflow-auto rounded-xl p-5 shadow-xl outline-none ${light ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-100'}`}><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">源码索引</h2><button aria-label="关闭源码设置" disabled={busy} onClick={onClose} className="rounded p-1 hover:bg-slate-500/20"><X size={18} /></button></div>{error ? <p role="alert" className="mb-3 break-words text-sm text-rose-500">{error}</p> : null}{!state ? <p role="status">{error ? '请关闭后重试' : '正在读取配置…'}</p> : <form onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const next = await SourceApi.rebuild({ roots: roots.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), programs: state.programs }); setState(next); setRoots(next.roots.join('\n')); source.refresh(); source.notify(`索引构建完成：${next.count} 个文件`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-4"><label className="block text-sm">源码目录（每行一个绝对路径）<textarea aria-label="源码目录" rows={4} value={roots} onChange={(e) => setRoots(e.target.value)} placeholder="例如 H:\Projects\Backend" className={`${inputClass} font-mono`} /></label><p className="text-xs">递归索引所有文件，保留重名文件；不跟随符号链接。目录变动后点击重建。</p><div className="grid gap-3">{Object.values(SourceIde).map((ide) => <label key={ide} className="block text-sm">{SourceConst.Names[ide]} 程序路径<input aria-label={`${SourceConst.Names[ide]} 程序路径`} value={state.programs[ide]} onChange={(e) => setState({ ...state, programs: { ...state.programs, [ide]: e.target.value } })} placeholder={SourceConst.Exe[ide]} className={`${inputClass} font-mono`} /></label>)}</div><div className="grid grid-cols-2 gap-3">{([['file', '文件名列'], ['line', '源码行号列']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<select aria-label={label} value={columns[key]} onChange={(e) => source.setColumns(format.id, { ...columns, [key]: e.target.value })} className={inputClass}><option value="">未设置</option>{format.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>)}</div><p className="text-xs">当前格式：{format.name}。列选择立即生效，仅在这两列的单元格右键菜单显示“打开源码”。</p><div className="flex flex-wrap items-center justify-between gap-2"><span role="status" className="text-xs">{state.count} 个文件 · {state.updated ? new Date(state.updated).toLocaleString() : '尚未构建'}</span><button type="submit" className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? '正在构建索引…' : '保存并重建索引'}</button></div></fieldset></form>}</div></div>, document.body);
}
