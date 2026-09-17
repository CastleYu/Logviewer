import React from 'react';
import { LogEntry } from '../types';
import { frameCount, stackSummary } from '../utils/stackParser';

export function StackCell({ log, onOpen }: { log: LogEntry; onOpen: (log: LogEntry) => void }) {
  const range = log.endLineNumber && log.endLineNumber !== log.lineNumber ? `${log.lineNumber}–${log.endLineNumber}` : String(log.lineNumber);
  if (!log.stack) return <>{range}</>;
  const label = `${range} 行 · ${stackSummary(log.stack)} · ${frameCount(log.stack)} 帧，查看堆栈`;
  return <button type="button" title={label} aria-label={label} onClick={(event) => { event.stopPropagation(); onOpen(log); }} className="min-h-6 w-full truncate rounded px-0.5 text-indigo-500 underline decoration-dotted underline-offset-4 hover:text-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">{range}</button>;
}
