import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderSearch, FolderTree, Monitor, Plus, RefreshCw, X } from 'lucide-react';
import { SourceOpener, SourceState } from '../config/sourceTypes';
import { LogFormatConfig } from '../config/logFormatTypes';
import { SourceApi } from '../services/sourceApi';
import { sourceColumns } from '../utils/sourceUtils';
import { useSource } from './SourceNavigation';
import { PathPicker } from './PathPicker';
import { SourceIndexItem } from './SourceIndexItem';
import { SourceOpenerItem } from './SourceOpenerItem';

export function SourceSettings({ format, light }: { format: LogFormatConfig; light: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="预添加源码目录、构建文件索引并配置 IDE" className="flex h-7 items-center gap-1 rounded-md border border-slate-500/40 px-2 text-xs hover:bg-indigo-500/10">
        <FolderSearch size={14} />源码索引
      </button>
      {open ? <SourceSettingsPanel format={format} light={light} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function SourceSettingsPanel({ format, light, onClose }: { format: LogFormatConfig; light: boolean; onClose: () => void }) {
  const source = useSource();
  const columns = sourceColumns(format, source.columns);
  const [state, setState] = useState<SourceState | null>(null);
  const [draft, setDraft] = useState('');
  const [openers, setOpeners] = useState<SourceOpener[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'project' | 'ide'>('project');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    SourceApi.state()
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setOpeners(data.openers);
        setError(data.error || '');
      })
      .catch((cause) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const items = [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea')];
      if (!items.length) return;
      if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === ref.current)) {
        event.preventDefault();
        items.at(-1)!.focus();
      }
      if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, [busy, onClose]);

  const apply = (next: SourceState, message?: string) => {
    setState(next);
    setOpeners(next.openers);
    setError(next.error || '');
    source.refresh();
    if (message) source.notify(message);
  };

  const run = async (work: () => Promise<SourceState>, message?: string) => {
    setBusy(true);
    setError('');
    try {
      apply(await work(), message);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally { setBusy(false); }
  };

  const addRoot = (pathValue: string) => {
    const path = pathValue.trim();
    if (!path || !state) return;
    void run(() => SourceApi.addRoot(path), '已添加并建立索引').then((ok) => { if (ok) setDraft(''); });
  };

  const persistOpeners = (next: SourceOpener[], message?: string) => {
    setOpeners(next);
    void run(() => SourceApi.saveOpeners(next), message);
  };

  const inputClass = `mt-1 w-full rounded-md border px-2 py-2 text-xs outline-none focus:border-indigo-500 ${light ? 'border-slate-300 bg-white' : 'border-slate-600 bg-slate-950'}`;
  const rootsInfo = state?.rootsInfo || (state?.roots || []).map((path) => ({ path, count: 0 }));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="源码索引设置" className={`max-h-[90vh] w-[640px] max-w-full overflow-auto rounded-xl p-5 shadow-xl outline-none ${light ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-100'}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">源码索引</h2>
          <button aria-label="关闭源码设置" disabled={busy} onClick={onClose} className="rounded p-1 hover:bg-slate-500/20"><X size={18} /></button>
        </div>
        {error ? <p role="alert" className="mb-3 break-words text-sm text-rose-500">{error}</p> : null}
        {!state ? <p role="status">{error ? '请关闭后重试' : '正在读取配置…'}</p> : (
          <div className="space-y-4">
            <div role="tablist" aria-label="源码索引分类" className={`flex gap-1 rounded-lg p-1 ${light ? 'bg-slate-100' : 'bg-slate-800/80'}`}>
              {([['project', '配置项目', FolderTree], ['ide', '配置 IDE', Monitor]] as const).map(([id, label, Icon]) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`source-tab-${id}`}
                    id={`source-tab-btn-${id}`}
                    onClick={() => setTab(id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? light ? 'bg-white text-indigo-700 shadow-sm' : 'bg-slate-900 text-indigo-300 shadow-sm'
                        : light ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {tab === 'ide' ? <section id="source-tab-ide" role="tabpanel" aria-labelledby="source-tab-btn-ide" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">打开程序</h3>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => persistOpeners([...openers, { id: crypto.randomUUID(), name: '', exe: '', pattern: '' }], '已添加打开程序')}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
                  >
                    <Plus className="h-3 w-3" />空白条目
                  </button>
                  <button
                    type="button"
                    disabled={busy || openers.length === 0}
                    onClick={() => void run(() => SourceApi.saveOpeners(openers), '已保存打开程序')}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </div>
              <p className={`text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>每项选择启动程序，并填写后缀（如 .py,.java）或文件名正则。启动时按列表顺序取第一项匹配。</p>
              {openers.length === 0 ? (
                <p className={`rounded-lg border border-dashed px-3 py-5 text-center text-xs ${light ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>尚未配置打开程序，可添加空白条目或使用下方探测结果</p>
              ) : (
                <ul className="space-y-1.5">
                  {openers.map((item) => (
                    <SourceOpenerItem
                      key={item.id}
                      item={item}
                      detected={state.detected}
                      busy={busy}
                      light={light}
                      onChange={(next) => setOpeners(openers.map((entry) => entry.id === next.id ? next : entry))}
                      onRemove={(id) => persistOpeners(openers.filter((entry) => entry.id !== id), '已删除打开程序')}
                      onError={setError}
                    />
                  ))}
                </ul>
              )}
              {state.detected.filter((preset) => !openers.some((item) => item.id === preset.id || item.exe === preset.exe)).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {state.detected.filter((preset) => !openers.some((item) => item.id === preset.id || item.exe === preset.exe)).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={busy}
                      onClick={() => persistOpeners([...openers, { ...preset, id: preset.id }], `已添加 ${preset.name}`)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40 ${light ? 'border-indigo-200 text-indigo-700 hover:bg-indigo-50' : 'border-indigo-900 text-indigo-300 hover:bg-indigo-950/50'}`}
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </section> : <section id="source-tab-project" role="tabpanel" aria-labelledby="source-tab-btn-project">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">索引目录</h3>
                <button
                  type="button"
                  disabled={busy || rootsInfo.length === 0}
                  aria-label="重建全部索引"
                  onClick={() => void run(() => SourceApi.rebuild({ roots: state.roots, openers }), `已重建全部索引：${state.count} 个文件`)}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
                  重建全部
                </button>
              </div>
              {rootsInfo.length === 0 ? (
                <p className={`rounded-lg border border-dashed px-3 py-6 text-center text-xs ${light ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>尚未添加索引目录</p>
              ) : (
                <ul className="space-y-1.5">
                  {rootsInfo.map((item) => (
                    <SourceIndexItem
                      key={item.path}
                      item={item}
                      busy={busy}
                      light={light}
                      onRebuild={(path) => void run(() => SourceApi.rebuildRoot(path), `已重建 ${path}`)}
                      onRemove={(path) => void run(() => SourceApi.removeRoot(path), '已移除索引目录')}
                    />
                  ))}
                </ul>
              )}
              <form
                className="mt-2 flex items-start gap-1.5"
                onSubmit={(event) => { event.preventDefault(); addRoot(draft); }}
              >
                <div className="min-w-0 flex-1">
                  <PathPicker
                    kind="folder"
                    light={light}
                    disabled={busy}
                    value={draft}
                    ariaLabel="新增索引目录"
                    placeholder="绝对路径，或点浏览选择文件夹"
                    onChange={setDraft}
                    onError={setError}
                    onPicked={(path) => { if (path) addRoot(path); }}
                  />
                </div>
                <button type="submit" disabled={busy || !draft.trim()} className="mt-0 h-9 shrink-0 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
                  添加
                </button>
              </form>
              <p className={`mt-1.5 text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>添加后自动建立该目录索引。目录变化后可单独重建，或在列表头重建全部。</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {([['file', '文件名列'], ['line', '源码行号列']] as const).map(([key, label]) => (
                <label key={key} className="text-sm">
                  {label}
                  <select aria-label={label} value={columns[key]} onChange={(event) => source.setColumns(format.id, { ...columns, [key]: event.target.value })} className={inputClass}>
                    <option value="">未设置</option>
                    {format.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <p className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>当前格式：{format.name}。列选择立即生效，仅在这两列的单元格右键菜单显示“打开源码”。</p>
            </section>}
            <p role="status" className="text-xs">{state.count} 个文件 · {state.updated ? new Date(state.updated).toLocaleString() : '尚未构建'}{busy ? ' · 正在构建索引…' : ''}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
