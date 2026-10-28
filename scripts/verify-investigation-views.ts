import assert from 'node:assert/strict';
import { createBuiltinLogFormat } from '../src/config/defaultLogFormat';
import { createConfiguredFilters } from '../src/utils/configuredFilterUtils';
import { createColumnFilters } from '../src/utils/columnFilterUtils';
import { parseInvestigationViews, restoreInvestigationFilter, type InvestigationView } from '../src/utils/investigationViews';
import type { FilterOptions } from '../src/types';

const format = createBuiltinLogFormat();
const filter: FilterOptions = {
  level: 'ALL', selectedLevels: ['ERROR'], searchKeyword: 'REQ-42', searchColumn: 'ALL', searchColumns: ['ALL'],
  isRegex: false, matchCase: true, selectedModule: 'gateway', selectedThread: 'worker-1', rangeKeyword: '',
  startTime: '2026-10-28T10:00:00.000', endTime: '', isUtcOffset: false, utcOffsetHours: 8,
  highlightKeyword: 'timeout', highlightMatchCase: false, highlightIsRegex: false,
  pinnedHighlights: [{ id: 'pin-1', keyword: 'timeout', color: 'amber', matchCase: false, isRegex: false }],
  wordWrap: false, columnFilters: createColumnFilters(), configuredFilters: createConfiguredFilters(format),
};
const view: InvestigationView = {
  version: 1, id: 'view-1', name: '支付错误调查', createdAt: 1, sourceName: 'gateway.log', formatId: format.id, filter,
  display: {
    density: 'compact', columnVisibility: {
      index: true, timestamp: true, level: true, requestId: true, operationDesc: true,
      functionName: false, threadId: true, memoryAddress: false, module: true, fileName: true, lineNumber: true,
    },
    columnWidths: {
      index: 48, timestamp: 180, level: 72, requestId: 130, operationDesc: 420, functionName: 160,
      threadId: 90, memoryAddress: 128, module: 112, fileName: 144, lineNumber: 64,
    },
    configuredColumnWidths: { message: 320 }, borderIntensity: 'strong', legacyBoldSelection: false, legacyHighlightStyle: true,
  },
};

const serialized = JSON.stringify([view]);
assert.deepEqual(parseInvestigationViews(serialized), [view]);
assert.equal(serialized.includes('rawText'), false);
assert.equal(serialized.includes('"content"'), false);
assert.equal(serialized.includes('"logs"'), false);
assert.deepEqual(parseInvestigationViews('{broken'), []);
assert.deepEqual(parseInvestigationViews(JSON.stringify([{ version: 1 }])), []);

const defaults: FilterOptions = { ...filter, selectedLevels: [], searchKeyword: '', highlightKeyword: '', configuredFilters: createConfiguredFilters(format) };
const restored = restoreInvestigationFilter(view.filter, defaults);
assert.equal(restored.searchKeyword, 'REQ-42');
assert.deepEqual(restored.selectedLevels, ['ERROR']);
assert.equal(restored.wordWrap, false);
assert.deepEqual(restored.pinnedHighlights, view.filter.pinnedHighlights);
assert.notEqual(restored.configuredFilters, defaults.configuredFilters);
console.log('investigation-view-verification: ok');
