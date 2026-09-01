import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBuiltinLogFormat } from '../src/config/defaultLogFormat';
import { ConfigErrorCode, ContractVersion, FieldFilterKind, FieldType } from '../src/config/logFormatTypes';
import { generateSampleLogsText } from '../src/utils/sampleData';
import { parseConfiguredLogContent } from '../src/utils/configurableLogParser';
import { createConfiguredFilters, matchConfiguredFilters } from '../src/utils/configuredFilterUtils';
import { validateLogViewerConfig } from '../src/utils/logConfigLoader';
import { buildCopyText, copyActions } from '../src/utils/logCopyUtils';
import { parseLogContent } from '../src/utils/logParser';

function loadConfig(): unknown {
  return JSON.parse(readFileSync(resolve('public/logviewer.config.json'), 'utf8')) as unknown;
}

function verifyConfig(): void {
  const result = validateLogViewerConfig(loadConfig());
  assert.ok(result.config, '配置应通过根级校验');
  assert.deepEqual(result.errors, [], `配置不应包含错误：${JSON.stringify(result.errors)}`);
  assert.equal(result.config!.formats[0].id, 'json-lines-generic-v1');
  assert.equal(result.config!.contractVersion, ContractVersion.V1_1);
}

function verifyCopyActions(): void {
  const result = validateLogViewerConfig(loadConfig());
  const format = result.config!.formats[0];
  const lines = [
    '{"time":"2026-08-30T09:00:00.123Z","level":"info","message":"request completed","context":{"requestId":"REQ-1"},"durationMs":80,"service":"gateway","source":{"line":10}}',
    '{"time":"2026-08-30T09:01:00.123Z","level":"warning","message":"slow request","context":{"requestId":"REQ-2"},"durationMs":180,"service":"billing","source":{"line":20}}',
  ];
  const parsed = parseConfiguredLogContent(lines.join('\n'), 'sample.jsonl', 100, format);
  const actions = copyActions(format);
  const message = actions.find((action) => action.id === 'field-message');
  const combined = actions.find((action) => action.id === 'level-message');
  assert.ok(message, '字段复制动作应被注册');
  assert.ok(combined, '组合复制动作应被注册');
  assert.equal(buildCopyText(message!, parsed.logs).text, 'request completed\nslow request');
  assert.equal(buildCopyText(combined!, parsed.logs).text, '[INFO] request completed\n[WARN] slow request');

  const builtin = createBuiltinLogFormat();
  const source = copyActions(builtin).find((action) => action.id === 'source-location');
  assert.ok(source, '内置格式应注册文件位置组合复制');
  const builtinParsed = parseConfiguredLogContent(generateSampleLogsText(1), 'sample.log', 100, builtin);
  assert.match(buildCopyText(source!, builtinParsed.logs).text, /.+:\d+/);
}

function verifyLegacyParity(): void {
  const format = createBuiltinLogFormat();
  const content = generateSampleLogsText(500);
  const legacy = parseLogContent(content, 'sample.log', content.length);
  const configured = parseConfiguredLogContent(content, 'sample.log', content.length, format);
  const keys = ['timestamp', 'level', 'requestId', 'operationDesc', 'functionName', 'threadId', 'memoryAddress', 'module', 'fileName', 'lineNumber'];
  for (let index = 0; index < legacy.logs.length; index++) {
    if (index > 0 && index % 25 === 0) continue;
    assert.equal(configured.logs[index].success, legacy.logs[index].success, `第 ${index + 1} 行成功状态不一致`);
    for (const key of keys) assert.equal(configured.logs[index].fields?.[key], legacy.logs[index].fields?.[key], `第 ${index + 1} 行字段 ${key} 不一致`);
  }
}

function verifyJsonAndFilters(): void {
  const result = validateLogViewerConfig(loadConfig());
  const format = result.config!.formats[0];
  const lines = [
    '{"time":"2026-08-30T09:00:00.123Z","level":"info","message":"request completed","context":{"requestId":"REQ-1"},"durationMs":80,"service":"gateway","source":{"line":10}}',
    '{"time":"2026-08-30T09:01:00.123Z","level":"warning","message":"slow request","context":{"requestId":"REQ-2"},"durationMs":180,"service":"billing","source":{"line":20}}',
    '{"time":"2026-08-30T09:02:00.123Z","level":"error","message":"request failed","context":{"requestId":"REQ-3"},"durationMs":250,"service":"gateway","source":{"line":30}}'
  ];
  const parsed = parseConfiguredLogContent(lines.join('\n'), 'sample.jsonl', 100, format);
  assert.equal(parsed.stats.successCount, 3);
  assert.equal(parsed.logs[1].fields?.level, 'WARN');
  assert.equal(parsed.logs[2].fields?.sourceLine, 30);

  const filters = createConfiguredFilters(format);
  filters.message = { ...filters.message, value: 'request', matchCase: false };
  filters.durationMs = { ...filters.durationMs, min: '100', max: '300' };
  filters.service = { ...filters.service, selected: ['gateway'] };
  assert.equal(matchConfiguredFilters(parsed.logs[0], format, filters), false);
  assert.equal(matchConfiguredFilters(parsed.logs[1], format, filters), false);
  assert.equal(matchConfiguredFilters(parsed.logs[2], format, filters), true);

  filters.message = { ...filters.message, value: '^request failed$', isRegex: true };
  assert.equal(matchConfiguredFilters(parsed.logs[2], format, filters), true);
  filters.timestamp = { ...filters.timestamp, start: '2026-08-30T09:01:30.000Z', end: '2026-08-30T09:02:30.000Z' };
  assert.equal(matchConfiguredFilters(parsed.logs[2], format, filters), true);
  assert.equal(filters.message.kind, FieldFilterKind.Text);
}

function verifyInvalidContract(): void {
  const value = loadConfig() as { formats: Array<{ fields: Array<Record<string, unknown>> }> };
  value.formats[0].fields[4] = { ...value.formats[0].fields[4], type: FieldType.String };
  const result = validateLogViewerConfig(value);
  assert.ok(result.errors.some((error) => error.code === ConfigErrorCode.FilterTypeMismatch));
  const malformed = validateLogViewerConfig({ contractVersion: '1.0', formats: [null] });
  assert.ok(malformed.errors.some((error) => error.code === ConfigErrorCode.InvalidRoot));
  const unknownCopyField = loadConfig() as { formats: Array<{ copyActions: Array<{ parts: Array<Record<string, unknown>> }> }> };
  unknownCopyField.formats[0].copyActions[0].parts[1] = { kind: 'field', field: 'missingField' };
  const copyResult = validateLogViewerConfig(unknownCopyField);
  assert.ok(copyResult.errors.some((error) => error.code === ConfigErrorCode.CopyFieldUnknown));
}

function main(): void {
  verifyConfig();
  verifyLegacyParity();
  verifyJsonAndFilters();
  verifyCopyActions();
  verifyInvalidContract();
  console.log('log-contract-verification: ok');
}

main();
