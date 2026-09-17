import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBuiltinLogFormat } from '../src/config/defaultLogFormat';
import { ContractVersion, FieldFilterKind, FieldRole, FieldType, LogFormatConfig, ParserKind } from '../src/config/logFormatTypes';
import { FrameKind, RecordMode, StackRelation, StackStatus } from '../src/config/stackTypes';
import { parseLogContent } from '../src/utils/logParser';
import { parseConfiguredLogContent } from '../src/utils/configurableLogParser';
import { parseStack } from '../src/utils/stackParser';
import { validateLogViewerConfig } from '../src/utils/logConfigLoader';
import { csvLogs, jsonLogs } from '../src/utils/logExport';
import { createConfiguredFilters, matchConfiguredFilters } from '../src/utils/configuredFilterUtils';
import { buildCopyText, copyActions } from '../src/utils/logCopyUtils';
import { generateSampleLogsText } from '../src/utils/sampleData';
import { searchText } from '../src/utils/recordEntries';

function python(): string {
  return 'Traceback (most recent call last):\n  File "C:\\app\\main.py", line 12, in run\n    fail()\n    ^^^^^^\nValueError: bad input';
}

function java(): string {
  return 'java.lang.RuntimeException: failed\n\tat com.app.Main.run(Main.java:42)\n\tat java.base/java.lang.Thread.run(Native Method)\n\tSuppressed: java.io.IOException: close\n\t\tat com.app.Resource.close(Unknown Source)\n\t\t... 1 more\nCaused by: java.lang.IllegalArgumentException: bad\n\tat com.app.Parser.read(Parser.java:9)\n\t... 1 more';
}

function header(): string {
  return '[2026-09-13 12:00:00,123][ERROR][req1][request failed][run][thread1][0x01][app][logger.py][8]';
}

function verifyPython(): void {
  const stack = parseStack(python())!;
  assert.equal(stack.status, StackStatus.Complete);
  assert.equal(stack.exceptions[0].type, 'ValueError');
  assert.equal(stack.exceptions[0].frames[0].file, 'C:\\app\\main.py');
  assert.equal(stack.exceptions[0].frames[0].line, 12);
  assert.equal(stack.exceptions[0].frames[0].source?.length, 2);
  for (const [marker, relation] of [
    ['The above exception was the direct cause of the following exception:', StackRelation.Cause],
    ['During handling of the above exception, another exception occurred:', StackRelation.Context],
  ] as const) {
    const text = `${python()}\n\n${marker}\n\n${python().replace('ValueError', 'RuntimeError')}`;
    const result = parseLogContent(text, 'chain.log', text.length, { mode: RecordMode.Stack });
    assert.equal(result.logs.length, 1, marker);
    assert.equal(result.logs[0].rawText, text);
    const chain = result.logs[0].stack!;
    assert.equal(chain.exceptions.length, 2);
    assert.equal(chain.exceptions[0].parent, 1);
    assert.equal(chain.exceptions[0].relation, relation);
    assert.equal(chain.status, StackStatus.Complete);
  }
  const cut = parseStack('Traceback (most recent call last):\n  File "a.py", line 3, in f')!;
  const noted = `${python()}\nadditional exception note\n\nThe above exception was the direct cause of the following exception:\n\n${python()}`;
  const noteResult = parseLogContent(noted, 'notes.log', 0, { mode: RecordMode.Stack });
  assert.equal(noteResult.logs.length, 1);
  assert.equal(noteResult.logs[0].rawText, noted);
  assert.equal(noteResult.logs[0].stack?.exceptions[0].parent, 1);
  assert.equal(noteResult.logs[0].stack?.status, StackStatus.Partial);
  for (const note of ['first note\n\nsecond note', '\nfirst note\n\nsecond note', '\n\nfirst note']) {
    const text = `${python()}\n${note}\n\nThe above exception was the direct cause of the following exception:\n\n${python()}`;
    const parsed = parseLogContent(text, 'multiline-note.log', 0, { mode: RecordMode.Stack });
    assert.equal(parsed.logs.length, 1);
    assert.equal(parsed.logs[0].rawText, text);
    assert.equal(parsed.logs[0].stack?.exceptions[0].parent, 1);
    assert.equal(parsed.logs[0].stack?.status, StackStatus.Partial);
  }
  assert.equal(cut.status, StackStatus.Partial);
  const group = '  + Exception Group Traceback (most recent call last):\n  | ExceptionGroup: errors (1 sub-exception)\n  +-+---------------- 1 ----------------\n    | ValueError: bad\n    +------------------------------------';
  const grouped = parseLogContent(group, 'group.log', group.length, { mode: RecordMode.Stack });
  assert.equal(grouped.logs.length, 1);
  assert.equal(grouped.logs[0].stack?.status, StackStatus.Partial);
  assert.equal(grouped.logs[0].rawText, group);
}

function verifyJava(): void {
  const stack = parseStack(java())!;
  assert.equal(stack.status, StackStatus.Complete);
  assert.equal(stack.exceptions.length, 3);
  assert.equal(stack.exceptions[1].parent, 0);
  assert.equal(stack.exceptions[1].relation, StackRelation.Suppressed);
  assert.equal(stack.exceptions[2].parent, 0);
  assert.equal(stack.exceptions[2].relation, StackRelation.Cause);
  assert.equal(stack.exceptions[0].frames[1].kind, FrameKind.Native);
  assert.equal(stack.exceptions[1].frames[0].kind, FrameKind.Unknown);
  assert.equal(stack.exceptions[2].omitted, 1);
  assert.equal(parseStack('\tat demo.Run.go(Run.java:3)')?.status, StackStatus.Partial);
  assert.equal(parseStack('Exception in thread "main" java.lang.RuntimeException: cut')?.status, StackStatus.Partial);
  const mixedNewlines = python().replace('\n', '\r\n');
  assert.equal(parseStack('log message\n' + mixedNewlines)?.raw, mixedNewlines);
  const nested = 'java.lang.RuntimeException: root\n\tat A.a(A.java:1)\n\tSuppressed: java.lang.Exception: s1\n\t\tat B.b(B.java:2)\n\tCaused by: java.lang.Exception: sc\n\t\tat C.c(C.java:3)\n\tSuppressed: java.lang.Exception: s2\n\t\tat D.d(D.java:4)\nCaused by: java.lang.Exception: main\n\tat E.e(E.java:5)';
  assert.deepEqual(parseStack(nested)!.exceptions.map((item) => item.parent), [undefined, 0, 1, 0, 0]);
}

function verifyRecords(): void {
  const format = createBuiltinLogFormat();
  format.record.mode = RecordMode.Stack;
  for (const ending of ['\n', '\r\n']) {
    for (const trace of [python(), java()]) {
      const text = [header(), trace, header()].join('\n').replace(/\n/g, ending);
      for (const result of [parseLogContent(text, 'a.log', text.length, format.record), parseConfiguredLogContent(text, 'a.log', text.length, format)]) {
        assert.equal(result.logs.length, 2);
        assert.equal(result.stats.physicalLineCount, text.split(ending).length);
        assert.equal(result.stats.levelCounts.ERROR, 2);
        assert.equal(result.logs[0].rawText, [header(), trace].join('\n').replace(/\n/g, ending));
        assert.equal(result.logs[0].fields?.requestId, 'req1');
        assert.equal(result.logs[0].fields?.fileName, 'logger.py');
        assert.equal(result.logs[1].lineNumber, trace.split('\n').length + 2);
        assert.equal(result.logs[1].id, result.logs[1].lineNumber - 1);
        assert.equal(result.logs[0].endLineNumber, result.logs[1].lineNumber - 1);
        assert.ok(result.logs[0].fields?.operationDesc.includes('Main') || result.logs[0].fields?.operationDesc.includes('ValueError'));
      }
    }
  }
  const ordinary = `${header()}\n  ordinary indented text\nat the beginning\n${header()}`;
  assert.equal(parseLogContent(ordinary, 'plain.log', 0, format.record).logs.length, 4);
  const consecutive = `${python()}\n${python()}\n${java()}\n${java()}`;
  const result = parseLogContent(consecutive, 'standalone.log', 0, format.record);
  assert.equal(result.logs.length, 4);
  assert.equal(result.logs[0].fields?.timestamp, '-');
  assert.equal(result.logs[0].fields?.level, 'OTHER');
  assert.equal(result.stats.levelCounts.OTHER, 4);
  const disabled = parseLogContent(python(), 'disabled.log', 0);
  assert.equal(disabled.logs.length, 5);
  assert.ok(disabled.logs.every((item) => !item.stack));
  const inline = header().replace('request failed', 'java.lang.RuntimeException: fail') + '\n\tat A.a(A.java:1)';
  assert.equal(parseLogContent(inline, 'inline.log', 0, format.record).logs.length, 1);
  const wrapped = header().replace('request failed', python());
  for (const parsed of [parseLogContent(wrapped, 'wrapped.log', 0, format.record), parseConfiguredLogContent(wrapped, 'wrapped.log', 0, format)]) {
    assert.equal(parsed.logs.length, 1);
    assert.equal(parsed.logs[0].fields?.operationDesc, python());
    assert.equal(parsed.logs[0].fields?.fileName, 'logger.py');
    assert.equal(parsed.logs[0].stack?.exceptions[0].message, 'bad input');
    assert.equal(parsed.logs[0].stack?.raw, python());
  }
}

function jsonFormat(): LogFormatConfig {
  const config = JSON.parse(readFileSync('public/logviewer.config.json', 'utf8'));
  const format = config.formats[0] as LogFormatConfig;
  format.record.mode = RecordMode.Stack;
  return format;
}

function verifyIntegration(): void {
  const format = jsonFormat();
  const text = JSON.stringify({ time: '2026-09-13T12:00:00Z', level: 'error', message: python() });
  const result = parseConfiguredLogContent(text, 'a.jsonl', text.length, format);
  const log = result.logs[0];
  assert.ok(log.stack);
  assert.equal(log.endLineNumber, 1);
  assert.equal(log.stack!.raw, python());
  const hybrid = { ...format, parsers: [...format.parsers, { id: 'text-fallback', kind: ParserKind.Regex, pattern: '(?<message>.*)' } as const] };
  const hybridLog = parseConfiguredLogContent(text, 'hybrid.log', 0, hybrid).logs[0];
  assert.deepEqual(hybridLog.fields, log.fields);
  assert.deepEqual(hybridLog.stack, log.stack);
  assert.equal(parseConfiguredLogContent(text + '\n' + python(), 'hybrid.log', 0, hybrid).logs.length, 2);
  assert.ok(searchText(log).includes('fail()\n    ^'));
  const msg = format.fields.find((item) => item.role === FieldRole.Message)!;
  const filters = createConfiguredFilters(format);
  filters[msg.id].value = 'ValueError';
  assert.equal(matchConfiguredFilters(log, format, filters), true);
  const action = copyActions(format).find((item) => item.sourceField === msg.id)!;
  assert.equal(buildCopyText(action, [log]).text, python());
  const exported = JSON.parse(jsonLogs([log]));
  assert.deepEqual(exported[0].stack, log.stack);
  assert.equal(exported[0].rawText, text);
  assert.ok(csvLogs([log], format).includes('"' + python().replace(/"/g, '""') + '"'));
  const literal = JSON.stringify({ time: '2026-09-13T12:00:00Z', level: 'info', message: 'text\\nvalue' });
  assert.equal(parseConfiguredLogContent(literal, 'literal.jsonl', 0, format).logs[0].stack, undefined);
  const custom: LogFormatConfig = {
    id: 'custom-stack', name: 'custom', record: { mode: RecordMode.Stack, stackField: 'error', startPattern: '^LOG ' },
    fields: [
      { id: 'message', label: 'Message', role: FieldRole.Message, type: FieldType.String, filter: { kind: FieldFilterKind.Text } },
      { id: 'error', label: 'Error', type: FieldType.String, filter: { kind: FieldFilterKind.Text } },
    ],
    parsers: [{ id: 'custom', kind: ParserKind.Regex, pattern: '^LOG (?<message>[^|]+)\\|(?<error>.*)$' }],
  };
  const customText = 'LOG request failed|java.lang.RuntimeException: bad\n\tat A.a(A.java:1)';
  const customLog = parseConfiguredLogContent(customText, 'custom.log', 0, custom).logs[0];
  assert.equal(customLog.stack?.exceptions[0].type, 'java.lang.RuntimeException');
  assert.equal(customLog.stack?.exceptions[0].frames.length, 1);
  assert.equal(customLog.stack?.status, StackStatus.Complete);
}

function verifyConfig(): void {
  const format = jsonFormat();
  const config = { contractVersion: ContractVersion.V1_2, formats: [format] };
  assert.deepEqual(validateLogViewerConfig(config).errors, []);
  assert.ok(validateLogViewerConfig({ ...config, contractVersion: ContractVersion.V1_1 }).errors.length);
  for (const pattern of ['(', 'abc', '^']) {
    assert.ok(validateLogViewerConfig({ ...config, formats: [{ ...format, record: { ...format.record, startPattern: pattern } }] }).errors.length);
  }
  assert.ok(validateLogViewerConfig({ ...config, formats: [{ ...format, record: { ...format.record, stackField: 'missing' } }] }).errors.length);
}

function benchmark(): void {
  const text = generateSampleLogsText(10000).split('\n').filter((line) => line.startsWith('[')).join('\n');
  const plain = parseLogContent(text, 'bench.log', text.length);
  const stack = parseLogContent(text, 'bench.log', text.length, { mode: RecordMode.Stack });
  assert.equal(plain.logs.length, stack.logs.length);
  assert.deepEqual(plain.logs.map((item) => item.rawText), stack.logs.map((item) => item.rawText));
  console.log(`${plain.logs.length} ordinary logs: line=${plain.stats.parseDurationMs}ms stack=${stack.stats.parseDurationMs}ms`);
  const mixed = Array.from({ length: 2000 }, () => `${header()}\n${python()}\n${header()}\n${java()}`).join('\n');
  const used = process.memoryUsage().heapUsed;
  const result = parseLogContent(mixed, 'mixed.log', mixed.length, { mode: RecordMode.Stack });
  assert.equal(result.logs.length, 4000);
  assert.equal(result.stats.physicalLineCount, 32000);
  assert.equal(result.logs.map((item) => item.rawText).join('\n'), mixed);
  console.log(`mixed ${result.stats.physicalLineCount} lines / ${result.logs.length} records: ${result.stats.parseDurationMs}ms, heap delta=${Math.round((process.memoryUsage().heapUsed - used) / 1024 / 1024)}MiB (GC-sensitive)`);
}

function main(): void {
  verifyPython();
  verifyJava();
  verifyRecords();
  verifyIntegration();
  verifyConfig();
  benchmark();
  console.log('stack-verification: ok');
}

main();
