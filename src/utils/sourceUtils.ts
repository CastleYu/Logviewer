import type React from 'react';
import { FieldRole, LogFormatConfig } from '../config/logFormatTypes';
import { SourceColumns, SourceConst, SourceTarget } from '../config/sourceTypes';
import { LogEntry } from '../types';

export function sourceColumns(format: LogFormatConfig, overrides: Record<string, SourceColumns>): SourceColumns {
  return overrides[format.id] || {
    file: format.fields.find((f) => f.role === FieldRole.SourceFile)?.id || '',
    line: format.fields.find((f) => f.role === FieldRole.SourceLine)?.id || '',
  };
}

export function sourceTarget(log: LogEntry, columns: SourceColumns): SourceTarget {
  const raw = log.fields?.[columns.file];
  const line = String(log.fields?.[columns.line] ?? '').trim();
  return { file: typeof raw === 'string' ? raw.trim() : '', line: /^\d+$/.test(line) ? Number(line) : NaN };
}

export function sourceField(event: React.MouseEvent): string {
  return (event.target as HTMLElement).closest(SourceConst.CellSelector)?.getAttribute(SourceConst.CellAttr) || '';
}

export function shortPaths(paths: string[]): string[] {
  const parts = paths.map((p) => p.replaceAll('\\', '/').split('/'));
  let common = 0;
  while (parts.length > 1 && parts.every((p) => common < p.length - 1 && p[common] === parts[0][common])) common++;
  return parts.map((p) => `${common ? '…/' : ''}${p.slice(common).join('/')}`);
}
