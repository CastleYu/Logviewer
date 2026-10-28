import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Filter, Terminal } from 'lucide-react';
import { CopyPlacement, FieldFilterKind, FieldRole, LogFieldConfig, LogFormatConfig, RuntimeCopyAction, RuntimeFieldFilters } from '../config/logFormatTypes';
import { DisplayDensity, FilterOptions, LogEntry, ThemeMode } from '../types';
import { copyActions, copyActionsAt } from '../utils/logCopyUtils';
import { distinctFieldValues, isRuntimeFilterActive } from '../utils/configuredFilterUtils';
import { CopyActionPopover, CopyFeedback, HeaderCopyButton, copyActionToClipboard } from './CopyActionPopover';
import { ConfiguredFieldFilterPopover } from './ConfiguredFieldFilterPopover';
import { StackCell } from './StackCell';
import { stackSummary, frameCount } from '../utils/stackParser';
import { HighlightedText } from './HighlightedText';
import { SourceMenuItem } from './SourceNavigation';
import { sourceField } from '../utils/sourceUtils';

interface ConfigurableLogTableProps {
  logs: LogEntry[];
  onOpenStack: (log: LogEntry) => void;
  onAnalyze?: (logs: LogEntry[]) => void;
  optionLogs: LogEntry[];
  format: LogFormatConfig;
  filters: RuntimeFieldFilters;
  onFiltersChange: (filters: RuntimeFieldFilters) => void;
  filter: FilterOptions;
  density: DisplayDensity;
  theme: ThemeMode;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  activeSearchLogId?: number | null;
  columnWidths?: Record<string, number>;
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  jumpToLine?: { line: number; timestamp: number } | null;
  targetNavLog?: { id: number; timestamp: number } | null;
  onFirstVisibleIndexChange?: (index: number) => void;
}

interface FilterTarget {
  field: LogFieldConfig;
  anchor: DOMRect;
}

interface CopyTarget {
  actions: RuntimeCopyAction[];
  anchor: DOMRect;
}

interface ContextTarget {
  field: string;
  x: number;
  y: number;
  log: LogEntry;
}

function rowHeight(density: DisplayDensity): number {
  if (density === 'compact') return 26;
  if (density === 'relaxed') return 38;
  return 32;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function levelClass(level: string, isLight: boolean): string {
  if (level === 'ERROR' || level === 'FATAL') return isLight ? 'bg-rose-50/80 border-rose-200' : 'bg-rose-950/20 border-rose-900/60';
  if (level === 'WARN') return isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/15 border-amber-900/50';
  return isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800';
}

function alignClass(field: LogFieldConfig): string {
  if (field.display?.align === 'center') return 'text-center justify-center';
  if (field.display?.align === 'right') return 'text-right justify-end';
  return 'text-left justify-start';
}

export function ConfigurableLogTable({ logs, onOpenStack, onAnalyze, optionLogs, format, filters, onFiltersChange, filter, density, theme, selectedIds, onSelectionChange, activeSearchLogId, columnWidths = {}, onColumnWidthsChange, jumpToLine, targetNavLog, onFirstVisibleIndexChange }: ConfigurableLogTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const feedbackTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [height, setHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [filterTarget, setFilterTarget] = useState<FilterTarget | null>(null);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const [highlightedLogId, setHighlightedLogId] = useState<number | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
  const [resizing, setResizing] = useState<{ field: LogFieldConfig; startX: number; startWidth: number } | null>(null);
  const isLight = theme === 'light';
  const wordWrap = filter.wordWrap;
  const fields = useMemo(() => format.fields.filter((field) => field.display?.visible !== false), [format.fields]);
  const actions = useMemo(() => copyActions(format), [format]);
  const selectedLogs = useMemo(() => logs.filter((log) => selectedIds.has(log.id)), [logs, selectedIds]);
  const itemHeight = rowHeight(density);
  const fieldWidth = useCallback((field: LogFieldConfig) => Math.max(60, columnWidths[field.id] || field.display?.width || 140), [columnWidths]);
  const rowHeights = useMemo(() => logs.map((entry) => {
    if (!wordWrap) return itemHeight;
    const measured = measuredHeights.get(entry.id);
    if (measured !== undefined) return measured;
    const padding = density === 'compact' ? 4 : density === 'relaxed' ? 12 : 8;
    const lines = fields.reduce((maximum, field) => {
      const text = entry.stack && field.role === FieldRole.Message ? `${stackSummary(entry.stack)} · ${frameCount(entry.stack)} 帧` : entry.success ? cellText(entry.fields?.[field.id]) : field.role === FieldRole.Message ? entry.rawText : '-';
      const count = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor((fieldWidth(field) - 16) / 6.6)))), 0);
      return Math.max(maximum, count);
    }, 1);
    return padding + lines * 16;
  }), [logs, wordWrap, itemHeight, measuredHeights, density, fields, fieldWidth]);
  const offsets = useMemo(() => {
    const values = new Float64Array(logs.length + 1);
    for (let index = 0; index < logs.length; index++) values[index + 1] = values[index] + rowHeights[index];
    return values;
  }, [logs.length, rowHeights]);
  const start = useMemo(() => {
    const target = Math.max(0, scrollTop - 30);
    let low = 0;
    let high = logs.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (offsets[middle + 1] <= target) low = middle + 1; else high = middle;
    }
    return Math.max(0, low - 8);
  }, [scrollTop, offsets, logs.length]);
  const end = useMemo(() => {
    let index = start;
    while (index < logs.length && offsets[index] < scrollTop + height) index++;
    return Math.min(logs.length, index + 8);
  }, [start, logs.length, offsets, scrollTop, height]);
  const visibleLogs = logs.slice(start, end);
  const totalHeight = 30 + (offsets[logs.length] || 0);
  const minWidth = 56 + fields.reduce((sum, field) => sum + fieldWidth(field), 0);
  const contextLogs = contextTarget && selectedIds.has(contextTarget.log.id) && selectedLogs.length > 0 ? selectedLogs : contextTarget ? [contextTarget.log] : [];
  const contextActions = copyActionsAt(actions, CopyPlacement.ContextMenu);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showFeedback = useCallback((next: CopyFeedback) => {
    setFeedback(next);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 2400);
  }, []);

  const highlightLog = useCallback((id: number) => {
    setHighlightedLogId(id);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedLogId((current) => current === id ? null : current), 2200);
  }, []);

  const navigateToIndex = useCallback((index: number) => {
    if (!containerRef.current || !logs[index]) return;
    containerRef.current.scrollTo({ top: Math.max(0, 30 + offsets[index] - height / 3), behavior: 'smooth' });
    highlightLog(logs[index].id);
  }, [offsets, height, logs, highlightLog]);

  useLayoutEffect(() => {
    if (!wordWrap) return;
    const updates = new Map<number, number>();
    for (const entry of visibleLogs) {
      const measured = rowRefs.current.get(entry.id)?.getBoundingClientRect().height;
      if (measured && Math.abs((measuredHeights.get(entry.id) || 0) - measured) > 1) updates.set(entry.id, measured);
    }
    if (updates.size) setMeasuredHeights((current) => new Map([...current, ...updates]));
  }, [visibleLogs, wordWrap, columnWidths, density, measuredHeights]);

  useEffect(() => { setMeasuredHeights(new Map()); }, [logs, wordWrap, density, columnWidths, format.id]);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: MouseEvent) => onColumnWidthsChange?.({ ...columnWidths, [resizing.field.id]: Math.max(60, Math.min(1200, resizing.startWidth + event.clientX - resizing.startX)) });
    const up = () => setResizing(null);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, columnWidths, onColumnWidthsChange]);

  const previousActiveSearch = useRef<number | null>(null);
  useEffect(() => {
    if (activeSearchLogId == null) { previousActiveSearch.current = null; return; }
    if (previousActiveSearch.current === activeSearchLogId) return;
    previousActiveSearch.current = activeSearchLogId;
    const index = logs.findIndex((log) => log.id === activeSearchLogId);
    if (index >= 0) { onSelectionChange(new Set([activeSearchLogId])); navigateToIndex(index); }
  }, [activeSearchLogId, logs, navigateToIndex, onSelectionChange]);

  const previousTargetNav = useRef<{ id: number; timestamp: number } | null>(null);
  useEffect(() => {
    if (!targetNavLog) { previousTargetNav.current = null; return; }
    if (previousTargetNav.current === targetNavLog) return;
    previousTargetNav.current = targetNavLog;
    const index = logs.findIndex((log) => log.id === targetNavLog.id);
    if (index >= 0) navigateToIndex(index);
  }, [targetNavLog, logs, navigateToIndex]);

  const previousJump = useRef<{ line: number; timestamp: number } | null>(null);
  useEffect(() => {
    if (!jumpToLine) { previousJump.current = null; return; }
    if (previousJump.current === jumpToLine) return;
    previousJump.current = jumpToLine;
    const target = jumpToLine.line;
    if (!target || !logs.length) return;
    let index = logs.findIndex((log) => log.stack && log.lineNumber <= target && (log.endLineNumber ?? log.lineNumber) >= target);
    if (index >= 0) onOpenStack(logs[index]);
    else if (target <= logs.length) index = target - 1;
    else index = logs.findIndex((log) => log.lineNumber === target);
    if (index < 0 || index >= logs.length) { showFeedback({ ok: false, message: `未找到第 ${target} 行` }); return; }
    onSelectionChange(new Set([logs[index].id]));
    navigateToIndex(index);
    showFeedback({ ok: true, message: `已跳转至第 ${target} 行` });
  }, [jumpToLine, logs, navigateToIndex, onOpenStack, onSelectionChange, showFeedback]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  useEffect(() => {
    if (!contextTarget) return;
    const close = () => setContextTarget(null);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', key);
    };
  }, [contextTarget]);

  const runCopy = async (action: RuntimeCopyAction, targetLogs: LogEntry[]) => showFeedback(await copyActionToClipboard(action, targetLogs));

  const selectRow = (entry: LogEntry, index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastIndex !== null) {
      const next = new Set(selectedIds);
      const from = Math.min(lastIndex, index);
      const to = Math.max(lastIndex, index);
      for (let current = from; current <= to; current++) next.add(logs[current].id);
      onSelectionChange(next);
    } else if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedIds);
      if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
      onSelectionChange(next);
      setLastIndex(index);
    } else {
      onSelectionChange(new Set([entry.id]));
      setLastIndex(index);
    }
  };

  return (
    <div ref={containerRef} onScroll={(event) => { const top = event.currentTarget.scrollTop; setScrollTop(top); const target = Math.max(0, top - 30); let low = 0; let high = logs.length; while (low < high) { const middle = (low + high) >> 1; if (offsets[middle + 1] <= target) low = middle + 1; else high = middle; } onFirstVisibleIndexChange?.(Math.min(low, Math.max(0, logs.length - 1))); setFilterTarget(null); setCopyTarget(null); setContextTarget(null); }} className={`flex-1 overflow-auto relative select-text ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
      {feedback ? <div role="status" aria-live="polite" className={`fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl ${feedback.ok ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-emerald-700 bg-emerald-950 text-emerald-100' : isLight ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-rose-700 bg-rose-950 text-rose-100'}`}>{feedback.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<span>{feedback.message}</span></div> : null}

      <div style={{ minWidth, height: Math.max(totalHeight, height) }} className="relative">
        <div className={`sticky top-0 z-20 h-[30px] flex items-center border-b font-semibold text-[11px] ${isLight ? 'bg-slate-100/95 border-slate-300 text-slate-700' : 'bg-slate-900/95 border-slate-800 text-slate-300'}`}>
          <div className="w-14 shrink-0 px-2 text-center border-r border-inherit">#</div>
          {fields.map((field) => {
            const runtimeFilter = filters[field.id];
            const active = runtimeFilter ? isRuntimeFilterActive(runtimeFilter) : false;
            const headerActions = copyActionsAt(actions, CopyPlacement.Header, field.id);
            const resetWidth = () => { const next = { ...columnWidths }; delete next[field.id]; onColumnWidthsChange?.(next); };
            return <div key={field.id} data-source-field={field.id} style={{ width: fieldWidth(field), flexGrow: field.display?.grow && columnWidths[field.id] === undefined ? 1 : 0 }} className={`relative shrink-0 h-full flex items-center justify-between gap-1 px-2 border-r border-inherit ${active ? isLight ? 'bg-slate-200' : 'bg-slate-800' : ''}`}><span className="min-w-0 flex-1 truncate" title={field.label}>{field.label}</span><div className="flex shrink-0 items-center gap-0.5">{headerActions.length > 0 ? <HeaderCopyButton label={field.label} isLight={isLight} onClick={(event) => { event.stopPropagation(); setFilterTarget(null); setCopyTarget({ actions: headerActions, anchor: event.currentTarget.getBoundingClientRect() }); }} /> : null}{field.filter.kind !== FieldFilterKind.None && runtimeFilter ? <button type="button" aria-label={`筛选${field.label}`} aria-pressed={active} onClick={(event) => { setCopyTarget(null); setFilterTarget({ field, anchor: event.currentTarget.getBoundingClientRect() }); }} className={`relative h-5 w-5 shrink-0 flex items-center justify-center rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Filter className="w-3 h-3" />{active ? <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-indigo-500" /> : null}</button> : null}</div><div role="separator" aria-orientation="vertical" aria-label={`调整${field.label}列宽`} aria-valuenow={fieldWidth(field)} tabIndex={0} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setResizing({ field, startX: event.clientX, startWidth: fieldWidth(field) }); }} onDoubleClick={(event) => { event.stopPropagation(); resetWidth(); }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onColumnWidthsChange?.({ ...columnWidths, [field.id]: Math.max(60, Math.min(1200, fieldWidth(field) + (event.key === 'ArrowRight' ? 16 : -16) * (event.shiftKey ? 3 : 1))) }); } }} className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize hover:bg-indigo-500/40 focus-visible:bg-indigo-500/40 focus-visible:outline-none" title="拖拽调整列宽，双击恢复默认；方向键微调" /></div>;
          })}
        </div>

        {logs.length === 0 ? <div className="absolute inset-x-0 top-[30px] bottom-0 flex flex-col items-center justify-center text-center"><Terminal className="w-10 h-10 text-slate-400 mb-3" /><p className="text-sm font-medium">没有日志符合当前字段筛选</p></div> : null}

        {visibleLogs.map((entry, offset) => {
          const index = start + offset;
          const selected = selectedIds.has(entry.id);
          const activeSearch = activeSearchLogId === entry.id;
          const padding = density === 'compact' ? 'py-0.5' : density === 'relaxed' ? 'py-1.5' : 'py-1';
          return <div key={entry.id} ref={(node) => { if (node) rowRefs.current.set(entry.id, node); else rowRefs.current.delete(entry.id); }} style={{ top: 30 + offsets[index], height: wordWrap ? undefined : itemHeight }} onClick={(event) => selectRow(entry, index, event)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!selectedIds.has(entry.id)) onSelectionChange(new Set([entry.id])); setContextTarget({ field: sourceField(event), x: Math.min(event.clientX, window.innerWidth - 240), y: Math.min(event.clientY, window.innerHeight - 260), log: entry }); }} className={`absolute left-0 right-0 flex items-stretch border-b text-[11px] font-mono cursor-pointer ${levelClass(entry.fields?.level || '', isLight)} ${selected ? isLight ? 'outline outline-2 -outline-offset-2 outline-indigo-500 bg-slate-200/80' : 'outline outline-2 -outline-offset-2 outline-indigo-500 bg-slate-800/80' : ''} ${activeSearch || highlightedLogId === entry.id ? 'ring-2 ring-inset ring-indigo-500' : ''}`}><div className="w-14 shrink-0 px-2 flex items-center justify-center text-slate-400 border-r border-inherit"><StackCell log={entry} onOpen={onOpenStack} /></div>{fields.map((field) => { const text = entry.stack && field.role === FieldRole.Message ? `${stackSummary(entry.stack)} · ${frameCount(entry.stack)} 帧` : entry.success ? cellText(entry.fields?.[field.id]) : field.role === FieldRole.Message ? entry.rawText : '-'; const cellAction = copyActionsAt(actions, CopyPlacement.Cell, field.id)[0]; return <div key={field.id} data-source-field={field.id} style={{ width: fieldWidth(field), flexGrow: field.display?.grow && columnWidths[field.id] === undefined ? 1 : 0 }} className={`group/cell shrink-0 min-w-0 px-2 flex gap-1 border-r border-inherit ${padding} ${wordWrap ? 'items-start' : 'items-center'} ${alignClass(field)}`} title={text}><span className={`min-w-0 flex-1 ${wordWrap ? 'whitespace-pre-wrap break-all leading-4' : 'truncate'}`}>{entry.stack && field.role === FieldRole.Message ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenStack(entry); }} className={`min-h-6 max-w-full text-left underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'truncate'}`} aria-label={`查看堆栈：${text}`}>{text}</button> : <HighlightedText text={text} highlight={filter.highlightKeyword} matchCase={filter.highlightMatchCase} isRegex={filter.highlightIsRegex} searchHighlight={filter.searchKeyword} searchMatchCase={filter.matchCase} searchIsRegex={filter.isRegex} pinnedHighlights={filter.pinnedHighlights} theme={theme} />}</span>{cellAction ? <button type="button" onClick={(event) => { event.stopPropagation(); runCopy(cellAction, [entry]); }} aria-label={cellAction.label} title={cellAction.label} className="opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 shrink-0 self-center p-0.5 rounded text-slate-400 hover:text-indigo-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Copy className="w-3 h-3" /></button> : null}</div>; })}</div>;
        })}
      </div>

      {contextTarget ? <div role="menu" aria-label="日志复制菜单" style={{ left: contextTarget.x, top: contextTarget.y }} onClick={(event) => event.stopPropagation()} className={`fixed z-[75] w-56 rounded-lg border py-1 shadow-xl ${isLight ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'}`}><div className={`border-b px-3 py-1.5 text-[10px] ${isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>{contextLogs.length > 1 ? `已选中 ${contextLogs.length} 行` : `日志 #${contextTarget.log.lineNumber}`}</div><SourceMenuItem log={contextTarget.log} format={format} field={contextTarget.field} light={isLight} onClose={() => setContextTarget(null)} />{onAnalyze ? <button type="button" role="menuitem" onClick={() => { onAnalyze(contextLogs); setContextTarget(null); }} className="w-full px-3 py-2 text-left text-xs hover:text-indigo-500">AI 分析选中行</button> : null}{contextActions.map((action) => <button key={action.id} type="button" role="menuitem" onClick={async () => { await runCopy(action, contextLogs); setContextTarget(null); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><Copy className="h-3.5 w-3.5 text-indigo-500" /><span className="truncate">{action.label}</span></button>)}</div> : null}
      {filterTarget ? <ConfiguredFieldFilterPopover field={filterTarget.field} filter={filters[filterTarget.field.id]} options={filterTarget.field.filter.kind === FieldFilterKind.Select && filterTarget.field.filter.options ? filterTarget.field.filter.options : distinctFieldValues(optionLogs, filterTarget.field.id)} anchor={filterTarget.anchor} theme={theme} onApply={(next) => onFiltersChange({ ...filters, [filterTarget.field.id]: next })} onClose={() => setFilterTarget(null)} /> : null}
      {copyTarget ? <CopyActionPopover actions={copyTarget.actions} selectedLogs={selectedLogs} filteredLogs={logs} anchor={copyTarget.anchor} theme={theme} onResult={showFeedback} onClose={() => setCopyTarget(null)} /> : null}
    </div>
  );
}
