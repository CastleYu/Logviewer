import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Check, Clock3, RotateCcw, X } from 'lucide-react';
import { FilterOptions, ThemeMode } from '../types';
import { formatMsForInput, parseInputTimeToMs } from '../utils/dateUtils';

interface DateRangeFilterProps {
  filter: FilterOptions;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterChange: (updated: Partial<FilterOptions>) => void;
  timeRange: [number, number] | null;
  theme: ThemeMode;
}

const UTC_OFFSETS = Array.from({ length: 27 }, (_, index) => index - 12);

function offsetLabel(offset: number): string {
  if (offset === 0) return 'UTC';
  return `UTC${offset > 0 ? '+' : ''}${offset}`;
}

function compactTime(value: string): string {
  if (!value) return '';
  return value.replace('T', ' ').replace(/:\d{2}\.\d{3}$/, '');
}

export function DateRangeFilter({
  filter,
  isOpen,
  onOpenChange,
  onFilterChange,
  timeRange,
  theme,
}: DateRangeFilterProps) {
  const isLight = theme === 'light';
  const [start, setStart] = useState(filter.startTime);
  const [end, setEnd] = useState(filter.endTime);
  const [offset, setOffset] = useState(filter.isUtcOffset ? filter.utcOffsetHours : 0);

  useEffect(() => {
    if (!isOpen) return;
    setStart(filter.startTime);
    setEnd(filter.endTime);
    setOffset(filter.isUtcOffset ? filter.utcOffsetHours : 0);
  }, [isOpen, filter.startTime, filter.endTime, filter.isUtcOffset, filter.utcOffsetHours]);

  const startMs = useMemo(
    () => parseInputTimeToMs(start, offset !== 0, offset),
    [start, offset],
  );
  const endMs = useMemo(
    () => parseInputTimeToMs(end, offset !== 0, offset, true),
    [end, offset],
  );

  const error = useMemo(() => {
    if (start && startMs === null) return '开始时间格式无效，请重新选择';
    if (end && endMs === null) return '结束时间格式无效，请重新选择';
    if (startMs !== null && endMs !== null && startMs > endMs) {
      return '开始时间不能晚于结束时间';
    }
    return '';
  }, [start, end, startMs, endMs]);

  const hasValue = Boolean(filter.startTime || filter.endTime);
  const summary = hasValue
    ? `${compactTime(filter.startTime) || '最早'} → ${compactTime(filter.endTime) || '最晚'}`
    : '';

  const setQuickRange = (minutes?: number) => {
    if (!timeRange) return;
    const [min, max] = timeRange;
    const from = minutes ? Math.max(min, max - minutes * 60_000) : min;
    setStart(formatMsForInput(from, offset));
    setEnd(formatMsForInput(max, offset));
  };

  const changeOffset = (next: number) => {
    const currentStart = parseInputTimeToMs(start, offset !== 0, offset);
    const currentEnd = parseInputTimeToMs(end, offset !== 0, offset, true);
    setOffset(next);
    if (currentStart !== null) setStart(formatMsForInput(currentStart, next));
    if (currentEnd !== null) setEnd(formatMsForInput(currentEnd, next));
  };

  const clear = () => {
    setStart('');
    setEnd('');
    onFilterChange({ startTime: '', endTime: '' });
    onOpenChange(false);
  };

  const apply = () => {
    if (error) return;
    onFilterChange({
      startTime: start,
      endTime: end,
      isUtcOffset: offset !== 0,
      utcOffsetHours: offset,
    });
    onOpenChange(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`h-[30px] flex max-w-[310px] items-center gap-1.5 rounded-md border px-2 text-xs transition-all cursor-pointer ${
          hasValue
            ? isLight
              ? 'bg-indigo-50 text-indigo-950 border-indigo-400 shadow-sm'
              : 'bg-indigo-950/80 text-indigo-200 border-indigo-500/70 shadow-sm'
            : isLight
              ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
        }`}
        title={summary || '按日志时间筛选'}
      >
        <CalendarRange className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <span className="font-medium shrink-0">日期</span>
        {hasValue && <span className="truncate font-mono text-[10px]">{summary}</span>}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="日期范围筛选"
          className={`absolute left-0 top-full mt-1.5 w-[min(420px,calc(100vw-24px))] rounded-xl border p-3.5 shadow-[0_14px_40px_rgba(15,23,42,0.22)] z-[100] ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <CalendarRange className="w-4 h-4 text-indigo-500" />
                日期范围
              </h3>
              <p className={`mt-0.5 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                开始和结束时刻均包含在筛选结果中
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="关闭日期筛选"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 mb-3 ${
            isLight ? 'bg-slate-100/80' : 'bg-slate-950'
          }`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock3 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-[11px] font-medium">输入时区</span>
            </div>
            <select
              value={offset}
              onChange={(event) => changeOffset(Number(event.target.value))}
              className={`h-7 rounded-md border px-2 text-xs font-mono outline-none focus:border-indigo-500 cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
              aria-label="输入时区"
            >
              {UTC_OFFSETS.map((value) => (
                <option key={value} value={value}>{offsetLabel(value)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="min-w-0">
              <span className={`block mb-1 text-[11px] font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                开始（含）
              </span>
              <input
                type="datetime-local"
                step="0.001"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className={`date-time-input h-9 w-full rounded-md border px-2 text-[11px] font-mono outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
                }`}
              />
            </label>
            <label className="min-w-0">
              <span className={`block mb-1 text-[11px] font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                结束（含）
              </span>
              <input
                type="datetime-local"
                step="0.001"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className={`date-time-input h-9 w-full rounded-md border px-2 text-[11px] font-mono outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
                }`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className={`text-[10px] mr-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>快捷范围</span>
            {[
              ['完整日志', undefined],
              ['最近 1 小时', 60],
              ['最近 5 分钟', 5],
            ].map(([label, minutes]) => (
              <button
                key={String(label)}
                type="button"
                disabled={!timeRange}
                onClick={() => setQuickRange(minutes as number | undefined)}
                className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${
                  timeRange
                    ? isLight
                      ? 'bg-white hover:bg-indigo-50 border-slate-300 text-indigo-800 cursor-pointer'
                      : 'bg-slate-900 hover:bg-indigo-950 border-slate-700 text-indigo-200 cursor-pointer'
                    : 'opacity-40 cursor-not-allowed border-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="min-h-5 pt-1.5">
            {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
          </div>

          <div className={`flex items-center justify-between gap-2 pt-2.5 border-t ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={clear}
              disabled={!hasValue && !start && !end}
              className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-500 hover:text-rose-600 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              清除筛选
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={`px-3 py-1.5 rounded-md border text-[11px] cursor-pointer ${
                  isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                取消
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={Boolean(error)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                应用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
