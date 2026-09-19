import React, { useState } from 'react';
import { HistoryApi } from '../services/historyApi';
import { type HistoryLog } from '../config/historyTypes';
import { type ThemeMode } from '../types';

export function LocalFileDialog({ theme, formatId, onOpen, onClose }: { theme: ThemeMode; formatId: string; onOpen: (log: HistoryLog) => void; onClose: () => void }) {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const light = theme === 'light';
  const open = async () => {
    setBusy(true); setError('');
    try { onOpen(await HistoryApi.local(path, formatId)); onClose(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const pick = async () => {
    setBusy(true); setError('');
    try { const result = await HistoryApi.pick(); if (result.path) setPath(result.path); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/50 p-4"><form role="dialog" aria-modal="true" aria-label="通过本地路径打开" onSubmit={(event) => { event.preventDefault(); void open(); }} className={`w-full max-w-lg rounded-xl p-5 shadow-xl ${light ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
    <h2 className="mb-3 text-sm font-semibold">通过本地路径打开</h2>
    <p className="mb-3 text-xs text-slate-500">历史记录将保留文件完整路径和本次内容快照。</p>
    <label className="block text-xs">文件绝对路径<input autoFocus value={path} onChange={(e) => setPath(e.target.value)} className={`mt-2 w-full rounded-lg border p-2 font-mono text-sm ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`} /></label>
    {error ? <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p> : null}
    <div className="mt-4 flex flex-wrap justify-end gap-2 text-xs"><button type="button" disabled={busy} onClick={() => void pick()} className="mr-auto rounded-lg border px-3 py-2">浏览本机</button><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border px-3 py-2">取消</button><button disabled={busy || !path.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">{busy ? '正在打开…' : '打开'}</button></div>
  </form></div>;
}
