import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, RotateCcw, Trash2, X } from 'lucide-react';
import type { InvestigationView } from '../utils/investigationViews';
import type { ThemeMode } from '../types';

interface InvestigationViewDialogProps {
  views: InvestigationView[];
  sourceName?: string;
  canRestore: boolean;
  theme: ThemeMode;
  onSave: (name: string) => boolean;
  onRestore: (view: InvestigationView) => void;
  onDelete: (id: string) => boolean;
  onClose: () => void;
}

export function InvestigationViewDialog({ views, sourceName, canRestore, theme, onSave, onRestore, onDelete, onClose }: InvestigationViewDialogProps) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const light = theme === 'light';

  useEffect(() => {
    inputRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const success = onSave(name.trim());
    setSaved(success);
    setError(success ? '' : '无法保存视图，请删除旧视图或检查浏览器存储空间。');
    if (success) setName('');
  };

  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="investigation-view-title" className={`flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl ${light ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'}`}>
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div><h2 id="investigation-view-title" className="flex items-center gap-2 text-sm font-semibold"><Bookmark className="h-4 w-4 text-accent-ink" />调查视图</h2><p className="mt-1 text-[11px] leading-relaxed text-ink-3">收藏筛选、高亮、格式与显示设置；不保存日志原文。</p></div>
        <button type="button" onClick={onClose} className="lv-icon-btn" aria-label="关闭调查视图"><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={save} className="border-b border-line px-5 py-4">
        <label htmlFor="investigation-view-name" className="mb-1.5 block text-xs font-medium">保存当前调查设置</label>
        <div className="flex gap-2"><input ref={inputRef} id="investigation-view-name" value={name} maxLength={60} onChange={(event) => { setName(event.target.value); setSaved(false); }} placeholder="例如：支付服务 ERROR 排查" className={`h-9 min-w-0 flex-1 rounded-md border bg-surface px-3 text-xs outline-none focus:border-accent ${light ? 'border-slate-300' : 'border-slate-700'}`} /><button type="submit" disabled={!name.trim()} className="lv-btn lv-btn-primary h-9 px-3">保存视图</button></div>
        <p className="mt-2 text-[11px] text-ink-3">当前原文：<span className="font-medium text-ink-2">{sourceName}</span> · 包含密度、换行、列显示和列宽</p>
        {saved ? <p role="status" className="mt-2 flex items-center gap-1 text-[11px] text-ok"><Check className="h-3.5 w-3.5" />视图已保存到此浏览器</p> : null}
        {error ? <p role="alert" className="mt-2 text-[11px] text-danger">{error}</p> : null}
      </form>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">已保存的视图 <span className="font-mono text-ink-3">{views.length}/50</span></h3><span className="text-[10px] text-ink-3">与原文历史快照分离</span></div>
        {!views.length ? <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-xs text-ink-3">尚未保存调查视图</div> : <ul className="space-y-2">{views.map((view) => <li key={view.id} className="rounded-lg border border-line bg-raised/50 p-3">
          <div className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-xs" title={view.name}>{view.name}</strong><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${canRestore ? 'bg-emerald-500/10 text-ok' : 'bg-amber-500/10 text-amber-600'}`}>{canRestore ? '原文已打开' : sourceName ? '原文解析中' : '原文未打开'}</span></div>
          <p className="mt-1 truncate text-[10px] text-ink-3" title={`${view.sourceName} · ${new Date(view.createdAt).toLocaleString()}`}>保存时文件：{view.sourceName} · {new Date(view.createdAt).toLocaleString()}</p>
          <div className="mt-2.5 flex items-center gap-2"><button type="button" disabled={!canRestore} onClick={() => onRestore(view)} className="lv-btn h-7 gap-1.5 text-[11px]" title={canRestore ? '将设置应用到当前原文，不自动打开其他文件' : '请先打开日志原文并等待解析完成'}><RotateCcw className="h-3.5 w-3.5" />应用到当前原文</button><button type="button" onClick={() => onDelete(view.id)} className="lv-icon-btn ml-auto h-7 w-7 hover:text-danger" aria-label={`删除调查视图 ${view.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
        </li>)}</ul>}
      </div>
      <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">恢复格式会重新解析当前原文；筛选与默认搜索定位算法保持不变。</p>
    </div>
  </div>;
}
