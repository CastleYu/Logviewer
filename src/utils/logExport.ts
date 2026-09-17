import { LogFormatConfig } from '../config/logFormatTypes';
import { LogEntry } from '../types';

export function jsonLogs(logs: LogEntry[]): string {
  return JSON.stringify(logs.map((log) => ({
    lineNumber: log.lineNumber,
    endLineNumber: log.endLineNumber ?? log.lineNumber,
    success: log.success,
    fields: log.fields || null,
    rawText: log.rawText,
    stack: log.stack || null,
  })), null, 2);
}

export function csvValue(value: unknown): string {
  const text = value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvLogs(logs: LogEntry[], format: LogFormatConfig): string {
  const headers = ['Line', 'EndLine', ...format.fields.map((field) => field.label), 'Status', 'RawText'];
  const rows = logs.map((log) => [log.lineNumber, log.endLineNumber ?? log.lineNumber,
    ...format.fields.map((field) => log.fields?.[field.id]), log.success ? 'SUCCESS' : 'FAILED', log.rawText].map(csvValue).join(','));
  return '\uFEFF' + [headers.map(csvValue).join(','), ...rows].join('\n');
}
