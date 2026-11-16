import { LogEntry } from '../types';

interface StackCellProps {
  log: LogEntry;
}

export function StackCell({ log }: StackCellProps) {
  if (!log.stack) return null;
  const end = log.endLineNumber ?? log.lineNumber;
  return (
    <span className="ml-1.5 inline-flex items-center rounded bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
      L{log.lineNumber}–{end}
    </span>
  );
}
