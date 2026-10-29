import React, { useEffect, useRef, useState } from 'react';
import { Bot, CheckSquare2, ChevronDown, Copy, Download, ListChecks, X } from 'lucide-react';
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
  onSelectAll: () => void;
  onClear: () => void;
}

export function SelectionActionBar({ selectedLogs, filteredLogs, format, theme, onCopyRaw, onExportCSV, onExportJSON, onAnalyze, onSelectAll, onClear }: SelectionActionBarProps) {
  const [copyAnchor, setCopyAnchor] = useState<DOMRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const actions = copyActions(format);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  if (!selectedLogs.length) return null;
  const button = 'lv-btn h-7 shrink-0 px-2 text-[11px]';
  const copied = (result: CopyFeedback) => setFeedback(result.message);
  return (
    <section aria-label="选中日志操作" className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 border-t border-line bg-raised px-2 py-1.5 text-xs text-ink-2 sm:px-3">
      <span className="mr-1 flex items-center gap-1.5 font-semibold text-accent-ink"><ListChecks className="h-4 w-4" />已选 {selectedLogs.length.toLocaleString()} 条</span>
      <div ref={menuRef} className="relative">
        <button type="button" className={button} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><Copy className="h-3.5 w-3.5" />复制 / 导出<ChevronDown className="h-3 w-3" /></button>
        {menuOpen ? <div role="menu" className="lv-menu absolute bottom-full left-0 z-[100] mb-1.5 w-48 p-1.5">
          <button type="button" role="menuitem" className="lv-menu-item" onClick={() => { onCopyRaw(); setFeedback(`已请求复制 ${selectedLogs.length} 条原文`); setMenuOpen(false); }}><Copy className="h-3.5 w-3.5" />复制原文</button>
          {actions.length ? <button type="button" role="menuitem" className="lv-menu-item" onClick={(event) => { setCopyAnchor(event.currentTarget.getBoundingClientRect()); setMenuOpen(false); }}><CheckSquare2 className="h-3.5 w-3.5" />复制字段</button> : null}
          <button type="button" role="menuitem" className="lv-menu-item" title={`导出选中的 ${selectedLogs.length} 条为 CSV`} onClick={() => { onExportCSV(selectedLogs); setMenuOpen(false); }}><Download className="h-3.5 w-3.5" />导出 CSV</button>
          <button type="button" role="menuitem" className="lv-menu-item" title={`导出选中的 ${selectedLogs.length} 条为 JSON`} onClick={() => { onExportJSON(selectedLogs); setMenuOpen(false); }}><Download className="h-3.5 w-3.5" />导出 JSON</button>
        </div> : null}
      </div>
      <button type="button" className={button} onClick={() => onAnalyze(selectedLogs)}><Bot className="h-3.5 w-3.5" />AI 分析</button>
      {feedback ? <span role="status" className={`max-w-56 truncate text-[10px] ${feedback.includes('失败') ? 'text-danger' : 'text-ink-3'}`} aria-live="polite" title={feedback}>{feedback}</span> : null}
      <button type="button" className="ml-auto text-[11px] text-ink-3 hover:text-ink" onClick={onSelectAll}>全选筛选结果 {filteredLogs.length.toLocaleString()} 条</button>
      <button type="button" className="lv-icon-btn h-7 w-7" onClick={onClear} aria-label="清除日志选择" title="清除选择"><X className="h-4 w-4" /></button>
      {copyAnchor ? <CopyActionPopover actions={actions} selectedLogs={selectedLogs} filteredLogs={filteredLogs} anchor={copyAnchor} theme={theme} onResult={copied} onClose={() => setCopyAnchor(null)} /> : null}
    </section>
  );
}
