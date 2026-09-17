import { FieldRole, LogFormatConfig, RecordConfig } from '../config/logFormatTypes';
import { LogRecord, RecordMode, StackText } from '../config/stackTypes';
import { LogEntry } from '../types';
import { parseStack } from './stackParser';

export function attachStack(entry: LogEntry, record: LogRecord, config: RecordConfig, header: boolean, format?: LogFormatConfig, whole = false): LogEntry {
  entry.rawText = record.raw;
  entry.endLineNumber = record.end;
  if (config.mode !== RecordMode.Stack) return entry;
  const field = config.stackField;
  const body = field ? entry.fields?.[field] : entry.fields?.operationDesc;
  const embedded = typeof body === 'string' ? parseStack(body) : undefined;
  entry.stack = whole ? embedded || record.stack : record.stack || embedded;
  if (!entry.stack) return entry;
  if (!header) {
    // A standalone stack has no logger timestamp, request, thread or severity.
    entry.fields = {
      timestamp: StackText.missing, level: StackText.unknownLevel, requestId: StackText.missing,
      operationDesc: record.raw, functionName: StackText.missing, threadId: StackText.missing,
      memoryAddress: StackText.missing, module: StackText.missing, fileName: StackText.missing, lineNumber: StackText.missing,
    };
    entry.success = true;
    delete entry.parseErrorReason;
  } else if (!whole && record.end > record.start && entry.fields) {
    entry.fields.operationDesc += record.raw.slice(record.head.length);
  }
  if (entry.fields && record.end > record.start) {
    const msg = format?.fields.find((item) => item.role === FieldRole.Message);
    if (msg) entry.fields[msg.id] = entry.fields.operationDesc;
  }
  return entry;
}

export function searchText(entry: LogEntry): string {
  return entry.stack ? `${entry.rawText}\n${entry.stack.raw}` : entry.rawText;
}
