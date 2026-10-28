import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, ChevronUp, Copy, Download, Eye, Filter, Grid, Hash,
  Highlighter, ListFilter, Pin, Plus, Search, SlidersHorizontal, WrapText, X,
} from 'lucide-react';
import {
  BorderIntensity, ColumnFilterKey, ColumnVisibility, DisplayDensity, FilterOptions,
  FilterValue, LogEntry, LogStats, PinnedHighlight, TextColumnFilter, ThemeMode,
} from '../types';
import {
  FieldFilterKind, LogFieldConfig, LogFormatConfig, RuntimeFieldFilter, RuntimeFilterSummary,
} from '../config/logFormatTypes';
import { HIGHLIGHT_COLOR_PRESETS } from '../utils/highlightColors';
import {
  createNumericFilter, createTextFilter, isNumericFilterActive, isTextFilterActive,
} from '../utils/columnFilterUtils';
import { distinctFieldValues } from '../utils/configuredFilterUtils';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import { ConfiguredFieldFilterPopover } from './ConfiguredFieldFilterPopover';
import { DateRangeFilter } from './DateRangeFilter';

interface ToolbarProps {
  filter: FilterOptions;
  onFilterChange: (updated: Partial<FilterOptions>) => void;
  density: DisplayDensity;
  onDensityChange: (density: DisplayDensity) => void;
  columnVisibility: ColumnVisibility;
  onColumnVisibilityChange: (cols: ColumnVisibility) => void;
  stats: LogStats | null;
  filteredCount: number;
  uniqueModules: string[];
  uniqueThreads: string[];
  timeRange: [number, number] | null;
  selectedCount: number;
  onCopySelected: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onCopyFilteredRaw: () => void;
  totalMatches: number;
  currentMatchIndex: number;
  onTriggerSearch: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  theme: ThemeMode;
  borderIntensity?: BorderIntensity;
  onBorderIntensityChange?: (intensity: BorderIntensity) => void;
  onResetColumnWidths?: () => void;
  onOpenInvestigationViews: () => void;
  onJumpToLine?: (lineNumber: number) => void;
  legacyBoldSelection?: boolean;
  onLegacyBoldSelectionChange?: (val: boolean) => void;
  legacyHighlightStyle?: boolean;
  onLegacyHighlightStyleChange?: (val: boolean) => void;
  showLegacyFilters?: boolean;
  searchableFields?: Array<{ key: string; label: string }>;
  configuredFilterItems?: RuntimeFilterSummary[];
  onClearConfiguredFilter?: (fieldId: string) => void;
  onClearAllConfiguredFilters?: () => void;
  format: LogFormatConfig;
  logs: LogEntry[];
}

type Menu = 'add' | 'view' | 'export' | 'columns' | 'searchColumns' | 'range' | null;
type Editor = { kind: 'builtin'; key: ColumnFilterKey; anchor: DOMRect } | { kind: 'configured'; field: LogFieldConfig; anchor: DOMRect } | null;
type Condition = RuntimeFilterSummary & { kind: 'builtin' | 'configured' | 'range'; column?: ColumnFilterKey };

const searchBuiltinColumns = [
  { key: 'ALL', label: '全部列 / 原始文本' },
  { key: 'operationDesc', label: '操作描述' }, { key: 'requestId', label: '请求ID' },
  { key: 'level', label: '日志级别' }, { key: 'module', label: '模块' },
  { key: 'functionName', label: '函数名' }, { key: 'threadId', label: '线程ID' },
  { key: 'fileName', label: '文件名' }, { key: 'lineNumber', label: '行号' },
  { key: 'memoryAddress', label: '内存地址' }, { key: 'timestamp', label: '时间戳' },
];
const columnLabels: Array<{ key: keyof ColumnVisibility; label: string }> = [
  { key: 'index', label: '序号' }, { key: 'timestamp', label: '时间戳' },
  { key: 'level', label: '级别' }, { key: 'requestId', label: '请求ID' },
  { key: 'operationDesc', label: '操作描述' }, { key: 'functionName', label: '函数名' },
  { key: 'threadId', label: '线程ID' }, { key: 'memoryAddress', label: '内存地址' },
  { key: 'module', label: '模块' }, { key: 'fileName', label: '文件名' }, { key: 'lineNumber', label: '行号' },
];
const builtinFilters: Array<{ key: ColumnFilterKey; label: string }> = [
  { key: ColumnFilterKey.Level, label: '级别' }, { key: ColumnFilterKey.Module, label: '模块' },
  { key: ColumnFilterKey.ThreadId, label: '线程' }, { key: ColumnFilterKey.Timestamp, label: '时间范围' },
  { key: ColumnFilterKey.Index, label: '序号范围' }, { key: ColumnFilterKey.RequestId, label: '请求ID' },
  { key: ColumnFilterKey.OperationDesc, label: '操作描述' }, { key: ColumnFilterKey.FunctionName, label: '函数名' },
  { key: ColumnFilterKey.FileName, label: '文件名' }, { key: ColumnFilterKey.MemoryAddress, label: '内存地址' },
];
const textColumns = [ColumnFilterKey.RequestId, ColumnFilterKey.OperationDesc, ColumnFilterKey.FunctionName, ColumnFilterKey.MemoryAddress, ColumnFilterKey.FileName];

function textCondition(value: TextColumnFilter, key: ColumnFilterKey, label: string): Condition | null {
  if (!isTextFilterActive(value)) return null;
  return { key, kind: 'builtin', column: key, label, summary: `${value.isRegex ? '正则' : value.matchCase ? '区分大小写' : '包含'}：${value.value}` };
}

function activeConditions(filter: FilterOptions, legacy: boolean, configured: RuntimeFilterSummary[]): Condition[] {
  if (!legacy) return [
    ...configured.map((item) => ({ ...item, kind: 'configured' as const })),
    ...(filter.rangeKeyword ? [{ key: 'range', kind: 'range' as const, label: '首末区间', summary: filter.rangeKeyword }] : []),
  ];
  const result: Condition[] = [];
  if (isNumericFilterActive(filter.columnFilters.index)) result.push({ key: 'index', kind: 'builtin', column: ColumnFilterKey.Index, label: '序号', summary: `${filter.columnFilters.index.min || '起点'} – ${filter.columnFilters.index.max || '末尾'}` });
  if (filter.startTime || filter.endTime) result.push({ key: 'timestamp', kind: 'builtin', column: ColumnFilterKey.Timestamp, label: '时间', summary: `${filter.startTime || '最早'} → ${filter.endTime || '最晚'}` });
  const levels = filter.selectedLevels.filter((value) => value !== FilterValue.All);
  if (levels.length) result.push({ key: 'level', kind: 'builtin', column: ColumnFilterKey.Level, label: '级别', summary: levels.map((value) => value === FilterValue.FailedOnly ? '解析失败' : value).join('、') });
  if (filter.selectedModule !== FilterValue.All) result.push({ key: 'module', kind: 'builtin', column: ColumnFilterKey.Module, label: '模块', summary: filter.selectedModule });
  if (filter.selectedThread !== FilterValue.All) result.push({ key: 'thread', kind: 'builtin', column: ColumnFilterKey.ThreadId, label: '线程', summary: filter.selectedThread });
  const entries: Array<[ColumnFilterKey, string, TextColumnFilter]> = [
    [ColumnFilterKey.RequestId, '请求ID', filter.columnFilters.requestId],
    [ColumnFilterKey.OperationDesc, '操作描述', filter.columnFilters.operationDesc],
    [ColumnFilterKey.FunctionName, '函数名', filter.columnFilters.functionName],
    [ColumnFilterKey.MemoryAddress, '内存地址', filter.columnFilters.memoryAddress],
    [ColumnFilterKey.FileName, '文件名', filter.columnFilters.fileName],
  ];
  entries.forEach(([key, label, value]) => { const item = textCondition(value, key, label); if (item) result.push(item); });
  if (filter.rangeKeyword) result.push({ key: 'range', kind: 'range', label: '首末区间', summary: filter.rangeKeyword });
  return result;
}

export const Toolbar: React.FC<ToolbarProps> = (props) => {
  const {
    filter, onFilterChange, density, onDensityChange, columnVisibility, onColumnVisibilityChange,
    stats, filteredCount, uniqueModules, uniqueThreads, timeRange, onExportJSON, onExportCSV,
    onCopyFilteredRaw, totalMatches, currentMatchIndex, onTriggerSearch, onNextMatch, onPrevMatch,
    theme, borderIntensity = 'medium', onBorderIntensityChange, onResetColumnWidths, onJumpToLine,
    legacyBoldSelection = false, onLegacyBoldSelectionChange, legacyHighlightStyle = false,
    onLegacyHighlightStyleChange, showLegacyFilters = true, searchableFields, configuredFilterItems = [],
    onClearConfiguredFilter, onClearAllConfiguredFilters, format, logs,
  } = props;
  const [menu, setMenu] = useState<Menu>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [searchMode, setSearchMode] = useState<'navigate' | 'highlight'>('navigate');
  const [jumpInput, setJumpInput] = useState('');
  const [jumpError, setJumpError] = useState('');
  const [copied, setCopied] = useState(false);
  const [colorPin, setColorPin] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<HTMLInputElement>(null);
  const light = theme === 'light';
  const pins = filter.pinnedHighlights || [];
  const conditions = useMemo(() => activeConditions(filter, showLegacyFilters, configuredFilterItems), [filter, showLegacyFilters, configuredFilterItems]);
  const searchColumns = searchableFields ? [{ key: 'ALL', label: '全部列 / 原始文本' }, ...searchableFields] : searchBuiltinColumns;
  const selectedColumns = filter.searchColumns?.length ? filter.searchColumns : [filter.searchColumn || 'ALL'];
  const searchColumnLabel = selectedColumns.includes('ALL') ? '全部列' : selectedColumns.length === 1 ? searchColumns.find((item) => item.key === selectedColumns[0])?.label || selectedColumns[0] : `${selectedColumns.length} 列`;
  const invalidSearchRegex = searchMode === 'navigate' && filter.isRegex && filter.searchKeyword.trim() ? (() => { try { new RegExp(filter.searchKeyword); return false; } catch { return true; } })() : false;
  const invalidHighlightRegex = searchMode === 'highlight' && filter.highlightIsRegex && filter.highlightKeyword.trim() ? (() => { try { new RegExp(filter.highlightKeyword); return false; } catch { return true; } })() : false;
  const input = `h-8 rounded-md border bg-surface px-2 font-mono text-xs text-ink outline-none placeholder:text-ink-3 focus:border-accent ${light ? 'border-slate-300' : 'border-slate-700'}`;
  const quietButton = 'lv-btn h-8 shrink-0 px-2';
  const menuClass = 'lv-menu absolute top-full z-[100] mt-1.5 p-1.5';

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setMenu(null); setColorPin(null); } };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenu(null); setEditor(null); setColorPin(null); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); jumpRef.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && logs.length) {
        event.preventDefault(); setSearchMode('navigate'); document.getElementById('log-investigation-search')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); };
  }, [logs.length]);

  const openBuiltin = (key: ColumnFilterKey, target: HTMLElement) => { setEditor({ kind: 'builtin', key, anchor: target.getBoundingClientRect() }); setMenu(null); };
  const openConfigured = (field: LogFieldConfig, target: HTMLElement) => { setEditor({ kind: 'configured', field, anchor: target.getBoundingClientRect() }); setMenu(null); };
  const openCondition = (condition: Condition, target: HTMLElement) => {
    if (condition.kind === 'range') { setMenu('range'); return; }
    if (condition.kind === 'configured') {
      const field = format.fields.find((item) => item.id === condition.key);
      if (field) openConfigured(field, target);
    } else if (condition.column) openBuiltin(condition.column, target);
  };
  const clearCondition = (condition: Condition) => {
    if (condition.kind === 'range') { onFilterChange({ rangeKeyword: '' }); return; }
    if (condition.kind === 'configured') { onClearConfiguredFilter?.(condition.key); return; }
    const key = condition.column;
    if (key === ColumnFilterKey.Index) onFilterChange({ columnFilters: { ...filter.columnFilters, index: createNumericFilter() } });
    else if (key === ColumnFilterKey.Timestamp) onFilterChange({ startTime: '', endTime: '' });
    else if (key === ColumnFilterKey.Level) onFilterChange({ selectedLevels: [], level: FilterValue.All });
    else if (key === ColumnFilterKey.Module) onFilterChange({ selectedModule: FilterValue.All });
    else if (key === ColumnFilterKey.ThreadId) onFilterChange({ selectedThread: FilterValue.All });
    else if (key && textColumns.includes(key)) {
      const property = key as 'requestId' | 'operationDesc' | 'functionName' | 'memoryAddress' | 'fileName';
      onFilterChange({ columnFilters: { ...filter.columnFilters, [property]: createTextFilter() } });
    }
  };
  const clearConditions = () => {
    if (showLegacyFilters) onFilterChange({
      columnFilters: { index: createNumericFilter(), requestId: createTextFilter(), operationDesc: createTextFilter(), functionName: createTextFilter(), memoryAddress: createTextFilter(), fileName: createTextFilter() },
      startTime: '', endTime: '', selectedLevels: [], level: FilterValue.All,
      selectedModule: FilterValue.All, selectedThread: FilterValue.All, rangeKeyword: '',
    });
    else { onClearAllConfiguredFilters?.(); onFilterChange({ rangeKeyword: '' }); }
  };
  const toggleSearchColumn = (key: string) => {
    if (key === 'ALL') { onFilterChange({ searchColumns: ['ALL'], searchColumn: 'ALL' }); return; }
    let next = selectedColumns.filter((item) => item !== 'ALL');
    next = next.includes(key) ? next.filter((item) => item !== key) : [...next, key];
    if (!next.length) next = ['ALL'];
    onFilterChange({ searchColumns: next, searchColumn: next.length === 1 ? next[0] : 'ALL' });
  };
  const pinHighlight = () => {
    const keyword = filter.highlightKeyword.trim();
    if (!keyword || invalidHighlightRegex) return;
    if (pins.some((pin) => pin.keyword === keyword)) return;
    const pin: PinnedHighlight = { id: `${Date.now()}-${Math.random()}`, keyword, color: HIGHLIGHT_COLOR_PRESETS[pins.length % HIGHLIGHT_COLOR_PRESETS.length].id, matchCase: filter.highlightMatchCase, isRegex: filter.highlightIsRegex };
    onFilterChange({ pinnedHighlights: [...pins, pin], highlightKeyword: '' });
  };
  const copyFiltered = () => {
    onCopyFilteredRaw(); setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  };
  const submitJump = (event: React.FormEvent) => {
    event.preventDefault();
    const line = Number(jumpInput);
    if (!Number.isInteger(line) || line < 1) { setJumpError('请输入有效行号'); return; }
    setJumpError(''); onJumpToLine?.(line);
  };
  const currentValue = searchMode === 'navigate' ? filter.searchKeyword : filter.highlightKeyword;
  const setCurrentValue = (value: string) => onFilterChange(searchMode === 'navigate' ? { searchKeyword: value } : { highlightKeyword: value });

  return (
    <div ref={root} className="relative z-40 shrink-0 border-b border-line bg-surface px-2 py-1.5 text-xs text-ink-2 sm:px-3" aria-label="日志调查栏">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex min-w-[300px] flex-1 items-center gap-1.5">
          <div className="flex h-8 shrink-0 rounded-md border border-line bg-raised p-0.5" aria-label="搜索用途">
            <button type="button" aria-pressed={searchMode === 'navigate'} onClick={() => setSearchMode('navigate')} className={`flex items-center gap-1 rounded px-2 font-medium ${searchMode === 'navigate' ? 'bg-surface text-accent-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}><Search className="h-3.5 w-3.5" />定位</button>
            <button type="button" aria-pressed={searchMode === 'highlight'} onClick={() => setSearchMode('highlight')} className={`flex items-center gap-1 rounded px-2 font-medium ${searchMode === 'highlight' ? 'bg-surface text-accent-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}><Highlighter className="h-3.5 w-3.5" />高亮</button>
          </div>
          <div className={`relative flex h-8 min-w-0 flex-1 items-center rounded-md border bg-surface px-2 focus-within:border-accent ${invalidSearchRegex || invalidHighlightRegex ? 'border-danger' : 'border-line'}`}>
            <div className="relative mr-1 shrink-0">
              <button type="button" onClick={() => setMenu(menu === 'searchColumns' ? null : 'searchColumns')} className="flex max-w-28 items-center gap-1 rounded px-1 py-0.5 text-[11px] text-ink-2 hover:bg-raised" title="搜索匹配目标列（多选）"><span className="truncate">{searchColumnLabel}</span><ChevronDown className="h-3 w-3" /></button>
              {menu === 'searchColumns' ? <div className={`${menuClass} left-0 max-h-64 w-56 overflow-auto`}><p className="px-2 py-1 text-[10px] font-semibold text-ink-3">定位范围 · 不改变日志结果</p>{searchColumns.map((column) => <label key={column.key} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-raised"><span>{column.label}</span><input type="checkbox" className="accent-indigo-600" checked={selectedColumns.includes(column.key)} onChange={() => toggleSearchColumn(column.key)} /></label>)}</div> : null}
            </div>
            <input id="log-investigation-search" aria-label={searchMode === 'navigate' ? '定位日志' : '高亮日志'} value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (searchMode === 'navigate') onTriggerSearch(); else pinHighlight(); } }} placeholder={searchMode === 'navigate' ? '在当前筛选结果中定位…' : '高亮匹配文本，Enter 固定…'} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-3" />
            {currentValue ? <button type="button" className="lv-icon-btn h-6 w-6" onClick={() => setCurrentValue('')} aria-label="清空当前搜索"><X className="h-3.5 w-3.5" /></button> : null}
            <button type="button" aria-pressed={searchMode === 'navigate' ? filter.isRegex : filter.highlightIsRegex} onClick={() => onFilterChange(searchMode === 'navigate' ? { isRegex: !filter.isRegex } : { highlightIsRegex: !filter.highlightIsRegex })} className={`rounded border px-1 py-0.5 font-mono text-[10px] ${(searchMode === 'navigate' ? filter.isRegex : filter.highlightIsRegex) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-transparent text-ink-3'}`} title="正则表达式">.*</button>
            <button type="button" aria-pressed={searchMode === 'navigate' ? filter.matchCase : filter.highlightMatchCase} onClick={() => onFilterChange(searchMode === 'navigate' ? { matchCase: !filter.matchCase } : { highlightMatchCase: !filter.highlightMatchCase })} className={`mr-1 rounded border px-1 py-0.5 font-mono text-[10px] ${(searchMode === 'navigate' ? filter.matchCase : filter.highlightMatchCase) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-transparent text-ink-3'}`} title="区分大小写">Aa</button>
            {searchMode === 'navigate' ? <>
              <button type="button" onClick={onTriggerSearch} disabled={!filter.searchKeyword.trim() || invalidSearchRegex} className="lv-btn lv-btn-primary h-6 px-2 text-[11px]">定位</button>
              <button type="button" onClick={onPrevMatch} disabled={!totalMatches} className="lv-icon-btn ml-1 h-6 w-6" aria-label="上一条匹配"><ChevronUp className="h-3.5 w-3.5" /></button>
              <span className="min-w-12 text-center font-mono text-[10px] tabular-nums text-accent-ink" aria-label="匹配位置">{totalMatches ? `${Math.min(currentMatchIndex + 1, totalMatches)}/${totalMatches}` : '0/0'}</span>
              <button type="button" onClick={onNextMatch} disabled={!totalMatches} className="lv-icon-btn h-6 w-6" aria-label="下一条匹配"><ChevronDown className="h-3.5 w-3.5" /></button>
            </> : <button type="button" onClick={pinHighlight} disabled={!filter.highlightKeyword.trim() || invalidHighlightRegex || pins.some((pin) => pin.keyword === filter.highlightKeyword.trim())} className="flex h-6 items-center gap-1 rounded bg-accent px-2 text-[11px] font-medium text-white disabled:opacity-40"><Pin className="h-3 w-3" />固定</button>}
          </div>
        </div>

        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === 'add' ? null : 'add')} className={`${quietButton} ${conditions.length ? '!border-accent/40 !bg-accent-soft !text-accent-ink' : ''}`} aria-expanded={menu === 'add'}><Plus className="h-3.5 w-3.5" />添加条件{conditions.length ? <span className="rounded bg-accent px-1 font-mono text-[10px] text-white">{conditions.length}</span> : null}</button>
          {menu === 'add' ? <div className={`${menuClass} left-0 grid w-64 grid-cols-2 gap-0.5`}>
            <p className="col-span-2 px-2 py-1 text-[10px] font-semibold text-ink-3">缩小日志范围 · 条件之间为 AND</p>
            {showLegacyFilters ? builtinFilters.map((item) => <button key={item.key} type="button" className="lv-menu-item" onClick={(event) => openBuiltin(item.key, event.currentTarget)}><Filter className="h-3.5 w-3.5" />{item.label}</button>) : format.fields.filter((field) => field.filter.kind !== FieldFilterKind.None).map((field) => <button key={field.id} type="button" className="lv-menu-item" onClick={(event) => openConfigured(field, event.currentTarget)}><Filter className="h-3.5 w-3.5" />{field.label}</button>)}
            <button type="button" className="lv-menu-item col-span-2" onClick={() => setMenu('range')}><ListFilter className="h-3.5 w-3.5" />首个至末个匹配区间</button>
          </div> : null}
          {menu === 'range' ? <div className={`${menuClass} left-0 w-80 p-3`}><div className="mb-2 flex items-center justify-between"><strong>首末匹配区间</strong><button type="button" className="lv-icon-btn h-6 w-6" onClick={() => setMenu(null)} aria-label="关闭区间筛选"><X className="h-3.5 w-3.5" /></button></div><p className="mb-2 text-[11px] leading-relaxed text-ink-3">仅保留关键词第一次出现至最后一次出现之间的记录。</p><input autoFocus value={filter.rangeKeyword} onChange={(event) => onFilterChange({ rangeKeyword: event.target.value })} className={`${input} w-full`} placeholder="区间关键字" /><div className="mt-2 flex justify-end"><button type="button" className="text-[11px] text-danger" onClick={() => onFilterChange({ rangeKeyword: '' })}>清空区间</button></div></div> : null}
        </div>

        {showLegacyFilters ? <DateRangeFilter filter={filter} isOpen={menu === 'columns'} onOpenChange={(open) => setMenu(open ? 'columns' : null)} onFilterChange={onFilterChange} timeRange={timeRange} theme={theme} /> : null}
        <form onSubmit={submitJump} className="flex h-8 items-center gap-1" title="跳转到筛选结果中的行（Ctrl+G）"><Hash className="h-3.5 w-3.5 text-ink-3" /><input ref={jumpRef} aria-label="跳转行" type="number" min="1" value={jumpInput} onChange={(event) => { setJumpInput(event.target.value); setJumpError(''); }} placeholder={`1–${filteredCount}`} className={`${input} w-20`} /><button type="submit" className={quietButton}>跳转</button>{jumpError ? <span role="alert" className="text-[10px] text-danger">{jumpError}</span> : null}</form>

        <div className="relative ml-auto">
          <button type="button" className={quietButton} onClick={() => setMenu(menu === 'view' ? null : 'view')} aria-label="视图设置" aria-expanded={menu === 'view'}><SlidersHorizontal className="h-3.5 w-3.5" /><span className="hidden xl:inline">视图</span></button>
          {menu === 'view' ? <div className={`${menuClass} right-0 w-72 p-3`}>
            <p className="mb-1.5 text-[10px] font-semibold text-ink-3">行密度</p><div className="grid grid-cols-3 gap-1">{([['compact', '紧凑'], ['normal', '标准'], ['relaxed', '宽敞']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => onDensityChange(value)} className={`rounded border px-2 py-1.5 ${density === value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:bg-raised'}`}>{label}</button>)}</div>
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded px-1 py-1.5 hover:bg-raised"><span className="flex items-center gap-1.5"><WrapText className="h-3.5 w-3.5" />自动换行</span><input type="checkbox" className="accent-indigo-600" checked={filter.wordWrap} onChange={(event) => onFilterChange({ wordWrap: event.target.checked })} /></label>
            {showLegacyFilters ? <>
              <p className="mb-1.5 mt-2 text-[10px] font-semibold text-ink-3">表格网格线</p><div className="grid grid-cols-3 gap-1">{(['light', 'medium', 'strong'] as const).map((value) => <button key={value} type="button" onClick={() => onBorderIntensityChange?.(value)} className={`rounded border px-2 py-1.5 ${borderIntensity === value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:bg-raised'}`}>{value === 'light' ? '弱' : value === 'medium' ? '中' : '强'}</button>)}</div>
              <div className="my-2 h-px bg-line" /><p className="mb-1 text-[10px] font-semibold text-ink-3">数据列</p><div className="grid max-h-44 grid-cols-2 gap-0.5 overflow-auto">{columnLabels.map(({ key, label }) => <label key={key} className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-raised"><span>{label}</span><input type="checkbox" className="accent-indigo-600" checked={columnVisibility[key]} onChange={(event) => onColumnVisibilityChange({ ...columnVisibility, [key]: event.target.checked })} /></label>)}</div>
              <label className="mt-2 flex items-center justify-between border-t border-line px-1 pt-2"><span>经典选中加粗</span><input type="checkbox" className="accent-indigo-600" checked={legacyBoldSelection} onChange={(event) => onLegacyBoldSelectionChange?.(event.target.checked)} /></label>
              <label className="mt-1 flex items-center justify-between px-1"><span>经典高亮边框</span><input type="checkbox" className="accent-indigo-600" checked={legacyHighlightStyle} onChange={(event) => onLegacyHighlightStyleChange?.(event.target.checked)} /></label>
            </> : null}
            <button type="button" className="lv-btn mt-2 w-full" onClick={onResetColumnWidths}>重置默认列宽</button>
            <button type="button" className="lv-btn mt-1.5 w-full justify-between" onClick={() => { setMenu(null); props.onOpenInvestigationViews(); }}><span>调查视图</span><span className="text-[10px] text-ink-3">保存 / 恢复</span></button>
          </div> : null}
        </div>
        <div className="relative">
          <button type="button" className={quietButton} onClick={() => setMenu(menu === 'export' ? null : 'export')} aria-expanded={menu === 'export'} title={`导出当前筛选结果 ${filteredCount.toLocaleString()} 条`}><Download className="h-3.5 w-3.5" /><span className="hidden xl:inline">导出结果</span></button>
          {menu === 'export' ? <div className={`${menuClass} right-0 w-56`}><p className="px-2 py-1 text-[10px] text-ink-3">当前筛选结果 · {filteredCount.toLocaleString()} 条</p><button type="button" className="lv-menu-item" onClick={() => { onExportCSV(); setMenu(null); }}>导出 CSV<span className="ml-auto font-mono text-[10px]">.csv</span></button><button type="button" className="lv-menu-item" onClick={() => { onExportJSON(); setMenu(null); }}>导出 JSON<span className="ml-auto font-mono text-[10px]">.json</span></button></div> : null}
        </div>
        <button type="button" className={quietButton} onClick={copyFiltered} disabled={!filteredCount} title={`复制当前筛选结果原文，共 ${filteredCount.toLocaleString()} 条`}>{copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}<span className="hidden xl:inline">{copied ? '已复制' : '复制结果'}</span></button>
      </div>
      {invalidSearchRegex || invalidHighlightRegex ? <p role="alert" className="mt-1 text-[11px] text-danger">正则表达式无效，请修正后再{searchMode === 'navigate' ? '定位' : '固定高亮'}。</p> : null}

      <div className="mt-1 flex min-h-7 flex-wrap items-center gap-1 border-t border-line/70 pt-1">
        <span className="mr-1 flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-ink-3" title="当前筛选结果 / 解析记录总数"><ListFilter className="h-3.5 w-3.5" /><strong className="text-ink-2">{filteredCount.toLocaleString()}</strong> / {(stats?.totalCount || 0).toLocaleString()} 条</span>
        {conditions.map((condition) => <span key={`${condition.kind}-${condition.key}`} className="group flex h-6 max-w-full items-center rounded-md border border-accent/30 bg-accent-soft text-[11px] text-accent-ink sm:max-w-80"><button type="button" className="flex min-w-0 items-center gap-1 px-1.5 text-left" onClick={(event) => openCondition(condition, event.currentTarget)} title={`编辑${condition.label}：${condition.summary}`}><span className="shrink-0 font-semibold">{condition.label}</span><span className="truncate font-mono text-[10px] opacity-80">{condition.summary}</span></button><button type="button" className="mr-0.5 rounded p-0.5 hover:bg-accent/15" onClick={() => clearCondition(condition)} aria-label={`清除${condition.label}条件`}><X className="h-3 w-3" /></button></span>)}
        {pins.map((pin) => {
          const preset = HIGHLIGHT_COLOR_PRESETS.find((item) => item.id === pin.color) || HIGHLIGHT_COLOR_PRESETS[0];
          return <span key={pin.id} className="relative flex h-6 max-w-64 items-center gap-1 rounded-md border border-line bg-raised px-1.5 text-[11px]"><button type="button" className={`h-3 w-3 shrink-0 rounded-full ${preset.bgDot}`} onClick={() => setColorPin(colorPin === pin.id ? null : pin.id)} aria-label={`调整高亮 ${pin.keyword} 的颜色`} /><Highlighter className="h-3 w-3 text-ink-3" /><span className="truncate font-mono" title={pin.keyword}>{pin.keyword}</span>{pin.isRegex ? <span className="text-[9px] text-ink-3">.*</span> : null}<button type="button" onClick={() => onFilterChange({ pinnedHighlights: pins.filter((item) => item.id !== pin.id) })} aria-label={`移除高亮 ${pin.keyword}`}><X className="h-3 w-3 text-ink-3" /></button>{colorPin === pin.id ? <span className="lv-menu absolute left-0 top-full z-[100] mt-1 flex gap-1 p-2">{HIGHLIGHT_COLOR_PRESETS.map((color) => <button key={color.id} type="button" title={color.name} className={`h-5 w-5 rounded-full ${color.bgDot} ${pin.color === color.id ? 'ring-2 ring-accent' : ''}`} onClick={() => { onFilterChange({ pinnedHighlights: pins.map((item) => item.id === pin.id ? { ...item, color: color.id } : item) }); setColorPin(null); }} />)}</span> : null}</span>;
        })}
        {!conditions.length && !pins.length ? <span className="text-[10.5px] text-ink-3">全部记录 · 搜索仅定位，不隐藏日志</span> : null}
        {conditions.length || pins.length ? <button type="button" className="ml-auto flex items-center gap-1 px-1.5 text-[10.5px] text-ink-3 hover:text-danger" onClick={() => { clearConditions(); onFilterChange({ pinnedHighlights: [] }); }}><X className="h-3 w-3" />清除全部</button> : null}
      </div>

      {editor?.kind === 'builtin' ? <ColumnFilterPopover column={editor.key} anchor={editor.anchor} filter={filter} options={editor.key === ColumnFilterKey.Level ? ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', FilterValue.FailedOnly] : editor.key === ColumnFilterKey.Module ? uniqueModules : editor.key === ColumnFilterKey.ThreadId ? uniqueThreads : []} timeRange={timeRange} theme={theme} onFilterChange={onFilterChange} onClose={() => setEditor(null)} /> : null}
      {editor?.kind === 'configured' ? <ConfiguredFieldFilterPopover field={editor.field} filter={filter.configuredFilters[editor.field.id]} options={distinctFieldValues(logs, editor.field.id)} anchor={editor.anchor} theme={theme} onApply={(next: RuntimeFieldFilter) => onFilterChange({ configuredFilters: { ...filter.configuredFilters, [editor.field.id]: next } })} onClose={() => setEditor(null)} /> : null}
    </div>
  );
};
