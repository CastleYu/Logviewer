import {
  FieldFilterKind,
  FieldType,
  LogFieldConfig,
  LogFormatConfig,
  RuntimeFieldFilter,
  RuntimeFieldFilters,
  RuntimeFilterSummary,
} from '../config/logFormatTypes';
import { LogEntry } from '../types';
import { parseConfiguredDateTime, parseInputTimeToMs } from './dateUtils';

export function createRuntimeFieldFilter(field: LogFieldConfig): RuntimeFieldFilter {
  return {
    kind: field.filter.kind,
    value: '',
    matchCase: field.filter.kind === FieldFilterKind.Text ? Boolean(field.filter.caseSensitiveDefault) : false,
    isRegex: false,
    min: '',
    max: '',
    start: '',
    end: '',
    offsetHours: 0,
    selected: [],
  };
}

export function createConfiguredFilters(format: LogFormatConfig): RuntimeFieldFilters {
  const filters: RuntimeFieldFilters = {};
  for (const field of format.fields) {
    if (field.filter.kind === FieldFilterKind.None) continue;
    filters[field.id] = createRuntimeFieldFilter(field);
  }
  return filters;
}

export function isRuntimeFilterActive(filter: RuntimeFieldFilter): boolean {
  switch (filter.kind) {
    case FieldFilterKind.Text: return filter.value.trim().length > 0;
    case FieldFilterKind.NumberRange: return Boolean(filter.min.trim() || filter.max.trim());
    case FieldFilterKind.DateTimeRange: return Boolean(filter.start || filter.end);
    case FieldFilterKind.Select: return filter.selected.length > 0;
    case FieldFilterKind.None: return false;
  }
}

export function isRuntimeFilterValid(filter: RuntimeFieldFilter): boolean {
  if (filter.kind === FieldFilterKind.Text && filter.isRegex && filter.value.trim()) {
    try {
      new RegExp(filter.value, filter.matchCase ? '' : 'i');
    } catch {
      return false;
    }
  }
  if (filter.kind === FieldFilterKind.NumberRange) {
    const min = filter.min.trim() ? Number(filter.min) : null;
    const max = filter.max.trim() ? Number(filter.max) : null;
    if (min !== null && !Number.isFinite(min)) return false;
    if (max !== null && !Number.isFinite(max)) return false;
    if (min !== null && max !== null && min > max) return false;
  }
  if (filter.kind === FieldFilterKind.DateTimeRange) {
    const start = filter.start ? parseInputTimeToMs(filter.start, filter.offsetHours !== 0, filter.offsetHours) : null;
    const end = filter.end ? parseInputTimeToMs(filter.end, filter.offsetHours !== 0, filter.offsetHours, true) : null;
    if (filter.start && !Number.isFinite(start)) return false;
    if (filter.end && !Number.isFinite(end)) return false;
    if (start !== null && end !== null && start > end) return false;
  }
  return true;
}

export function matchRuntimeFilter(value: unknown, filter: RuntimeFieldFilter, field?: LogFieldConfig): boolean {
  if (!isRuntimeFilterActive(filter)) return true;
  if (value === null || value === undefined) return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  switch (filter.kind) {
    case FieldFilterKind.Text: {
      const query = filter.value.trim();
      if (filter.isRegex) {
        try {
          return new RegExp(query, filter.matchCase ? '' : 'i').test(text);
        } catch {
          return false;
        }
      }
      return filter.matchCase ? text.includes(query) : text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    }
    case FieldFilterKind.NumberRange: {
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      const min = filter.min.trim() ? Number(filter.min) : null;
      const max = filter.max.trim() ? Number(filter.max) : null;
      const config = field?.filter.kind === FieldFilterKind.NumberRange ? field.filter : null;
      const matchesMin = min === null || (config?.inclusiveMin === false ? number > min : number >= min);
      const matchesMax = max === null || (config?.inclusiveMax === false ? number < max : number <= max);
      return matchesMin && matchesMax;
    }
    case FieldFilterKind.DateTimeRange: {
      const timezone = field?.type === FieldType.DateTime ? field.datetime?.timezone : undefined;
      const time = typeof value === 'string' ? parseConfiguredDateTime(value, timezone) : Number(value);
      if (time === null || !Number.isFinite(time)) return false;
      const start = filter.start ? parseInputTimeToMs(filter.start, filter.offsetHours !== 0, filter.offsetHours) : null;
      const end = filter.end ? parseInputTimeToMs(filter.end, filter.offsetHours !== 0, filter.offsetHours, true) : null;
      const config = field?.filter.kind === FieldFilterKind.DateTimeRange ? field.filter : null;
      const matchesStart = start === null || (config?.inclusiveStart === false ? time > start : time >= start);
      const matchesEnd = end === null || (config?.inclusiveEnd === false ? time < end : time <= end);
      return matchesStart && matchesEnd;
    }
    case FieldFilterKind.Select: return filter.selected.includes(text);
    case FieldFilterKind.None: return true;
  }
}

export function matchConfiguredFilters(log: LogEntry, format: LogFormatConfig, filters: RuntimeFieldFilters): boolean {
  for (const field of format.fields) {
    const filter = filters[field.id];
    if (!filter || !isRuntimeFilterActive(filter)) continue;
    if (!log.success || !log.fields) return false;
    if (!matchRuntimeFilter(log.fields[field.id], filter, field)) return false;
  }
  return true;
}

export function configuredFilterSummaries(format: LogFormatConfig, filters: RuntimeFieldFilters): RuntimeFilterSummary[] {
  const summaries: RuntimeFilterSummary[] = [];
  for (const field of format.fields) {
    const filter = filters[field.id];
    if (!filter || !isRuntimeFilterActive(filter)) continue;
    let summary = '';
    switch (filter.kind) {
      case FieldFilterKind.Text:
        summary = `${filter.isRegex ? '正则' : filter.matchCase ? '区分大小写' : '包含'}：${filter.value}`;
        break;
      case FieldFilterKind.NumberRange:
        summary = `${filter.min || '最小'} – ${filter.max || '最大'}`;
        break;
      case FieldFilterKind.DateTimeRange:
        summary = `${filter.start || '最早'} → ${filter.end || '最晚'}`;
        break;
      case FieldFilterKind.Select:
        summary = filter.selected.join('、');
        break;
      case FieldFilterKind.None:
        break;
    }
    summaries.push({ key: field.id, label: field.label, summary });
  }
  return summaries;
}

export function clearConfiguredFilter(format: LogFormatConfig, filters: RuntimeFieldFilters, fieldId: string): RuntimeFieldFilters {
  const field = format.fields.find((item) => item.id === fieldId);
  if (!field) return filters;
  return { ...filters, [fieldId]: createRuntimeFieldFilter(field) };
}

export function distinctFieldValues(logs: LogEntry[], fieldId: string): string[] {
  const values = new Set<string>();
  for (const log of logs) {
    const value = log.fields?.[fieldId];
    if (value === null || value === undefined || value === '') continue;
    values.add(typeof value === 'string' ? value : JSON.stringify(value));
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}
