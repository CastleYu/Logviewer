import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, Filter, RotateCcw, Search, X } from 'lucide-react';
import {
  ColumnFilterKey,
  FilterOptions,
  FilterValue,
  NumericColumnFilter,
  TextColumnFilter,
  ThemeMode,
} from '../types';
import { formatMsForInput, parseInputTimeToMs } from '../utils/dateUtils';
import {
  createNumericFilter,
  createTextFilter,
  isNumericFilterValid,
  isTextFilterValid,
} from '../utils/columnFilterUtils';

interface ColumnFilterPopoverProps {
  column: ColumnFilterKey;
  anchor: DOMRect;
  filter: FilterOptions;
  options: string[];
  timeRange: [number, number] | null;
  theme: ThemeMode;
  onFilterChange: (updated: Partial<FilterOptions>) => void;
  onClose: () => void;
}

interface PanelProps {
  title: string;
  description: string;
  theme: ThemeMode;
  children: React.ReactNode;
  error?: string;
  canClear: boolean;
  canApply?: boolean;
  onClear: () => void;
  onApply: () => void;
  onClose: () => void;
}

function columnLabel(column: ColumnFilterKey): string {
  switch (column) {
    case ColumnFilterKey.Index: return '序号';
    case ColumnFilterKey.Timestamp: return '时间戳';
    case ColumnFilterKey.Level: return '级别';
    case ColumnFilterKey.RequestId: return '请求ID';
    case ColumnFilterKey.OperationDesc: return '操作描述';
    case ColumnFilterKey.FunctionName: return '函数名';
    case ColumnFilterKey.ThreadId: return '线程ID';
    case ColumnFilterKey.MemoryAddress: return '内存地址';
    case ColumnFilterKey.Module: return '模块';
    case ColumnFilterKey.FileName: return '文件名';
  }
}

function textFilterFor(filter: FilterOptions, column: ColumnFilterKey): TextColumnFilter {
  const filters = filter.columnFilters;
  switch (column) {
    case ColumnFilterKey.RequestId: return filters.requestId;
    case ColumnFilterKey.OperationDesc: return filters.operationDesc;
    case ColumnFilterKey.FunctionName: return filters.functionName;
    case ColumnFilterKey.MemoryAddress: return filters.memoryAddress;
    case ColumnFilterKey.FileName: return filters.fileName;
    default: return createTextFilter();
  }
}

function updateTextFilter(
  filter: FilterOptions,
  column: ColumnFilterKey,
  next: TextColumnFilter,
): FilterOptions['columnFilters'] {
  switch (column) {
    case ColumnFilterKey.RequestId: return { ...filter.columnFilters, requestId: next };
    case ColumnFilterKey.OperationDesc: return { ...filter.columnFilters, operationDesc: next };
    case ColumnFilterKey.FunctionName: return { ...filter.columnFilters, functionName: next };
    case ColumnFilterKey.MemoryAddress: return { ...filter.columnFilters, memoryAddress: next };
    case ColumnFilterKey.FileName: return { ...filter.columnFilters, fileName: next };
    default: return filter.columnFilters;
  }
}

function isTextColumn(column: ColumnFilterKey): boolean {
  return column === ColumnFilterKey.RequestId
    || column === ColumnFilterKey.OperationDesc
    || column === ColumnFilterKey.FunctionName
    || column === ColumnFilterKey.MemoryAddress
    || column === ColumnFilterKey.FileName;
}

function panelPosition(anchor: DOMRect): React.CSSProperties {
  const width = Math.min(320, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - anchor.bottom;
  if (spaceBelow >= 360 || anchor.top < 360) {
    return { left, top: anchor.bottom + 6, width };
  }
  return { left, bottom: window.innerHeight - anchor.top + 6, width };
}

function Panel({
  title,
  description,
  theme,
  children,
  error = '',
  canClear,
  canApply = true,
  onClear,
  onApply,
  onClose,
}: PanelProps) {
  const isLight = theme === 'light';
  return (
    <section
      role="dialog"
      aria-label={`${title}列筛选`}
      className={`rounded-xl border shadow-[0_14px_40px_rgba(15,23,42,0.22)] overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
      }`}
    >
      <header className={`flex items-start justify-between gap-3 px-3.5 py-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Filter className="w-4 h-4 text-indigo-500" />
            筛选：{title}
          </h3>
          <p className={`mt-0.5 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 cursor-pointer" aria-label="关闭列筛选">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="p-3.5">{children}</div>
      <div aria-live="polite" className="min-h-6 px-3.5">
        {error ? <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p> : null}
      </div>
      <footer className={`flex items-center justify-between gap-2 px-3.5 py-2.5 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <button type="button" onClick={onClear} disabled={!canClear} className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-500 hover:text-rose-600 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" />
          清除
        </button>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded-md border text-[11px] cursor-pointer ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>取消</button>
          <button type="button" onClick={onApply} disabled={!canApply} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            <Check className="w-3.5 h-3.5" />
            应用
          </button>
        </div>
      </footer>
    </section>
  );
}

function TextPanel({ column, filter, theme, onFilterChange, onClose }: Omit<ColumnFilterPopoverProps, 'anchor' | 'options' | 'timeRange'>) {
  const current = textFilterFor(filter, column);
  const [draft, setDraft] = useState<TextColumnFilter>(current);
  const valid = isTextFilterValid(draft);
  const apply = () => {
    if (!valid) return;
    onFilterChange({ columnFilters: updateTextFilter(filter, column, { ...draft, value: draft.value.trim() }) });
    onClose();
  };
  const clear = () => {
    onFilterChange({ columnFilters: updateTextFilter(filter, column, createTextFilter()) });
    onClose();
  };
  return (
    <Panel title={columnLabel(column)} description="默认包含匹配，可切换正则和大小写" theme={theme} error={valid ? '' : '正则表达式无效，请检查后重试'} canClear={Boolean(current.value)} canApply={valid} onClear={clear} onApply={apply} onClose={onClose}>
      <div className={`h-9 flex items-center rounded-md border px-2 ${theme === 'light' ? 'bg-slate-50 border-slate-300 focus-within:border-indigo-500' : 'bg-slate-950 border-slate-700 focus-within:border-indigo-500'}`}>
        <Search className="w-3.5 h-3.5 text-indigo-500 shrink-0 mr-1.5" />
        <input autoFocus value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') apply(); }} placeholder={`搜索${columnLabel(column)}…`} className="min-w-0 flex-1 bg-transparent outline-none text-xs font-mono" />
        <button type="button" onClick={() => setDraft({ ...draft, isRegex: !draft.isRegex })} className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${draft.isRegex ? 'bg-indigo-600/20 border-indigo-500 text-indigo-600 dark:text-indigo-200' : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`} aria-pressed={draft.isRegex} title="使用正则表达式">.*</button>
        <button type="button" onClick={() => setDraft({ ...draft, matchCase: !draft.matchCase })} className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${draft.matchCase ? 'bg-indigo-600/20 border-indigo-500 text-indigo-600 dark:text-indigo-200' : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`} aria-pressed={draft.matchCase} title="区分大小写">Aa</button>
      </div>
    </Panel>
  );
}

function NumericPanel({ filter, theme, onFilterChange, onClose }: Omit<ColumnFilterPopoverProps, 'column' | 'anchor' | 'options' | 'timeRange'>) {
  const current = filter.columnFilters.index;
  const [draft, setDraft] = useState<NumericColumnFilter>(current);
  const valid = isNumericFilterValid(draft);
  const error = valid ? '' : '请输入大于 0 的数字，且最小值不能大于最大值';
  const apply = () => {
    if (!valid) return;
    onFilterChange({ columnFilters: { ...filter.columnFilters, index: draft } });
    onClose();
  };
  const clear = () => {
    onFilterChange({ columnFilters: { ...filter.columnFilters, index: createNumericFilter() } });
    onClose();
  };
  return (
    <Panel title="序号" description="筛选源日志中的连续序号范围" theme={theme} error={error} canClear={Boolean(current.min || current.max)} canApply={valid} onClear={clear} onApply={apply} onClose={onClose}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label><span className="block mb-1 text-[11px] font-semibold">最小值</span><input autoFocus type="number" min="1" value={draft.min} onChange={(event) => setDraft({ ...draft, min: event.target.value })} className={`h-9 w-full rounded-md border px-2 text-xs font-mono outline-none focus:border-indigo-500 ${theme === 'light' ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'}`} /></label>
        <span className="pb-2 text-slate-400">—</span>
        <label><span className="block mb-1 text-[11px] font-semibold">最大值</span><input type="number" min="1" value={draft.max} onChange={(event) => setDraft({ ...draft, max: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') apply(); }} className={`h-9 w-full rounded-md border px-2 text-xs font-mono outline-none focus:border-indigo-500 ${theme === 'light' ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'}`} /></label>
      </div>
    </Panel>
  );
}

function EnumPanel({ column, filter, options, theme, onFilterChange, onClose }: Omit<ColumnFilterPopoverProps, 'anchor' | 'timeRange'>) {
  const isLevel = column === ColumnFilterKey.Level;
  const currentLevels = filter.selectedLevels.filter((value) => value !== FilterValue.All);
  const currentValue = column === ColumnFilterKey.Module ? filter.selectedModule : filter.selectedThread;
  const [selected, setSelected] = useState<string[]>(isLevel ? currentLevels : currentValue === FilterValue.All ? [] : [currentValue]);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => options.filter((option) => option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [options, query]);
  const toggle = (value: string) => {
    if (!isLevel) {
      setSelected([value]);
      return;
    }
    setSelected((previous) => previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value]);
  };
  const apply = () => {
    if (isLevel) {
      onFilterChange({ selectedLevels: selected, level: selected.length === 1 ? selected[0] : FilterValue.All });
    } else if (column === ColumnFilterKey.Module) {
      onFilterChange({ selectedModule: selected[0] || FilterValue.All });
    } else {
      onFilterChange({ selectedThread: selected[0] || FilterValue.All });
    }
    onClose();
  };
  const clear = () => {
    if (isLevel) onFilterChange({ selectedLevels: [], level: FilterValue.All });
    else if (column === ColumnFilterKey.Module) onFilterChange({ selectedModule: FilterValue.All });
    else onFilterChange({ selectedThread: FilterValue.All });
    onClose();
  };
  return (
    <Panel title={columnLabel(column)} description={isLevel ? '同列多选为 OR，不同列之间为 AND' : '输入关键字定位并选择一个值'} theme={theme} canClear={isLevel ? currentLevels.length > 0 : currentValue !== FilterValue.All} onClear={clear} onApply={apply} onClose={onClose}>
      {!isLevel ? <div className={`h-8 mb-2 flex items-center rounded-md border px-2 ${theme === 'light' ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'}`}><Search className="w-3.5 h-3.5 text-indigo-500 mr-1.5" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可选值…" className="min-w-0 flex-1 bg-transparent outline-none text-xs font-mono" /></div> : null}
      <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
        {visible.map((option) => {
          const checked = selected.includes(option);
          return <button key={option} type="button" onClick={() => toggle(option)} className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs cursor-pointer ${checked ? 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-200' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}><span className="truncate font-mono">{option === FilterValue.FailedOnly ? '解析失败' : option}</span><span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-400'}`}>{checked ? <Check className="w-3 h-3" /> : null}</span></button>;
        })}
        {visible.length === 0 ? <p className="py-5 text-center text-[11px] text-slate-500">没有匹配的可选值</p> : null}
      </div>
    </Panel>
  );
}

function DatePanel({ filter, timeRange, theme, onFilterChange, onClose }: Omit<ColumnFilterPopoverProps, 'column' | 'anchor' | 'options'>) {
  const [start, setStart] = useState(filter.startTime);
  const [end, setEnd] = useState(filter.endTime);
  const [offset, setOffset] = useState(filter.isUtcOffset ? filter.utcOffsetHours : 0);
  const startMs = parseInputTimeToMs(start, offset !== 0, offset);
  const endMs = parseInputTimeToMs(end, offset !== 0, offset, true);
  const error = start && startMs === null ? '开始时间格式无效' : end && endMs === null ? '结束时间格式无效' : startMs !== null && endMs !== null && startMs > endMs ? '开始时间不能晚于结束时间' : '';
  const apply = () => {
    if (error) return;
    onFilterChange({ startTime: start, endTime: end, isUtcOffset: offset !== 0, utcOffsetHours: offset });
    onClose();
  };
  const clear = () => {
    onFilterChange({ startTime: '', endTime: '' });
    onClose();
  };
  const useFullRange = () => {
    if (!timeRange) return;
    setStart(formatMsForInput(timeRange[0], offset));
    setEnd(formatMsForInput(timeRange[1], offset));
  };
  return (
    <Panel title="时间戳" description="开始和结束时刻均包含在筛选结果中" theme={theme} error={error} canClear={Boolean(filter.startTime || filter.endTime)} canApply={!error} onClear={clear} onApply={apply} onClose={onClose}>
      <div className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 mb-3 ${theme === 'light' ? 'bg-slate-100/80' : 'bg-slate-950'}`}><span className="flex items-center gap-1.5 text-[11px] font-medium"><Clock3 className="w-3.5 h-3.5 text-indigo-500" />输入时区</span><select value={offset} onChange={(event) => setOffset(Number(event.target.value))} className={`h-7 rounded-md border px-2 text-xs font-mono outline-none cursor-pointer ${theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`}>{Array.from({ length: 27 }, (_, index) => index - 12).map((value) => <option key={value} value={value}>{value === 0 ? 'UTC' : `UTC${value > 0 ? '+' : ''}${value}`}</option>)}</select></div>
      <div className="grid grid-cols-1 gap-2.5"><label><span className="block mb-1 text-[11px] font-semibold">开始（含）</span><input autoFocus type="datetime-local" step="0.001" value={start} onChange={(event) => setStart(event.target.value)} className={`date-time-input h-9 w-full rounded-md border px-2 text-[11px] font-mono outline-none focus:border-indigo-500 ${theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`} /></label><label><span className="block mb-1 text-[11px] font-semibold">结束（含）</span><input type="datetime-local" step="0.001" value={end} onChange={(event) => setEnd(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') apply(); }} className={`date-time-input h-9 w-full rounded-md border px-2 text-[11px] font-mono outline-none focus:border-indigo-500 ${theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`} /></label></div>
      <button type="button" disabled={!timeRange} onClick={useFullRange} className="mt-2 text-[10px] text-indigo-600 dark:text-indigo-300 hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline cursor-pointer disabled:cursor-not-allowed">使用完整日志范围</button>
    </Panel>
  );
}

export function ColumnFilterPopover(props: ColumnFilterPopoverProps) {
  const { column, anchor, onClose } = props;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  let content: React.ReactNode;
  if (column === ColumnFilterKey.Index) content = <NumericPanel {...props} />;
  else if (column === ColumnFilterKey.Timestamp) content = <DatePanel {...props} />;
  else if (column === ColumnFilterKey.Level || column === ColumnFilterKey.Module || column === ColumnFilterKey.ThreadId) content = <EnumPanel {...props} />;
  else if (isTextColumn(column)) content = <TextPanel {...props} />;
  else content = null;

  return createPortal(
    <>
      <button type="button" aria-label="关闭列筛选" className="fixed inset-0 z-[110] cursor-default" onClick={onClose} />
      <div className="fixed z-[120]" style={panelPosition(anchor)}>{content}</div>
    </>,
    document.body,
  );
}
