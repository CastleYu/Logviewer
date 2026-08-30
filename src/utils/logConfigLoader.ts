import { createBuiltinLogFormat } from '../config/defaultLogFormat';
import {
  BuiltinFormatId,
  ConfigError,
  ConfigErrorCode,
  ConfigLoadResult,
  ContractVersion,
  FieldFilterKind,
  FieldRole,
  FieldType,
  LogFormatConfig,
  LogViewerConfig,
  ParserKind,
} from '../config/logFormatTypes';
import { runFormatTest } from './configurableLogParser';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pushError(errors: ConfigError[], code: ConfigErrorCode, path: string, message: string): void {
  errors.push({ code, path, message });
}

export function isFilterCompatible(field: LogFormatConfig['fields'][number]): boolean {
  if (field.filter.kind === FieldFilterKind.None) return true;
  if (field.filter.kind === FieldFilterKind.Text) return field.type === FieldType.String || field.type === FieldType.Json;
  if (field.filter.kind === FieldFilterKind.NumberRange) return field.type === FieldType.Integer || field.type === FieldType.Number;
  if (field.filter.kind === FieldFilterKind.DateTimeRange) return field.type === FieldType.DateTime;
  if (field.filter.kind === FieldFilterKind.Select) return field.type === FieldType.String || field.type === FieldType.Enum || field.type === FieldType.Boolean;
  return false;
}

export function parserFieldIds(format: LogFormatConfig): string[] {
  const ids: string[] = [];
  for (const parser of format.parsers) {
    if (parser.kind === ParserKind.Bracketed || parser.kind === ParserKind.Json) ids.push(...Object.keys(parser.bindings));
    else if (parser.kind === ParserKind.AnchoredBracketed) ids.push(...parser.head, parser.body, ...parser.tail);
  }
  return ids;
}

export function validateFormat(format: LogFormatConfig, index: number): ConfigError[] {
  const errors: ConfigError[] = [];
  const path = `formats[${index}]`;
  if (!format.id || !format.name || !Array.isArray(format.fields) || !Array.isArray(format.parsers)) {
    pushError(errors, ConfigErrorCode.InvalidRoot, path, '格式必须包含 id、name、fields 和 parsers');
    return errors;
  }
  const fieldIds = new Set<string>();
  const roles = new Set<FieldRole>();
  for (let fieldIndex = 0; fieldIndex < format.fields.length; fieldIndex++) {
    const field = format.fields[fieldIndex];
    const fieldPath = `${path}.fields[${fieldIndex}]`;
    if (fieldIds.has(field.id)) pushError(errors, ConfigErrorCode.FieldIdDuplicate, fieldPath, `字段 id 重复：${field.id}`);
    fieldIds.add(field.id);
    if (field.role) {
      if (roles.has(field.role)) pushError(errors, ConfigErrorCode.RoleDuplicate, fieldPath, `语义角色重复：${field.role}`);
      roles.add(field.role);
    }
    if (!isFilterCompatible(field)) pushError(errors, ConfigErrorCode.FilterTypeMismatch, fieldPath, `筛选器 ${field.filter.kind} 不适用于字段类型 ${field.type}`);
    if (field.type === FieldType.DateTime && (!field.datetime?.formats || field.datetime.formats.length === 0)) {
      pushError(errors, ConfigErrorCode.DateTimeFormatMissing, fieldPath, 'datetime 字段必须声明至少一种格式');
    }
  }
  for (const fieldId of parserFieldIds(format)) {
    if (!fieldIds.has(fieldId)) pushError(errors, ConfigErrorCode.ParserBindingUnknown, path, `解析器引用了不存在的字段：${fieldId}`);
  }
  for (let testIndex = 0; testIndex < (format.tests || []).length; testIndex++) {
    const test = format.tests![testIndex];
    const failure = runFormatTest(format, test);
    if (failure) pushError(errors, ConfigErrorCode.TestFailed, `${path}.tests[${testIndex}]`, `${test.name}：${failure}`);
  }
  return errors;
}

export function validateLogViewerConfig(value: unknown): { config: LogViewerConfig | null; errors: ConfigError[] } {
  const errors: ConfigError[] = [];
  if (!isObject(value) || !Array.isArray(value.formats)) {
    pushError(errors, ConfigErrorCode.InvalidRoot, '$', '根对象必须包含 formats 数组');
    return { config: null, errors };
  }
  if (value.contractVersion !== ContractVersion.V1) {
    pushError(errors, ConfigErrorCode.VersionUnsupported, '$.contractVersion', `仅支持契约版本 ${ContractVersion.V1}`);
    return { config: null, errors };
  }
  const config = value as unknown as LogViewerConfig;
  const formatIds = new Set<string>();
  for (let index = 0; index < config.formats.length; index++) {
    const rawFormat = config.formats[index] as unknown;
    if (!isObject(rawFormat)) {
      pushError(errors, ConfigErrorCode.InvalidRoot, `formats[${index}]`, '格式必须是对象');
      continue;
    }
    const format = rawFormat as unknown as LogFormatConfig;
    if (typeof format.id !== 'string' || !format.id) {
      pushError(errors, ConfigErrorCode.InvalidRoot, `formats[${index}].id`, '格式 id 必须是非空字符串');
      continue;
    }
    if (formatIds.has(format.id) || format.id === BuiltinFormatId.LegacyStandard) {
      pushError(errors, ConfigErrorCode.FormatIdDuplicate, `formats[${index}].id`, `格式 id 重复或占用内置 id：${format.id}`);
    }
    formatIds.add(format.id);
    try {
      errors.push(...validateFormat(format, index));
    } catch (error) {
      pushError(errors, ConfigErrorCode.InvalidRoot, `formats[${index}]`, `格式结构无效：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { config, errors };
}

export function validExternalFormats(config: LogViewerConfig, errors: ConfigError[]): LogFormatConfig[] {
  return config.formats.filter((format, index) => {
    if (!isObject(format as unknown)) return false;
    if (format.enabled === false || format.id === BuiltinFormatId.LegacyStandard) return false;
    const prefix = `formats[${index}]`;
    return !errors.some((error) => error.path === prefix || error.path.startsWith(`${prefix}.`));
  });
}

export async function loadLogViewerConfig(url: string = '/logviewer.config.json'): Promise<ConfigLoadResult> {
  const builtin = createBuiltinLogFormat();
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json() as unknown;
    const result = validateLogViewerConfig(value);
    if (!result.config) return { formats: [builtin], defaultFormat: BuiltinFormatId.LegacyStandard, errors: result.errors };
    const external = validExternalFormats(result.config, result.errors);
    const defaultFormat = external.some((format) => format.id === result.config!.defaultFormat)
      ? result.config.defaultFormat!
      : BuiltinFormatId.LegacyStandard;
    return { formats: [builtin, ...external], defaultFormat, errors: result.errors };
  } catch (error) {
    return {
      formats: [builtin],
      defaultFormat: BuiltinFormatId.LegacyStandard,
      errors: [{ code: ConfigErrorCode.FetchFailed, path: '$', message: `读取配置失败：${error instanceof Error ? error.message : String(error)}` }],
    };
  }
}
