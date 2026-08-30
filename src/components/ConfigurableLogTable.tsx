import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Filter, Terminal } from 'lucide-react';
import { FieldFilterKind, FieldRole, LogFieldConfig, LogFormatConfig, RuntimeFieldFilters } from '../config/logFormatTypes';
import { DisplayDensity, FilterOptions, LogEntry, ThemeMode } from '../types';
import { distinctFieldValues, isRuntimeFilterActive } from '../utils/configuredFilterUtils';
import { HighlightedText } from './HighlightedText';
import { ConfiguredFieldFilterPopover } from './ConfiguredFieldFilterPopover';

interface ConfigurableLogTableProps {
  logs: LogEntry[];
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
  targetNavLog?: { id: number; timestamp: number } | null;
  onFirstVisibleIndexChange?: (index: number) => void;
}

interface FilterTarget {
  field: LogFieldConfig;
  anchor: DOMRect;
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

export function ConfigurableLogTable({ logs, optionLogs, format, filters, onFiltersChange, filter, density, theme, selectedIds, onSelectionChange, activeSearchLogId, targetNavLog, onFirstVisibleIndexChange }: ConfigurableLogTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [target, setTarget] = useState<FilterTarget | null>(null);
  const isLight = theme === 'light';
  const fields = useMemo(() => format.fields.filter((field) => field.display?.visible !== false), [format.fields]);
  const itemHeight = rowHeight(density);
  const totalHeight = logs.length * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 8);
  const end = Math.min(logs.length, Math.ceil((scrollTop + height) / itemHeight) + 8);
  const visibleLogs = logs.slice(start, end);
  const minWidth = 56 + fields.reduce((sum, field) => sum + (field.display?.width || 140), 0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!targetNavLog || !containerRef.current) return;
    const index = logs.findIndex((log) => log.id === targetNavLog.id);
    if (index >= 0) containerRef.current.scrollTop = Math.max(0, index * itemHeight - height / 3);
  }, [targetNavLog, logs, itemHeight, height]);

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
    <div ref={containerRef} onScroll={(event) => { const top = event.currentTarget.scrollTop; setScrollTop(top); onFirstVisibleIndexChange?.(Math.max(0, Math.floor(top / itemHeight))); setTarget(null); }} className={`flex-1 overflow-auto relative select-text ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
      <div style={{ minWidth, height: Math.max(totalHeight + 30, height) }} className="relative">
        <div className={`sticky top-0 z-20 h-[30px] flex items-center border-b font-semibold text-[11px] ${isLight ? 'bg-slate-100/95 border-slate-300 text-slate-700' : 'bg-slate-900/95 border-slate-800 text-slate-300'}`}>
          <div className="w-14 shrink-0 px-2 text-center border-r border-inherit">#</div>
          {fields.map((field) => {
            const runtimeFilter = filters[field.id];
            const active = runtimeFilter ? isRuntimeFilterActive(runtimeFilter) : false;
            return <div key={field.id} style={{ width: field.display?.width || 140, flexGrow: field.display?.grow ? 1 : 0 }} className={`shrink-0 h-full flex items-center justify-between gap-1 px-2 border-r border-inherit ${active ? 'bg-indigo-500/10' : ''}`}><span className="truncate" title={field.label}>{field.label}</span>{field.filter.kind !== FieldFilterKind.None && runtimeFilter ? <button type="button" aria-label={`筛选${field.label}`} aria-pressed={active} onClick={(event) => setTarget({ field, anchor: event.currentTarget.getBoundingClientRect() })} className={`relative h-5 w-5 shrink-0 flex items-center justify-center rounded cursor-pointer ${active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Filter className="w-3 h-3" />{active ? <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-indigo-500" /> : null}</button> : null}</div>;
          })}
        </div>

        {logs.length === 0 ? <div className="absolute inset-x-0 top-[30px] bottom-0 flex flex-col items-center justify-center text-center"><Terminal className="w-10 h-10 text-slate-400 mb-3" /><p className="text-sm font-medium">没有日志符合当前字段筛选</p></div> : null}

        <div style={{ transform: `translateY(${start * itemHeight}px)` }} className="absolute left-0 right-0 top-[30px]">
          {visibleLogs.map((entry, offset) => {
            const index = start + offset;
            const selected = selectedIds.has(entry.id);
            const activeSearch = activeSearchLogId === entry.id;
            return <div key={entry.id} style={{ height: itemHeight }} onClick={(event) => selectRow(entry, index, event)} className={`flex items-stretch border-b text-[11px] font-mono cursor-pointer ${levelClass(entry.fields?.level || '', isLight)} ${selected ? 'outline outline-2 -outline-offset-2 outline-indigo-500 bg-indigo-500/10' : ''} ${activeSearch ? 'ring-2 ring-inset ring-indigo-500' : ''}`}><div className="w-14 shrink-0 px-2 flex items-center justify-center text-slate-400 border-r border-inherit">{entry.lineNumber}</div>{fields.map((field) => { const text = entry.success ? cellText(entry.fields?.[field.id]) : field.role === FieldRole.Message ? entry.rawText : '-'; return <div key={field.id} style={{ width: field.display?.width || 140, flexGrow: field.display?.grow ? 1 : 0 }} className={`group/cell shrink-0 min-w-0 px-2 flex items-center gap-1 border-r border-inherit ${alignClass(field)}`} title={text}><span className="min-w-0 flex-1 truncate"><HighlightedText text={text} highlight={filter.highlightKeyword} matchCase={filter.highlightMatchCase} isRegex={filter.highlightIsRegex} searchHighlight={filter.searchKeyword} searchMatchCase={filter.matchCase} searchIsRegex={filter.isRegex} pinnedHighlights={filter.pinnedHighlights} theme={theme} /></span>{field.display?.copyable && text !== '-' ? <button type="button" onClick={(event) => { event.stopPropagation(); navigator.clipboard.writeText(text); }} aria-label={`复制${field.label}`} className="opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 shrink-0 p-0.5 rounded text-slate-400 hover:text-indigo-500 cursor-pointer"><Copy className="w-3 h-3" /></button> : null}</div>; })}</div>;
          })}
        </div>
      </div>

      {target ? <ConfiguredFieldFilterPopover field={target.field} filter={filters[target.field.id]} options={target.field.filter.kind === FieldFilterKind.Select && target.field.filter.options ? target.field.filter.options : distinctFieldValues(optionLogs, target.field.id)} anchor={target.anchor} theme={theme} onApply={(next) => onFiltersChange({ ...filters, [target.field.id]: next })} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}
