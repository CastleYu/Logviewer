import {
  ColumnFilterKey,
  ColumnFilterState,
  LogEntry,
  NumericColumnFilter,
  TextColumnFilter,
} from '../types';

export function createTextFilter(): TextColumnFilter {
  return { value: '', matchCase: false, isRegex: false };
}

export function createNumericFilter(): NumericColumnFilter {
  return { min: '', max: '' };
}

export function createColumnFilters(): ColumnFilterState {
  return {
    index: createNumericFilter(),
    requestId: createTextFilter(),
    operationDesc: createTextFilter(),
    functionName: createTextFilter(),
    memoryAddress: createTextFilter(),
    fileName: createTextFilter(),
  };
}

export function isTextFilterActive(filter: TextColumnFilter): boolean {
  return filter.value.trim().length > 0;
}

export function isNumericFilterActive(filter: NumericColumnFilter): boolean {
  return filter.min.trim().length > 0 || filter.max.trim().length > 0;
}

export function isTextFilterValid(filter: TextColumnFilter): boolean {
  if (!filter.isRegex || !filter.value.trim()) return true;
  try {
    new RegExp(filter.value, filter.matchCase ? '' : 'i');
    return true;
  } catch {
    return false;
  }
}

export function isNumericFilterValid(filter: NumericColumnFilter): boolean {
  const min = filter.min.trim() ? Number(filter.min) : null;
  const max = filter.max.trim() ? Number(filter.max) : null;
  if (min !== null && (!Number.isFinite(min) || min < 1)) return false;
  if (max !== null && (!Number.isFinite(max) || max < 1)) return false;
  return min === null || max === null || min <= max;
}

export function matchText(value: string, filter: TextColumnFilter): boolean {
  const query = filter.value.trim();
  if (!query) return true;
  if (filter.isRegex) {
    try {
      return new RegExp(query, filter.matchCase ? '' : 'i').test(value);
    } catch {
      return false;
    }
  }
  return filter.matchCase
    ? value.includes(query)
    : value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export function matchNumeric(value: number, filter: NumericColumnFilter): boolean {
  const min = filter.min.trim() ? Number(filter.min) : null;
  const max = filter.max.trim() ? Number(filter.max) : null;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

export function matchColumnFilters(log: LogEntry, filters: ColumnFilterState): boolean {
  if (!matchNumeric(log.lineNumber, filters.index)) return false;

  const textFilters: Array<[ColumnFilterKey, TextColumnFilter]> = [
    [ColumnFilterKey.RequestId, filters.requestId],
    [ColumnFilterKey.OperationDesc, filters.operationDesc],
    [ColumnFilterKey.FunctionName, filters.functionName],
    [ColumnFilterKey.MemoryAddress, filters.memoryAddress],
    [ColumnFilterKey.FileName, filters.fileName],
  ];
  const hasTextFilter = textFilters.some(([, filter]) => isTextFilterActive(filter));
  if (!hasTextFilter) return true;
  if (!log.success || !log.fields) return false;

  for (const [key, filter] of textFilters) {
    if (!isTextFilterActive(filter)) continue;
    if (!matchText(String(log.fields[key] ?? ''), filter)) return false;
  }
  return true;
}
