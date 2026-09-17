import {
  AnchoredBracketedParserConfig,
  BracketedParserConfig,
  FieldRole,
  FieldType,
  FormatTestConfig,
  JsonParserConfig,
  LogFieldConfig,
  LogFormatConfig,
  NormalizeOperation,
  ParseFailureAction,
  ParserConfig,
  ParserKind,
  RegexParserConfig,
} from '../config/logFormatTypes';
import { LogEntry, LogStats, ParsedLogFields } from '../types';
import { parseConfiguredDateTime } from './dateUtils';
import { RecordMode, StackPattern } from '../config/stackTypes';
import { splitRecords } from './logRecords';
import { attachStack } from './recordEntries';

export function createCanonicalFields(rawText: string): ParsedLogFields {
  return {
    timestamp: '-',
    level: 'INFO',
    requestId: '-',
    operationDesc: rawText,
    functionName: '-',
    threadId: '-',
    memoryAddress: '-',
    module: '-',
    fileName: '-',
    lineNumber: '-',
  };
}

export function extractBracketed(line: string, open: string, close: string, nested: boolean): string[] | null {
  const fields: string[] = [];
  let index = 0;
  while (index < line.length) {
    while (index < line.length && /\s/.test(line[index])) index++;
    if (index >= line.length) break;
    if (!line.startsWith(open, index)) return null;
    index += open.length;
    const start = index;
    let depth = 1;
    while (index < line.length && depth > 0) {
      if (nested && line.startsWith(open, index)) {
        depth++;
        index += open.length;
        continue;
      }
      if (line.startsWith(close, index)) {
        depth--;
        if (depth === 0) {
          fields.push(line.slice(start, index));
          index += close.length;
          break;
        }
        index += close.length;
        continue;
      }
      index++;
    }
    if (depth > 0) return null;
  }
  return fields;
}

export function parseBracketedStage(line: string, parser: BracketedParserConfig): Record<string, unknown> | null {
  const values = extractBracketed(line, parser.open, parser.close, Boolean(parser.nested));
  if (!values) return null;
  const maxIndex = Math.max(...Object.values(parser.bindings));
  if (values.length <= maxIndex) return null;
  const fields: Record<string, unknown> = {};
  for (const [fieldId, index] of Object.entries(parser.bindings)) fields[fieldId] = values[index];
  return fields;
}

export function parseAnchoredStage(line: string, parser: AnchoredBracketedParserConfig): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};
  let left = 0;
  while (left < line.length && /\s/.test(line[left])) left++;
  for (const fieldId of parser.head) {
    if (!line.startsWith(parser.open, left)) return null;
    const end = line.indexOf(parser.close, left + parser.open.length);
    if (end < 0) return null;
    fields[fieldId] = line.slice(left + parser.open.length, end);
    left = end + parser.close.length;
    while (left < line.length && /\s/.test(line[left])) left++;
  }

  let right = line.length;
  while (right > left && /\s/.test(line[right - 1])) right--;
  for (let index = parser.tail.length - 1; index >= 0; index--) {
    if (!line.slice(0, right).endsWith(parser.close)) return null;
    const closeStart = right - parser.close.length;
    const openStart = line.lastIndexOf(parser.open, closeStart - 1);
    if (openStart < left) return null;
    fields[parser.tail[index]] = line.slice(openStart + parser.open.length, closeStart);
    right = openStart;
    while (right > left && /\s/.test(line[right - 1])) right--;
  }

  let body = line.slice(left, right).trim();
  if (body.startsWith(parser.open)) body = body.slice(parser.open.length);
  if (body.endsWith(parser.close)) body = body.slice(0, -parser.close.length);
  fields[parser.body] = body;
  return fields;
}

export function parseRegexStage(line: string, parser: RegexParserConfig): Record<string, unknown> | null {
  let regex: RegExp;
  try {
    regex = new RegExp(parser.pattern, parser.flags);
  } catch {
    return null;
  }
  const match = regex.exec(line);
  if (!match) return null;
  const fields: Record<string, unknown> = { ...(match.groups || {}) };
  if (parser.remainderField && fields[parser.remainderField] === undefined) {
    fields[parser.remainderField] = parser.partial ? line : line.slice(match.index + match[0].length).trim();
  }
  return fields;
}

export function readJsonPath(value: unknown, path: string): unknown {
  if (!path.startsWith('$.')) return undefined;
  const parts = path.slice(2).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function parseJsonStage(line: string, parser: JsonParserConfig): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const fields: Record<string, unknown> = {};
  for (const [fieldId, path] of Object.entries(parser.bindings)) fields[fieldId] = readJsonPath(value, path);
  return fields;
}

export function parseStage(line: string, parser: ParserConfig): Record<string, unknown> | null {
  switch (parser.kind) {
    case ParserKind.Bracketed: return parseBracketedStage(line, parser);
    case ParserKind.AnchoredBracketed: return parseAnchoredStage(line, parser);
    case ParserKind.Regex: return parseRegexStage(line, parser);
    case ParserKind.Json: return parseJsonStage(line, parser);
  }
}

export function normalizeValue(value: unknown, field: LogFieldConfig): unknown {
  let result = value;
  for (const transform of field.normalize || []) {
    if (transform.op === NormalizeOperation.Trim && typeof result === 'string') result = result.trim();
    else if (transform.op === NormalizeOperation.Uppercase && typeof result === 'string') result = result.toUpperCase();
    else if (transform.op === NormalizeOperation.Lowercase && typeof result === 'string') result = result.toLowerCase();
    else if (transform.op === NormalizeOperation.Map && typeof result === 'string') result = transform.values?.[result] ?? result;
  }
  return result;
}

export function coerceValue(value: unknown, field: LogFieldConfig): unknown {
  if (value === undefined || value === null || value === '') return value;
  switch (field.type) {
    case FieldType.String:
    case FieldType.Enum:
      return String(value);
    case FieldType.DateTime: {
      const text = String(value);
      return parseConfiguredDateTime(text, field.datetime?.timezone) === null ? undefined : text;
    }
    case FieldType.Integer: {
      const parsed = Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case FieldType.Number: {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case FieldType.Boolean: {
      if (typeof value === 'boolean') return value;
      const text = String(value).toLowerCase();
      if (text === 'true' || text === '1') return true;
      if (text === 'false' || text === '0') return false;
      return undefined;
    }
    case FieldType.Json:
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { return undefined; }
  }
}

export function applyRole(fields: ParsedLogFields, field: LogFieldConfig, value: unknown): void {
  const text = value === undefined || value === null ? '-' : typeof value === 'string' ? value : JSON.stringify(value);
  switch (field.role) {
    case FieldRole.Timestamp: fields.timestamp = text; break;
    case FieldRole.Level: fields.level = text; break;
    case FieldRole.Message: fields.operationDesc = text; break;
    case FieldRole.RequestId: fields.requestId = text; break;
    case FieldRole.Function: fields.functionName = text; break;
    case FieldRole.ThreadId: fields.threadId = text; break;
    case FieldRole.MemoryAddress: fields.memoryAddress = text; break;
    case FieldRole.Module: fields.module = text; break;
    case FieldRole.SourceFile: fields.fileName = text; break;
    case FieldRole.SourceLine: fields.lineNumber = text; break;
  }
}

export function finalizeFields(raw: Record<string, unknown>, format: LogFormatConfig, line: string): ParsedLogFields | null {
  const fields = createCanonicalFields(line);
  for (const field of format.fields) {
    const normalized = normalizeValue(raw[field.id], field);
    const value = coerceValue(normalized, field);
    if (field.required && (value === undefined || value === null || value === '')) return null;
    fields[field.id] = value ?? null;
    applyRole(fields, field, value);
  }
  return fields;
}

export function parseConfiguredLogLine(lineText: string, index: number, format: LogFormatConfig): LogEntry {
  const line = lineText.trimEnd();
  if (!line.trim()) {
    return { id: index, lineNumber: index + 1, success: false, rawText: lineText, parseErrorReason: '空行数据' };
  }
  for (const parser of format.parsers) {
    const raw = parseStage(line, parser);
    if (!raw) continue;
    const fields = finalizeFields(raw, format, line);
    if (!fields) continue;
    return { id: index, lineNumber: index + 1, success: true, fields, rawText: lineText, parserId: parser.id };
  }
  if (format.onParseFailure?.action === ParseFailureAction.EmitUnparsed) {
    const fields = createCanonicalFields(line);
    const messageField = format.onParseFailure.messageField;
    if (messageField) fields[messageField] = line;
    return { id: index, lineNumber: index + 1, success: true, fields, rawText: lineText, parserId: 'fallback' };
  }
  return { id: index, lineNumber: index + 1, success: false, rawText: lineText, parseErrorReason: '没有解析器匹配该记录' };
}

export function parseConfiguredLogContent(fullContent: string, fileName: string, fileSize: number, format: LogFormatConfig): { logs: LogEntry[]; stats: LogStats } {
  const startTime = performance.now();
  const rawLines = fullContent.split(/\r?\n/);
  if (rawLines.at(-1) === '') rawLines.pop();
  const json = format.parsers.every((parser) => parser.kind === ParserKind.Json);
  const pattern = format.record.startPattern ? new RegExp(format.record.startPattern) : StackPattern.header;
  const hasJson = format.parsers.some((parser) => parser.kind === ParserKind.Json);
  const isJson = (line: string) => {
    if (!hasJson) return false;
    const entry = parseConfiguredLogLine(line, 0, format);
    return format.parsers.some((parser) => parser.kind === ParserKind.Json && parser.id === entry.parserId);
  };
  const isHead = (line: string) => pattern.test(line) || isJson(line);
  const message = (line: string) => {
    const fields = parseConfiguredLogLine(line, 0, format).fields;
    const body = format.record.stackField ? fields?.[format.record.stackField] : fields?.operationDesc;
    return typeof body === 'string' ? body : line;
  };
  const records = splitRecords(fullContent, json ? RecordMode.Line : format.record.mode, isHead, message, isJson);
  const logs = records.map((item) => {
    // Bracket formats can wrap the entire multiline message before their tail fields.
    const whole = item.end > item.start && item.raw.trimEnd().endsWith(']')
      ? format.parsers.filter((parser) => parser.kind === ParserKind.Bracketed || parser.kind === ParserKind.AnchoredBracketed)
        .some((parser) => { const fields = parseStage(item.raw, parser); return fields && finalizeFields(fields, format, item.raw); }) : false;
    return attachStack(parseConfiguredLogLine(whole ? item.raw : item.head, item.start - 1, format), item, format.record, isHead(item.head), format, whole);
  });
  const levelCounts: Record<string, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, OTHER: 0 };
  let successCount = 0;
  for (const log of logs) {
    if (!log.success || !log.fields) continue;
    successCount++;
    const level = log.fields.level;
    levelCounts[level] = levelCounts[level] === undefined ? 1 : levelCounts[level] + 1;
  }
  return {
    logs,
    stats: {
      physicalLineCount: rawLines.length,
      fileName,
      fileSize,
      totalCount: logs.length,
      successCount,
      failedCount: logs.length - successCount,
      parseDurationMs: Math.round((performance.now() - startTime) * 100) / 100,
      levelCounts,
    },
  };
}

export function runFormatTest(format: LogFormatConfig, test: FormatTestConfig): string | null {
  const result = parseConfiguredLogLine(test.input, 0, format);
  if (!result.success || !result.fields) return '记录解析失败';
  if (test.expect.parser && result.parserId !== test.expect.parser) return `预期解析器 ${test.expect.parser}，实际为 ${result.parserId}`;
  for (const [fieldId, expected] of Object.entries(test.expect.fields)) {
    if (JSON.stringify(result.fields[fieldId]) !== JSON.stringify(expected)) {
      return `字段 ${fieldId} 预期 ${JSON.stringify(expected)}，实际为 ${JSON.stringify(result.fields[fieldId])}`;
    }
  }
  return null;
}
