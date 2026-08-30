import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Filter, RotateCcw, Search, X } from 'lucide-react';
import { FieldFilterKind, LogFieldConfig, RuntimeFieldFilter, SelectionMode } from '../config/logFormatTypes';
import { ThemeMode } from '../types';
import { createRuntimeFieldFilter, isRuntimeFilterActive, isRuntimeFilterValid } from '../utils/configuredFilterUtils';

interface ConfiguredFieldFilterPopoverProps {
  field: LogFieldConfig;
  filter: RuntimeFieldFilter;
  options: string[];
  anchor: DOMRect;
  theme: ThemeMode;
  onApply: (filter: RuntimeFieldFilter) => void;
  onClose: () => void;
}

function position(anchor: DOMRect): React.CSSProperties {
  const width = Math.min(320, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  return window.innerHeight - anchor.bottom > 360
    ? { left, top: anchor.bottom + 6, width }
    : { left, bottom: window.innerHeight - anchor.top + 6, width };
}

function filterDescription(field: LogFieldConfig): string {
  switch (field.filter.kind) {
    case FieldFilterKind.Text: return '默认包含匹配，可切换正则和大小写';
    case FieldFilterKind.NumberRange: return '最小值和最大值均包含在筛选范围中';
    case FieldFilterKind.DateTimeRange: return '开始和结束时刻均包含在筛选范围中';
    case FieldFilterKind.Select: return field.filter.selection === SelectionMode.Multiple ? '同字段多选按 OR 组合' : '搜索并选择一个字段值';
    case FieldFilterKind.None: return '';
  }
}

function filterError(filter: RuntimeFieldFilter): string {
  if (isRuntimeFilterValid(filter)) return '';
  if (filter.kind === FieldFilterKind.Text) return '正则表达式无效，请检查后重试';
  if (filter.kind === FieldFilterKind.NumberRange) return '数值无效，或最小值大于最大值';
  if (filter.kind === FieldFilterKind.DateTimeRange) return '时间无效，或开始时间晚于结束时间';
  return '筛选条件无效';
}

function FilterEditor({ field, filter, options, theme, onChange }: {
  field: LogFieldConfig;
  filter: RuntimeFieldFilter;
  options: string[];
  theme: ThemeMode;
  onChange: (filter: RuntimeFieldFilter) => void;
}) {
  const [query, setQuery] = useState('');
  const visibleOptions = useMemo(
    () => options.filter((option) => option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
    [options, query],
  );
  const inputClass = `h-9 w-full rounded-md border px-2 text-xs font-mono outline-none focus:border-indigo-500 ${theme === 'light' ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'}`;

  if (filter.kind === FieldFilterKind.Text) {
    const config = field.filter.kind === FieldFilterKind.Text ? field.filter : null;
    return <div className={`h-9 flex items-center rounded-md border px-2 ${theme === 'light' ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'}`}><Search className="w-3.5 h-3.5 text-indigo-500 mr-1.5" /><input autoFocus value={filter.value} onChange={(event) => onChange({ ...filter, value: event.target.value })} placeholder={`搜索${field.label}…`} className="min-w-0 flex-1 bg-transparent outline-none text-xs font-mono" />{config?.allowRegex ? <button type="button" onClick={() => onChange({ ...filter, isRegex: !filter.isRegex })} aria-pressed={filter.isRegex} className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${filter.isRegex ? 'bg-indigo-600/20 border-indigo-500 text-indigo-600 dark:text-indigo-200' : 'border-transparent text-slate-400'}`}>.*</button> : null}<button type="button" onClick={() => onChange({ ...filter, matchCase: !filter.matchCase })} aria-pressed={filter.matchCase} className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${filter.matchCase ? 'bg-indigo-600/20 border-indigo-500 text-indigo-600 dark:text-indigo-200' : 'border-transparent text-slate-400'}`}>Aa</button></div>;
  }
  if (filter.kind === FieldFilterKind.NumberRange) {
    return <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2"><label><span className="block mb-1 text-[11px] font-semibold">最小值</span><input autoFocus type="number" value={filter.min} onChange={(event) => onChange({ ...filter, min: event.target.value })} className={inputClass} /></label><span className="pb-2 text-slate-400">—</span><label><span className="block mb-1 text-[11px] font-semibold">最大值</span><input type="number" value={filter.max} onChange={(event) => onChange({ ...filter, max: event.target.value })} className={inputClass} /></label></div>;
  }
  if (filter.kind === FieldFilterKind.DateTimeRange) {
    const selectable = field.filter.kind === FieldFilterKind.DateTimeRange && field.filter.timezoneSelectable;
    return <div className="grid gap-2">{selectable ? <label className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold">输入时区</span><select value={filter.offsetHours} onChange={(event) => onChange({ ...filter, offsetHours: Number(event.target.value) })} className={`h-7 rounded-md border px-2 text-xs font-mono ${theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`}>{Array.from({ length: 27 }, (_, index) => index - 12).map((offset) => <option key={offset} value={offset}>{offset === 0 ? 'UTC' : `UTC${offset > 0 ? '+' : ''}${offset}`}</option>)}</select></label> : null}<label><span className="block mb-1 text-[11px] font-semibold">开始（含）</span><input autoFocus type="datetime-local" step="0.001" value={filter.start} onChange={(event) => onChange({ ...filter, start: event.target.value })} className={`date-time-input ${inputClass}`} /></label><label><span className="block mb-1 text-[11px] font-semibold">结束（含）</span><input type="datetime-local" step="0.001" value={filter.end} onChange={(event) => onChange({ ...filter, end: event.target.value })} className={`date-time-input ${inputClass}`} /></label></div>;
  }
  if (filter.kind === FieldFilterKind.Select) {
    const multiple = field.filter.kind === FieldFilterKind.Select && field.filter.selection === SelectionMode.Multiple;
    const toggle = (option: string) => onChange({ ...filter, selected: multiple ? filter.selected.includes(option) ? filter.selected.filter((value) => value !== option) : [...filter.selected, option] : [option] });
    const searchable = field.filter.kind === FieldFilterKind.Select && field.filter.searchable;
    return <>{searchable ? <div className={`h-8 mb-2 flex items-center rounded-md border px-2 ${theme === 'light' ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'}`}><Search className="w-3.5 h-3.5 text-indigo-500 mr-1.5" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可选值…" className="min-w-0 flex-1 bg-transparent outline-none text-xs font-mono" /></div> : null}<div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">{visibleOptions.map((option) => { const checked = filter.selected.includes(option); return <button key={option} type="button" onClick={() => toggle(option)} className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs cursor-pointer ${checked ? 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-200' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}><span className="truncate font-mono">{option}</span><span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-400'}`}>{checked ? <Check className="w-3 h-3" /> : null}</span></button>; })}{visibleOptions.length === 0 ? <p className="py-5 text-center text-[11px] text-slate-500">没有匹配的可选值</p> : null}</div></>;
  }
  return null;
}

export function ConfiguredFieldFilterPopover({ field, filter, options, anchor, theme, onApply, onClose }: ConfiguredFieldFilterPopoverProps) {
  const [draft, setDraft] = useState(filter);
  const isLight = theme === 'light';
  const error = filterError(draft);
  const clear = () => {
    onApply(createRuntimeFieldFilter(field));
    onClose();
  };
  const apply = () => {
    if (error) return;
    onApply({ ...draft, value: draft.value.trim() });
    onClose();
  };
  return createPortal(<><button type="button" aria-label="关闭字段筛选" onClick={onClose} className="fixed inset-0 z-[110] cursor-default" /><section role="dialog" aria-label={`${field.label}字段筛选`} style={position(anchor)} className={`fixed z-[120] rounded-xl border shadow-[0_14px_40px_rgba(15,23,42,0.22)] overflow-hidden ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'}`}><header className={`flex items-start justify-between gap-3 px-3.5 py-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}><div><h3 className="flex items-center gap-1.5 text-sm font-semibold"><Filter className="w-4 h-4 text-indigo-500" />筛选：{field.label}</h3><p className={`mt-0.5 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{filterDescription(field)}</p></div><button type="button" onClick={onClose} className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-4 h-4" /></button></header><div className="p-3.5"><FilterEditor field={field} filter={draft} options={options} theme={theme} onChange={setDraft} /></div><div aria-live="polite" className="min-h-6 px-3.5">{error ? <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p> : null}</div><footer className={`flex items-center justify-between px-3.5 py-2.5 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}><button type="button" disabled={!isRuntimeFilterActive(filter)} onClick={clear} className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-500 hover:text-rose-600 disabled:opacity-35 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />清除</button><div className="flex gap-1.5"><button type="button" onClick={onClose} className={`px-3 py-1.5 rounded-md border text-[11px] ${isLight ? 'border-slate-300' : 'border-slate-700'} cursor-pointer`}>取消</button><button type="button" disabled={Boolean(error)} onClick={apply} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold disabled:opacity-40 cursor-pointer"><Check className="w-3.5 h-3.5" />应用</button></div></footer></section></>, document.body);
}
