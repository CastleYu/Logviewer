import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FolderSearch, X } from 'lucide-react';
import { LogFormatConfig } from '../config/logFormatTypes';
import { SourceColumns, SourceConst, SourceMatch, SourceTarget } from '../config/sourceTypes';
import { SourceApi } from '../services/sourceApi';
import { shortPaths, sourceColumns, sourceTarget } from '../utils/sourceUtils';
import { LogEntry } from '../types';

interface Choice { target: SourceTarget; matches: SourceMatch[]; x: number; y: number; light: boolean }
interface SourceContextValue {
  revision: number;
  refresh: () => void;
  columns: Record<string, SourceColumns>;
  setColumns: (id: string, columns: SourceColumns) => void;
  choose: (choice: Choice) => void;
  notify: (message: string) => void;
}
const SourceContext = createContext<SourceContextValue>(null!);

export function useSource() { return useContext(SourceContext); }

export function SourceProvider({ children }: { children: React.ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [columns, setColumns] = useState<Record<string, SourceColumns>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(SourceConst.ColumnsKey) || '{}');
      if (!value || Array.isArray(value) || typeof value !== 'object') return {};
      return Object.fromEntries(Object.entries(value).filter(([, item]) => item && typeof (item as SourceColumns).file === 'string' && typeof (item as SourceColumns).line === 'string'));
    } catch { return {}; }
  });
  const [choice, setChoice] = useState<Choice | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 6000); return () => clearTimeout(timer); }, [message]);
  return <SourceContext.Provider value={{ revision, refresh: () => setRevision((n) => n + 1), columns, setColumns: (id, value) => {
    const next = { ...columns, [id]: value };
    setColumns(next);
    try { localStorage.setItem(SourceConst.ColumnsKey, JSON.stringify(next)); } catch { setMessage('列设置仅在本次会话有效：浏览器存储不可用'); }
  }, choose: setChoice, notify: setMessage }}>{children}{choice ? <SourceChoices choice={choice} onClose={() => setChoice(null)} notify={setMessage} /> : null}{message ? createPortal(<div role="status" className="fixed bottom-5 left-1/2 z-[120] max-w-[90vw] -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">{message}</div>, document.body) : null}</SourceContext.Provider>;
}

export function SourceMenuItem({ log, format, field, light, onClose }: { log: LogEntry; format: LogFormatConfig; field: string; light: boolean; onClose: () => void }) {
  const source = useSource();
  const columns = sourceColumns(format, source.columns);
  const active = !!field && (field === columns.file || field === columns.line);
  const target = sourceTarget(log, columns);
  const [matches, setMatches] = useState<SourceMatch[] | null>(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const tipId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const valid = !!target.file && target.file !== '-' && Number.isSafeInteger(target.line) && target.line > 0 && target.line <= 2147483647;
  useEffect(() => {
    let cancelled = false;
    setMatches(null); setError('');
    if (active && valid) SourceApi.lookup(target.file).then((items) => { if (!cancelled) setMatches(items); }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [active, valid, target.file, source.revision]);
  if (!active) return null;
  const single = matches?.length === 1 ? matches[0] : null;
  const enabled = valid && !!matches?.length && (matches.length > 1 || single?.ready) && !busy && !error;
  const tip = !valid ? '缺少文件名或有效源码行号，请检查源码列设置' : error || (matches === null ? '正在查询目录索引…' : matches.length === 0 ? `没有找到 ${target.file} 的索引，请先添加目录或重建索引` : single ? !single.ide ? '该文件类型不支持打开，仅支持 py / java / c / cpp' : !single.ready ? `唯一匹配：${single.path}；请在源码索引中配置 ${SourceConst.Names[single.ide]}` : `唯一匹配：使用 ${SourceConst.Names[single.ide]} 打开 ${single.path}，定位第 ${target.line} 行` : `找到 ${matches.length} 个同名文件，点击后选择绝对路径，定位第 ${target.line} 行`);
  const run = async () => {
    if (!enabled || !matches) return;
    if (matches.length > 1) {
      const rect = button.current!.getBoundingClientRect();
      source.choose({ target, matches, x: rect.left, y: rect.top, light }); onClose();
    } else {
      setBusy(true);
      try { source.notify((await SourceApi.open(target, matches[0].path)).message); onClose(); }
      catch (e) { source.notify((e as Error).message); }
      finally { setBusy(false); }
    }
  };
  const rect = button.current?.getBoundingClientRect();
  return <><button ref={button} type="button" role="menuitem" aria-disabled={!enabled} aria-describedby={tipId} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} onClick={run} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${enabled ? light ? 'hover:bg-slate-100' : 'hover:bg-slate-800' : 'cursor-not-allowed opacity-60'}`}><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span>{busy ? '正在打开…' : '打开源码'}</span></button><span id={tipId} className="sr-only">{tip}</span>{hover && rect ? createPortal(<div role="tooltip" style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)), top: rect.top > window.innerHeight / 2 ? undefined : rect.bottom + 6, bottom: rect.top > window.innerHeight / 2 ? window.innerHeight - rect.top + 6 : undefined }} className="pointer-events-none fixed z-[130] w-[340px] max-w-[calc(100vw-16px)] break-words rounded-md bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">{tip}</div>, document.body) : null}</>;
}

export function SourceChoices({ choice, onClose, notify }: { choice: Choice; onClose: () => void; notify: (message: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const labels = shortPaths(choice.matches.map((item) => item.path));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  return createPortal(<div ref={ref} tabIndex={-1} role="dialog" aria-label="选择源码文件" style={{ left: Math.max(8, Math.min(choice.x, window.innerWidth - 528)), top: Math.max(8, Math.min(choice.y, window.innerHeight - 340)) }} className={`fixed z-[110] w-[520px] max-w-[calc(100vw-16px)] rounded-xl p-3 shadow-xl focus:outline-none ${choice.light ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-100'}`}><div className="mb-2 flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold"><FolderSearch size={16} />选择源码文件 · {choice.matches.length} 个匹配</span><button aria-label="关闭源码选择" onClick={onClose} className="rounded p-1 hover:bg-slate-500/20"><X size={16} /></button></div><p className="mb-2 text-xs">{choice.target.file} · 第 {choice.target.line} 行</p><div className="max-h-60 overflow-auto">{choice.matches.map((item, i) => <button key={item.path} disabled={busy || !item.ready} title={`${item.path}\n${item.ide ? item.ready ? `使用 ${SourceConst.Names[item.ide]} 打开第 ${choice.target.line} 行` : `请先配置 ${SourceConst.Names[item.ide]}` : '不支持的文件类型'}`} onClick={async () => { setBusy(true); try { notify((await SourceApi.open(choice.target, item.path)).message); onClose(); } catch (e) { notify((e as Error).message); } finally { setBusy(false); } }} className="block w-full rounded-md px-2 py-2 text-left hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><span className="block break-all font-mono text-xs">{labels[i]}</span><span className="text-xs">{item.ide ? SourceConst.Names[item.ide] : '未映射程序'}{!item.ready ? ' · 请先配置程序' : ''}</span></button>)}</div></div>, document.body);
}
