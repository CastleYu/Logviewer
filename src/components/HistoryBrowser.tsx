import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, LoaderCircle, Search } from 'lucide-react';
import { HistoryApi } from '../services/historyApi';
import { HistoryLog } from '../config/historyTypes';
import { ThemeMode } from '../types';
import FloatingPanel from './FloatingPanel';

export interface HistoryBrowserProps { theme: ThemeMode; open: boolean; revision?: string; onClose: () => void; onOpenHistory: (log: HistoryLog) => void }

export const HistoryBrowser: React.FC<HistoryBrowserProps> = ({ theme, open, revision, onClose, onOpenHistory }) => {
  const light = theme === 'light';
  const [query, setQuery] = useState(''); const [logs, setLogs] = useState<HistoryLog[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) return; let active = true; setError(null); setLoading(true); HistoryApi.list().then((items) => { if (active) setLogs(items); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '无法读取历史日志'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [open, revision]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return logs.filter((item) => !needle || `${item.name} ${item.origin} ${item.kind}`.toLowerCase().includes(needle)); }, [logs, query]);
  return <FloatingPanel theme={theme} title="历史日志" open={open} onClose={onClose} width={430} height={500}><div className="flex h-full flex-col p-3">
    <label className={`flex shrink-0 items-center gap-2 rounded-md border px-2 ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`}><Search className="h-3.5 w-3.5 text-slate-400" /><input aria-label="搜索历史日志" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或来源" className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
    <div className="mt-2 min-h-0 flex-1 overflow-auto">{loading ? <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取历史…</div> : error ? <p className="py-8 text-center text-xs text-rose-600">{error}</p> : filtered.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">没有匹配的历史日志</p> : <div className="space-y-1">{filtered.map((item) => <button key={item.id} type="button" onClick={() => onOpenHistory(item)} className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{new Date(item.created).toLocaleString()} · {item.origin || item.kind}</span></span></button>)}</div>}</div>
  </div></FloatingPanel>;
};

export default HistoryBrowser;
