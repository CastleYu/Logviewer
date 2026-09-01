import React, { useEffect, useRef } from 'react';
import { Check, Copy, ListChecks, Rows3 } from 'lucide-react';
import { RuntimeCopyAction } from '../config/logFormatTypes';
import { LogEntry, ThemeMode } from '../types';
import { buildCopyText } from '../utils/logCopyUtils';

export interface CopyFeedback {
  ok: boolean;
  message: string;
}

interface CopyActionPopoverProps {
  actions: RuntimeCopyAction[];
  selectedLogs: LogEntry[];
  filteredLogs: LogEntry[];
  anchor: DOMRect;
  theme: ThemeMode;
  onResult: (feedback: CopyFeedback) => void;
  onClose: () => void;
}

interface HeaderCopyButtonProps {
  label: string;
  isLight: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export async function copyActionToClipboard(action: RuntimeCopyAction, logs: LogEntry[]): Promise<CopyFeedback> {
  const result = buildCopyText(action, logs);
  if (!result.ok) return { ok: false, message: result.error || `${action.label}没有可复制的数据` };
  try {
    await navigator.clipboard.writeText(result.text);
    return { ok: true, message: result.rowCount === 1 ? `已完成：${action.label}` : `已复制 ${result.rowCount} 行：${action.label}` };
  } catch {
    return { ok: false, message: '剪贴板写入失败，请检查浏览器权限后重试' };
  }
}

export function HeaderCopyButton({ label, isLight, onClick }: HeaderCopyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`复制${label}列`}
      title={`复制${label}列`}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        isLight ? 'text-slate-400 hover:bg-slate-200 hover:text-indigo-700' : 'text-slate-500 hover:bg-slate-800 hover:text-indigo-300'
      }`}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export function CopyActionPopover({ actions, selectedLogs, filteredLogs, anchor, theme, onResult, onClose }: CopyActionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';
  const width = 288;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const estimatedHeight = Math.min(360, 58 + actions.length * (selectedLogs.length > 0 ? 92 : 58));
  const below = anchor.bottom + 6;
  const top = below + estimatedHeight <= window.innerHeight ? below : Math.max(8, anchor.top - estimatedHeight - 6);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = async (action: RuntimeCopyAction, logs: LogEntry[]) => {
    const feedback = await copyActionToClipboard(action, logs);
    onResult(feedback);
    if (feedback.ok) onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="列复制选项"
      style={{ left, top, width }}
      className={`fixed z-[80] max-h-[360px] overflow-auto rounded-lg border py-1.5 shadow-xl ${
        isLight ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'
      }`}
    >
      <div className={`px-3 pb-1.5 text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>选择复制动作与数据范围</div>
      {actions.map((action) => (
        <div key={action.id} className={`border-t px-2 py-1.5 first:border-t-0 ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
          <div className="truncate px-1 pb-1 text-[11px] font-semibold" title={action.label}>{action.label}</div>
          <div className="grid gap-1">
            {selectedLogs.length > 0 ? (
              <button type="button" role="menuitem" onClick={() => run(action, selectedLogs)} className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isLight ? 'hover:bg-indigo-50' : 'hover:bg-slate-800'}`}>
                <span className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5 text-indigo-500" />复制已选行</span>
                <span className="font-mono text-[10px] opacity-70">{selectedLogs.length}</span>
              </button>
            ) : null}
            <button type="button" role="menuitem" disabled={filteredLogs.length === 0} onClick={() => run(action, filteredLogs)} className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${filteredLogs.length === 0 ? 'cursor-not-allowed opacity-40' : `cursor-pointer ${isLight ? 'hover:bg-indigo-50' : 'hover:bg-slate-800'}`}`}>
              <span className="flex items-center gap-2"><Rows3 className="h-3.5 w-3.5 text-cyan-500" />复制筛选结果</span>
              <span className="font-mono text-[10px] opacity-70">{filteredLogs.length}</span>
            </button>
          </div>
        </div>
      ))}
      <div className="sr-only" aria-live="polite"><Check className="h-3 w-3" /></div>
    </div>
  );
}
