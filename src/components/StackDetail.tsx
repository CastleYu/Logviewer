import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogEntry, FilterOptions, ThemeMode } from '../types';
import { StackRelation, StackStatus, StackText } from '../config/stackTypes';
import { frameCount, stackSummary } from '../utils/stackParser';
import { HighlightedText } from './HighlightedText';

export function StackDetail({ log, theme, filter, onClose }: { log: LogEntry; theme: ThemeMode; filter: FilterOptions; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [feedback, setFeedback] = useState('');
  const stack = log.stack!;
  const light = theme === 'light';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    setFeedback('');
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, [log.id]);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setFeedback('已复制'); }
    catch { setFeedback('复制失败，请选择原文后手动复制'); }
  };
  const button = `min-h-8 rounded border px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-600 hover:bg-slate-800'}`;
  return createPortal(<dialog ref={dialog} aria-labelledby="stack-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className={`m-auto max-h-[85vh] w-[min(56rem,94vw)] overflow-auto rounded-lg border p-0 backdrop:bg-black/40 ${light ? 'border-slate-300 bg-white text-slate-900' : 'border-slate-700 bg-slate-900 text-slate-100'}`}>
    <div className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b p-4 ${light ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
      <div><h2 id="stack-title" className="font-semibold">{StackText.title}</h2><p className="mt-1 text-xs text-slate-500">{log.lineNumber}–{log.endLineNumber ?? log.lineNumber} 行 · {stack.language} · {frameCount(stack)} 帧 · {stack.status === StackStatus.Complete ? '完整识别' : '部分识别，保留完整原文'}</p></div>
      <button autoFocus type="button" className={button} onClick={onClose}>关闭</button>
    </div>
    <div className="space-y-5 p-4">
      <p className="break-words font-mono text-sm">{stackSummary(stack)}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => copy(log.rawText)}>复制完整日志</button><button type="button" className={button} onClick={() => copy(stack.raw)}>仅复制堆栈</button><span role="status" className="self-center text-xs">{feedback}</span></div>
      <ol className="space-y-4">{stack.exceptions.map((item, index) => <li key={index} className="min-w-0">
        <p className="break-words font-mono text-xs"><span className="text-slate-500">#{index + 1} · {item.relation === StackRelation.Root ? '主异常' : item.relation === StackRelation.Cause ? '原因' : item.relation === StackRelation.Context ? '上下文' : '抑制异常'}{item.parent !== undefined ? ` → #${item.parent + 1}` : ''} · </span>{item.type || '未识别异常类型'}{item.message ? `: ${item.message}` : ''}</p>
        <ol className="mt-2 space-y-1">{item.frames.map((frame, number) => <li key={number} className="flex items-start gap-2 font-mono text-xs"><span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{frame.raw}{frame.source ? `\n${frame.source.join('\n')}` : ''}</span><button type="button" className={button} aria-label={`复制帧位置 ${frame.name}`} onClick={() => copy(frame.file ? `${frame.file}${frame.line !== undefined ? `:${frame.line}` : ''}` : frame.name)}>复制位置</button></li>)}</ol>
        {item.omitted !== undefined ? <p className="mt-1 text-xs text-slate-500">省略 {item.omitted} 个公共帧</p> : null}
      </li>)}</ol>
      <section><h3 className="mb-2 text-sm font-medium">堆栈原文</h3><pre className={`overflow-x-auto rounded border p-3 text-xs leading-5 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950'}`}><HighlightedText text={stack.raw} searchHighlight={filter.searchKeyword} searchMatchCase={filter.matchCase} searchIsRegex={filter.isRegex} highlight={filter.highlightKeyword} matchCase={filter.highlightMatchCase} isRegex={filter.highlightIsRegex} pinnedHighlights={filter.pinnedHighlights} theme={theme} /></pre></section>
      <details><summary className="cursor-pointer text-sm">完整日志原文</summary><pre className="mt-2 overflow-x-auto text-xs leading-5">{log.rawText}</pre></details>
    </div>
  </dialog>, document.body);
}
