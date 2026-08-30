export enum ContractVersion {
  V1 = '1.0',
}

export enum BuiltinFormatId {
  LegacyStandard = 'builtin-standard-bracket-v1',
}

export enum ParserKind {
  Bracketed = 'bracketed',
  AnchoredBracketed = 'anchored-bracketed',
  Regex = 'regex',
  Json = 'json',
}

export enum FieldType {
  String = 'string',
  Integer = 'integer',
  Number = 'number',
  Boolean = 'boolean',
  DateTime = 'datetime',
  Enum = 'enum',
  Json = 'json',
}

export enum FieldRole {
  Timestamp = 'timestamp',
  Level = 'level',
  Message = 'message',
  RequestId = 'request-id',
  Function = 'function',
  ThreadId = 'thread-id',
  MemoryAddress = 'memory-address',
  Module = 'module',
  SourceFile = 'source-file',
  SourceLine = 'source-line',
}

export enum FieldFilterKind {
  None = 'none',
  Text = 'text',
  NumberRange = 'number-range',
  DateTimeRange = 'datetime-range',
  Select = 'select',
}

export enum SelectionMode {
  Single = 'single',
  Multiple = 'multiple',
}

export enum OptionSource {
  DistinctValues = 'distinct-values',
}

export enum TextOperator {
  Contains = 'contains',
}

export enum NormalizeOperation {
  Trim = 'trim',
  Uppercase = 'uppercase',
  Lowercase = 'lowercase',
  Map = 'map',
}

export enum ParseFailureAction {
  EmitUnparsed = 'emit-unparsed',
  Reject = 'reject',
}

export enum ConfigErrorCode {
  FetchFailed = 'CFG_FETCH_FAILED',
  InvalidRoot = 'CFG_INVALID_ROOT',
  VersionUnsupported = 'CFG_VERSION_UNSUPPORTED',
  FormatIdDuplicate = 'CFG_FORMAT_ID_DUPLICATE',
  FieldIdDuplicate = 'CFG_FIELD_ID_DUPLICATE',
  RoleDuplicate = 'CFG_ROLE_DUPLICATE',
  ParserBindingUnknown = 'CFG_PARSER_BINDING_UNKNOWN',
  FilterTypeMismatch = 'CFG_FILTER_TYPE_MISMATCH',
  DateTimeFormatMissing = 'CFG_DATETIME_FORMAT_MISSING',
  TestFailed = 'CFG_TEST_FAILED',
}

export interface FormatMatchConfig {
  filePatterns?: string[];
  probe?: {
    kind: 'regex';
    pattern: string;
  };
  priority?: number;
}

export interface RecordConfig {
  mode: 'line';
  encoding?: string;
  skipEmpty?: boolean;
}

export interface BracketedParserConfig {
  id: string;
  kind: ParserKind.Bracketed;
  open: string;
  close: string;
  nested?: boolean;
  bindings: Record<string, number>;
}

export interface AnchoredBracketedParserConfig {
  id: string;
  kind: ParserKind.AnchoredBracketed;
  open: string;
  close: string;
  head: string[];
  body: string;
  tail: string[];
}

export interface RegexParserConfig {
  id: string;
  kind: ParserKind.Regex;
  pattern: string;
  flags?: string;
  remainderField?: string;
  partial?: boolean;
}

export interface JsonParserConfig {
  id: string;
  kind: ParserKind.Json;
  bindings: Record<string, string>;
}

export type ParserConfig = BracketedParserConfig | AnchoredBracketedParserConfig | RegexParserConfig | JsonParserConfig;

export interface NormalizeConfig {
  op: NormalizeOperation;
  values?: Record<string, string>;
}

export interface FieldDisplayConfig {
  visible?: boolean;
  width?: number;
  grow?: boolean;
  align?: 'left' | 'center' | 'right';
  copyable?: boolean;
}

export interface NoneFilterConfig {
  kind: FieldFilterKind.None;
}

export interface TextFilterConfig {
  kind: FieldFilterKind.Text;
  defaultOperator?: TextOperator;
  allowRegex?: boolean;
  caseSensitiveDefault?: boolean;
}

export interface NumberRangeFilterConfig {
  kind: FieldFilterKind.NumberRange;
  inclusiveMin?: boolean;
  inclusiveMax?: boolean;
}

export interface DateTimeRangeFilterConfig {
  kind: FieldFilterKind.DateTimeRange;
  inclusiveStart?: boolean;
  inclusiveEnd?: boolean;
  timezoneSelectable?: boolean;
}

export interface SelectFilterConfig {
  kind: FieldFilterKind.Select;
  selection: SelectionMode;
  searchable?: boolean;
  options?: string[];
  optionsSource?: OptionSource;
  combine?: 'or';
}

export type FieldFilterConfig = NoneFilterConfig | TextFilterConfig | NumberRangeFilterConfig | DateTimeRangeFilterConfig | SelectFilterConfig;

export interface LogFieldConfig {
  id: string;
  label: string;
  role?: FieldRole;
  type: FieldType;
  required?: boolean;
  normalize?: NormalizeConfig[];
  datetime?: {
    formats: string[];
    timezone?: 'preserve' | 'utc' | 'local';
  };
  display?: FieldDisplayConfig;
  filter: FieldFilterConfig;
}

export interface FormatTestConfig {
  name: string;
  input: string;
  expect: {
    parser?: string;
    fields: Record<string, string | number | boolean | null>;
  };
}

export interface LogFormatConfig {
  id: string;
  name: string;
  enabled?: boolean;
  match?: FormatMatchConfig;
  record: RecordConfig;
  parsers: ParserConfig[];
  onParseFailure?: {
    action: ParseFailureAction;
    messageField?: string;
  };
  fields: LogFieldConfig[];
  tests?: FormatTestConfig[];
  builtin?: boolean;
}

export interface LogViewerConfig {
  contractVersion: ContractVersion;
  defaultFormat?: string;
  formats: LogFormatConfig[];
}

export interface ConfigError {
  code: ConfigErrorCode;
  path: string;
  message: string;
}

export interface ConfigLoadResult {
  formats: LogFormatConfig[];
  defaultFormat: string;
  errors: ConfigError[];
}

export interface RuntimeFieldFilter {
  kind: FieldFilterKind;
  value: string;
  matchCase: boolean;
  isRegex: boolean;
  min: string;
  max: string;
  start: string;
  end: string;
  offsetHours: number;
  selected: string[];
}

export type RuntimeFieldFilters = Record<string, RuntimeFieldFilter>;

export interface RuntimeFilterSummary {
  key: string;
  label: string;
  summary: string;
}
