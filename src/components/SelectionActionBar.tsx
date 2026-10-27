import React, { useState } from 'react';
import { Bot, CheckSquare2, Copy, Download, FileText, ListChecks, X } from 'lucide-react';
import { LogFormatConfig } from '../config/logFormatTypes';
import { LogEntry, ThemeMode } from '../types';
import { copyActions } from '../utils/logCopyUtils';
import { CopyActionPopover, type CopyFeedback } from './CopyActionPopover';

interface SelectionActionBarProps {
  selectedLogs: LogEntry[];
  filteredLogs: LogEntry[];
  format: LogFormatConfig;
  theme: ThemeMode;
  onCopyRaw: () => void;
  onExportCSV: (logs: LogEntry[]) => void;
  onExportJSON: (logs: LogEntry[]) => void;
  onAnalyze: (logs: LogEntry[]) => void;
  onInspect: (log: LogEntry) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function SelectionActionBar({ selectedLogs, filteredLogs, format, theme, onCopyRaw, onExportCSV, onExportJSON, onAnalyze, onInspect, onSelectAll, onClear }: SelectionActionBarProps) {
  const [copyAnchor, setCopyAnchor] = useState<DOMRect | null>(null);
  const [feedback, setFeedback] = useState('');
  const actions = copyActions(format);
  if (!selectedLogs.length) return null;
  const button = 'lv-btn h-7 shrink-0 px-2 text-[11px]';
  const copied = (result: CopyFeedback) => setFeedback(result.message);
  return (
    <section aria-label="选中日志操作" className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 border-t border-line bg-raised px-2 py-1.5 text-xs text-ink-2 sm:px-3">
      <span className="mr-1 flex items-center gap-1.5 font-semibold text-accent-ink"><ListChecks className="h-4 w-4" />已选 {selectedLogs.length.toLocaleString()} 条</span>
      <button type="button" className={button} onClick={() => { onCopyRaw(); setFeedback(`已请求复制 ${selectedLogs.length} 条原文`); }}><Copy className="h-3.5 w-3.5" />复制原文</button>
      {actions.length ? <button type="button" className={button} onClick={(event) => setCopyAnchor(event.currentTarget.getBoundingClientRect())}><CheckSquare2 className="h-3.5 w-3.5" />复制字段</button> : null}
      <button type="button" className={button} title={`导出选中的 ${selectedLogs.length} 条为 CSV`} onClick={() => onExportCSV(selectedLogs)}><Download className="h-3.5 w-3.5" />CSV</button>
      <button type="button" className={button} title={`导出选中的 ${selectedLogs.length} 条为 JSON`} onClick={() => onExportJSON(selectedLogs)}><Download className="h-3.5 w-3.5" />JSON</button>
      <button type="button" className={button} onClick={() => onAnalyze(selectedLogs)}><Bot className="h-3.5 w-3.5" />AI 分析</button>
      {selectedLogs.length === 1 ? <button type="button" className={`${button} !border-accent/40 !bg-accent-soft !text-accent-ink`} onClick={() => onInspect(selectedLogs[0])}><FileText className="h-3.5 w-3.5" />详情</button> : null}
      <button type="button" className="ml-auto text-[11px] text-ink-3 hover:text-ink" onClick={onSelectAll}>全选筛选结果 {filteredLogs.length.toLocaleString()} 条</button>
      <button type="button" className="lv-icon-btn h-7 w-7" onClick={onClear} aria-label="清除日志选择" title="清除选择"><X className="h-4 w-4" /></button>
      <span role="status" className={`w-full text-[10px] ${feedback.includes('失败') ? 'text-danger' : 'text-ink-3'}`} aria-live="polite">{feedback}</span>
      {copyAnchor ? <CopyActionPopover actions={actions} selectedLogs={selectedLogs} filteredLogs={filteredLogs} anchor={copyAnchor} theme={theme} onResult={copied} onClose={() => setCopyAnchor(null)} /> : null}
    </section>
  );
}
