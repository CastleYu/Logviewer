import React, { useEffect, useMemo, useState } from 'react';
import { Braces, Check, Copy, ExternalLink, FileCode2, ListTree, X } from 'lucide-react';
import { LogFormatConfig } from '../config/logFormatTypes';
import { StackRelation, StackStatus, type StackFrame } from '../config/stackTypes';
import type { SourceColumns } from '../config/sourceTypes';
import { FilterOptions, LogEntry, ThemeMode } from '../types';
import { frameCount, stackSummary } from '../utils/stackParser';
import { sourceColumns } from '../utils/sourceUtils';
import { HighlightedText } from './HighlightedText';
import { SourceMenuItem } from './SourceNavigation';

interface LogInspectorProps {
  log: LogEntry;
  format: LogFormatConfig;
  filter: FilterOptions;
  theme: ThemeMode;
  sourceOverrides: Record<string, SourceColumns>;
  onClose: () => void;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function FrameSourceLink({ log, frame, format, columns, light }: { log: LogEntry; frame: StackFrame; format: LogFormatConfig; columns: SourceColumns; light: boolean }) {
  if (!frame.file || frame.line === undefined) return null;
  const frameLog = { ...log, fields: { ...log.fields, [columns.file]: frame.file, [columns.line]: String(frame.line) } };
  return <div className="mt-1 inline-flex rounded border border-line align-middle"><SourceMenuItem log={frameLog} format={format} field={columns.file} light={light} onClose={() => undefined} /></div>;
}

export function LogInspector({ log, format, filter, theme, sourceOverrides, onClose }: LogInspectorProps) {
  const [tab, setTab] = useState<'evidence' | 'fields' | 'raw'>('evidence');
  const [feedback, setFeedback] = useState('');
  const light = theme === 'light';
  const columns = useMemo(() => sourceColumns(format, sourceOverrides), [format, sourceOverrides]);
  const level = String(log.fields?.level || (log.success ? 'LOG' : 'PARSE ERROR')).toUpperCase();
  const sourceField = format.fields.find((field) => field.id === columns.file);
  const highlighted = (text: string) => <HighlightedText text={text} searchHighlight={filter.searchKeyword} searchMatchCase={filter.matchCase} searchIsRegex={filter.isRegex} highlight={filter.highlightKeyword} matchCase={filter.highlightMatchCase} isRegex={filter.highlightIsRegex} pinnedHighlights={filter.pinnedHighlights} theme={theme} />;

  useEffect(() => { setFeedback(''); }, [log.id, tab]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const copy = async (text: string, message: string) => {
    try { await navigator.clipboard.writeText(text); setFeedback(message); }
    catch { setFeedback('复制失败，请检查剪贴板权限'); }
  };

  return (
    <aside aria-label="日志证据检查器" className="fixed inset-x-0 bottom-0 z-[70] flex h-[58dvh] min-h-72 flex-col border-t border-line bg-surface text-ink shadow-[var(--shadow-window)] md:static md:z-auto md:h-auto md:min-h-0 md:w-80 md:shrink-0 md:border-l md:border-t-0 md:shadow-none xl:w-96">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileCode2 className="h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1"><h2 className="truncate text-xs font-semibold">证据检查器</h2><p className="font-mono text-[10px] text-ink-3">源行 {log.lineNumber}{log.endLineNumber && log.endLineNumber !== log.lineNumber ? `–${log.endLineNumber}` : ''}</p></div>
        <button type="button" className="lv-icon-btn h-7 w-7" onClick={onClose} aria-label="关闭证据检查器" title="关闭 · Esc"><X className="h-4 w-4" /></button>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${level.includes('ERROR') || level.includes('FATAL') || !log.success ? 'bg-danger-soft text-danger' : level === 'WARN' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-ink'}`}>{level}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-3">{log.fields?.timestamp || (log.success ? '无时间戳' : log.parseErrorReason || '无法解析')}</span>
        <button type="button" className="lv-icon-btn h-6 w-6" title="复制完整原文" aria-label="复制检查器中的完整原文" onClick={() => void copy(log.rawText, '已复制完整原文')}><Copy className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2" role="tablist" aria-label="证据内容">
        {([['evidence', '异常 / 摘要'], ['fields', '结构化字段'], ['raw', '完整原文']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`h-7 rounded px-2 text-[11px] ${tab === value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-3 hover:bg-raised hover:text-ink'}`}>{label}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
        {tab === 'evidence' ? <div className="space-y-4">
          {log.stack ? <>
            <section><div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold"><ListTree className="h-3.5 w-3.5 text-accent" />{log.stack.language} · {frameCount(log.stack)} 帧 · {log.stack.status === StackStatus.Complete ? '完整识别' : '部分识别'}</div><p className="break-words font-mono leading-relaxed">{highlighted(stackSummary(log.stack))}</p></section>
            <ol className="space-y-3">{log.stack.exceptions.map((item, index) => <li key={index} className="rounded-md border border-line bg-raised p-2.5">
              <p className="break-words font-mono text-[11px] leading-relaxed"><span className="text-ink-3">#{index + 1} · {item.relation === StackRelation.Root ? '主异常' : item.relation === StackRelation.Cause ? '原因' : item.relation === StackRelation.Context ? '上下文' : '抑制异常'}{item.parent !== undefined ? ` → #${item.parent + 1}` : ''}</span><br /><strong>{item.type || '未识别异常类型'}</strong>{item.message ? `: ${item.message}` : ''}</p>
              <ol className="mt-2 space-y-1.5">{item.frames.map((frame, frameIndex) => <li key={frameIndex} className="border-t border-line/70 pt-1.5"><pre className="whitespace-pre-wrap break-all font-mono text-[10.5px] leading-relaxed text-ink-2">{frame.raw}{frame.source ? `\n${frame.source.join('\n')}` : ''}</pre><div className="flex flex-wrap items-center gap-2"><button type="button" className="mt-1 flex items-center gap-1 text-[10px] text-accent-ink" onClick={() => void copy(frame.file ? `${frame.file}${frame.line !== undefined ? `:${frame.line}` : ''}` : frame.name, '已复制帧位置')}><Copy className="h-3 w-3" />复制位置</button><FrameSourceLink log={log} frame={frame} format={format} columns={columns} light={light} /></div></li>)}</ol>
              {item.omitted !== undefined ? <p className="mt-2 text-[10px] text-ink-3">省略 {item.omitted} 个公共帧</p> : null}
            </li>)}</ol>
            <button type="button" className="lv-btn w-full" onClick={() => void copy(log.stack!.raw, '已复制堆栈原文')}><Copy className="h-3.5 w-3.5" />仅复制堆栈</button>
          </> : <section><h3 className="mb-2 text-[11px] font-semibold text-ink-3">记录摘要</h3><p className="whitespace-pre-wrap break-words font-mono leading-relaxed">{highlighted(valueText(log.fields?.operationDesc || log.fields?.message || log.rawText))}</p>{!log.success && log.parseErrorReason ? <p className="mt-3 rounded-md bg-danger-soft p-2 text-danger">{log.parseErrorReason}</p> : null}</section>}
          {sourceField ? <section><h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-3"><ExternalLink className="h-3 w-3" />源码位置</h3><div className="rounded-md border border-line"><SourceMenuItem log={log} format={format} field={sourceField.id} light={light} onClose={() => undefined} /></div></section> : null}
        </div> : null}
        {tab === 'fields' ? <dl className="divide-y divide-line rounded-md border border-line">{format.fields.map((field) => <div key={field.id} className="grid grid-cols-[minmax(80px,0.38fr)_1fr] gap-2 px-2.5 py-2"><dt className="text-[11px] font-medium text-ink-3" title={field.id}>{field.label}</dt><dd className="min-w-0 whitespace-pre-wrap break-all font-mono text-[11px]">{highlighted(valueText(log.fields?.[field.id]))}</dd></div>)}</dl> : null}
        {tab === 'raw' ? <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5">{highlighted(log.rawText)}</pre> : null}
      </div>
      <footer className="flex min-h-8 shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-1 text-[10px] text-ink-3"><span className="flex items-center gap-1"><Braces className="h-3 w-3" />{log.parserId || format.name}</span><span role="status" className="flex items-center gap-1 text-ok">{feedback ? <><Check className="h-3 w-3" />{feedback}</> : null}</span></footer>
    </aside>
  );
}
