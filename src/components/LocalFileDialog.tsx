import React, { useEffect, useState } from 'react';
import { HistoryApi } from '../services/historyApi';
import { type HistoryLog } from '../config/historyTypes';
import { type ThemeMode } from '../types';

export function LocalFileDialog({ theme, formatId, onOpen, onClose }: { theme: ThemeMode; formatId: string; onOpen: (log: HistoryLog) => void; onClose: () => void }) {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true); setError('');
    try { onOpen(await HistoryApi.local(path, formatId)); onClose(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const pick = async () => {
    setBusy(true); setError('');
    try { const result = await HistoryApi.pick(); if (result.path) setPath(result.path); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-label="通过本机路径打开" onSubmit={(event) => { event.preventDefault(); void open(); }} className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 text-ink shadow-[var(--shadow-window)]">
      <h2 className="text-[14px] font-semibold">按本机路径打开</h2>
      <p className="mt-1 text-[12px] text-ink-3">记录完整路径并保存内容快照，之后可在历史中重新打开，也便于源码定位和 AI 分析。</p>
      <label className="mt-4 block"><span className="lv-label">文件绝对路径</span>
        <span className="flex gap-2">
          <input autoFocus value={path} onChange={(e) => setPath(e.target.value)} placeholder="例如 D:/logs/app.log" spellCheck={false} className="lv-input h-9 font-mono" />
          <button type="button" disabled={busy} onClick={() => void pick()} className="lv-btn h-9 shrink-0">浏览…</button>
        </span>
      </label>
      {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="lv-btn">取消</button><button disabled={busy || !path.trim()} className="lv-btn lv-btn-primary">{busy ? '正在打开…' : '打开'}</button></div>
    </form>
  </div>;
}
