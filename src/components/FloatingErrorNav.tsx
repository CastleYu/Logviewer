import React, { useEffect, useMemo } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { LogEntry, ThemeMode } from '../types';

interface FloatingErrorNavProps {
  filteredLogs: LogEntry[];
  selectedIds: Set<number>;
  onSelectLog: (logId: number) => void;
  onNavigateToLog?: (logId: number) => void;
  theme?: ThemeMode;
}

export const FloatingErrorNav: React.FC<FloatingErrorNavProps> = ({ filteredLogs, selectedIds, onSelectLog, onNavigateToLog }) => {
  const errorLogs = useMemo(() => filteredLogs.filter((log) => !log.success || ['ERROR', 'FATAL', 'ERR'].includes(String(log.fields?.level || '').toUpperCase())), [filteredLogs]);
  const positions = useMemo(() => new Map(filteredLogs.map((log, index) => [log.id, index])), [filteredLogs]);
  const selectedId = selectedIds.size ? Array.from(selectedIds).at(-1)! : null;
  const currentIndex = selectedId === null ? -1 : errorLogs.findIndex((log) => log.id === selectedId);
  const navigate = (direction: 1 | -1) => {
    if (!errorLogs.length) return;
    const currentPosition = selectedId === null ? -1 : positions.get(selectedId) ?? -1;
    let index = direction === 1 ? 0 : errorLogs.length - 1;
    if (currentPosition >= 0) {
      const candidates = errorLogs.map((log, errorIndex) => ({ errorIndex, position: positions.get(log.id)! }));
      const next = direction === 1 ? candidates.find((item) => item.position > currentPosition) : candidates.reverse().find((item) => item.position < currentPosition);
      if (next) index = next.errorIndex;
    }
    const id = errorLogs[index].id;
    onSelectLog(id);
    onNavigateToLog?.(id);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      navigate(event.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [errorLogs, selectedId, positions]);

  return (
    <nav aria-label="错误日志导航" className="ml-auto flex h-8 shrink-0 items-center gap-1 whitespace-nowrap border-l border-line pl-2 text-xs">
      <AlertCircle className={`mr-0.5 h-4 w-4 ${errorLogs.length ? 'text-danger' : 'text-ink-3'}`} />
      <span className={errorLogs.length ? 'font-semibold text-danger' : 'text-ink-3'} title="ERROR / FATAL / 解析失败">{currentIndex >= 0 ? `${currentIndex + 1}/` : ''}{errorLogs.length.toLocaleString()} 错误</span>
      <button type="button" className="lv-icon-btn h-7 w-7" disabled={!errorLogs.length} onClick={() => navigate(-1)} aria-label="上一个错误" title="上一个错误 · Shift+F2"><ChevronUp className="h-4 w-4" /></button>
      <button type="button" className="lv-icon-btn h-7 w-7" disabled={!errorLogs.length} onClick={() => navigate(1)} aria-label="下一个错误" title="下一个错误 · F2"><ChevronDown className="h-4 w-4" /></button>
      <kbd className="lv-kbd hidden xl:inline-flex">F2</kbd>
    </nav>
  );
};
