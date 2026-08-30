import {
  BuiltinFormatId,
  FieldFilterKind,
  FieldRole,
  FieldType,
  LogFormatConfig,
  NormalizeOperation,
  OptionSource,
  ParseFailureAction,
  ParserKind,
  SelectionMode,
  TextOperator,
} from './logFormatTypes';

export function createBuiltinLogFormat(): LogFormatConfig {
  return {
    id: BuiltinFormatId.LegacyStandard,
    name: '标准十字段（兼容现版本）',
    enabled: true,
    builtin: true,
    match: {
      filePatterns: ['*.log', '*.txt', '*.out'],
      priority: 100,
    },
    record: { mode: 'line', encoding: 'utf-8', skipEmpty: true },
    parsers: [
      {
        id: 'nested-brackets',
        kind: ParserKind.Bracketed,
        open: '[',
        close: ']',
        nested: true,
        bindings: {
          timestamp: 0,
          level: 1,
          requestId: 2,
          operationDesc: 3,
          functionName: 4,
          threadId: 5,
          memoryAddress: 6,
          module: 7,
          fileName: 8,
          lineNumber: 9,
        },
      },
      {
        id: 'anchored-brackets',
        kind: ParserKind.AnchoredBracketed,
        open: '[',
        close: ']',
        head: ['timestamp', 'level', 'requestId'],
        body: 'operationDesc',
        tail: ['functionName', 'threadId', 'memoryAddress', 'module', 'fileName', 'lineNumber'],
      },
    ],
    onParseFailure: { action: ParseFailureAction.EmitUnparsed, messageField: 'operationDesc' },
    fields: [
      {
        id: 'timestamp', label: '时间戳', role: FieldRole.Timestamp, type: FieldType.DateTime, required: true,
        normalize: [{ op: NormalizeOperation.Trim }],
        datetime: { formats: ['yyyy-MM-dd HH:mm:ss,SSS', 'yyyy-MM-dd HH:mm:ss.SSS'], timezone: 'preserve' },
        display: { visible: true, width: 176, align: 'left' },
        filter: { kind: FieldFilterKind.DateTimeRange, inclusiveStart: true, inclusiveEnd: true, timezoneSelectable: true },
      },
      {
        id: 'level', label: '级别', role: FieldRole.Level, type: FieldType.Enum, required: true,
        normalize: [
          { op: NormalizeOperation.Trim },
          { op: NormalizeOperation.Uppercase },
          { op: NormalizeOperation.Map, values: { WARNING: 'WARN', ERR: 'ERROR', CRITICAL: 'ERROR' } },
        ],
        display: { visible: true, width: 72, align: 'center' },
        filter: { kind: FieldFilterKind.Select, selection: SelectionMode.Multiple, options: ['DEBUG', 'INFO', 'WARN', 'ERROR'], combine: 'or' },
      },
      {
        id: 'requestId', label: '请求ID', role: FieldRole.RequestId, type: FieldType.String,
        normalize: [{ op: NormalizeOperation.Trim }], display: { visible: true, width: 112 },
        filter: { kind: FieldFilterKind.Text, defaultOperator: TextOperator.Contains, allowRegex: true, caseSensitiveDefault: false },
      },
      {
        id: 'operationDesc', label: '操作描述', role: FieldRole.Message, type: FieldType.String, required: true,
        display: { visible: true, width: 380, grow: true },
        filter: { kind: FieldFilterKind.Text, defaultOperator: TextOperator.Contains, allowRegex: true, caseSensitiveDefault: false },
      },
      {
        id: 'functionName', label: '函数名', role: FieldRole.Function, type: FieldType.String,
        display: { visible: true, width: 160, copyable: true },
        filter: { kind: FieldFilterKind.Text, defaultOperator: TextOperator.Contains, allowRegex: true, caseSensitiveDefault: false },
      },
      {
        id: 'threadId', label: '线程ID', role: FieldRole.ThreadId, type: FieldType.String,
        display: { visible: false, width: 80 },
        filter: { kind: FieldFilterKind.Select, selection: SelectionMode.Single, searchable: true, optionsSource: OptionSource.DistinctValues },
      },
      {
        id: 'memoryAddress', label: '内存地址', role: FieldRole.MemoryAddress, type: FieldType.String,
        display: { visible: false, width: 128 },
        filter: { kind: FieldFilterKind.Text, defaultOperator: TextOperator.Contains, allowRegex: true, caseSensitiveDefault: false },
      },
      {
        id: 'module', label: '模块', role: FieldRole.Module, type: FieldType.String,
        display: { visible: true, width: 112 },
        filter: { kind: FieldFilterKind.Select, selection: SelectionMode.Single, searchable: true, optionsSource: OptionSource.DistinctValues },
      },
      {
        id: 'fileName', label: '文件名', role: FieldRole.SourceFile, type: FieldType.String,
        display: { visible: true, width: 144, copyable: true },
        filter: { kind: FieldFilterKind.Text, defaultOperator: TextOperator.Contains, allowRegex: true, caseSensitiveDefault: false },
      },
      {
        id: 'lineNumber', label: '行号', role: FieldRole.SourceLine, type: FieldType.Integer,
        display: { visible: true, width: 64, align: 'right' },
        filter: { kind: FieldFilterKind.None },
      },
    ],
  };
}
