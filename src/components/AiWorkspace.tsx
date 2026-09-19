import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, History, FolderOpen, Plus, Settings2, Send, Square, LoaderCircle } from 'lucide-react';
import { AiMode, AiSessionState, type AiConfig, type AiMessage, type AiSession } from '../config/aiTypes';
import type { HistoryLog } from '../config/historyTypes';
import type { LogEntry, ThemeMode } from '../types';
import { AiApi } from '../services/aiApi';
import { FloatingPanel } from './FloatingPanel';
import { HistoryBrowser } from './HistoryBrowser';
import { AiQuestionForm } from './AiQuestionForm';
import { AiSettings } from './AiSettings';

export interface AiWorkspaceRequest { nonce: number; text: string; title: string }
export interface AiWorkspaceProps { theme: ThemeMode; log: HistoryLog | null; logs: LogEntry[]; content: string; request: AiWorkspaceRequest | null; onOpenHistory: (log: HistoryLog) => void; onLocalPath: () => void }

function messageText(message: AiMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts as Record<string, any>[] : [];
  return parts.map((part) => {
    if (part.type === 'text' || part.type === 'reasoning') return String(part.text || '');
    if (part.type === 'tool') return `[${part.tool || '工具'} · ${part.state?.status || ''}]\n${part.state?.output || part.state?.error || part.state?.title || ''}`;
    return '';
  }).filter(Boolean).join('\n\n');
}

export function AiWorkspace({ theme, log, logs, content, request, onOpenHistory, onLocalPath }: AiWorkspaceProps) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<AiConfig>({ endpoint: 'http://127.0.0.1:4096', executable: 'opencode', launch: false, mode: AiMode.Isolated });
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [catalog, setCatalog] = useState<{ providers: unknown; agents: unknown } | null>(null);
  const sending = useRef(false);
  const seenRequest = useRef(0);
  const logRef = useRef(log?.id);
  logRef.current = log?.id;
  const light = theme === 'light';
  const cases = useMemo(() => sessions.filter((item) => item.logId === log?.id), [sessions, log?.id]);
  const current = selected === null ? cases[0] : cases.find((item) => item.id === selected);
  const busy = submitting || current?.state === AiSessionState.Busy;
  const errors = useMemo(() => logs.filter((item) => ['ERROR', 'FATAL'].includes(String(item.fields?.level || '').toUpperCase())), [logs]);
  const button = `rounded-md px-2 py-1.5 text-xs disabled:opacity-40 ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`;

  useEffect(() => {
    let active = true;
    AiApi.state().then((state) => { if (active) { setConfig(state.config); setSessions(state.sessions); } }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setSelected(null); setDraft(''); setError(''); }, [log?.id]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const state = await AiApi.state(); if (active) setSessions(state.sessions); }
      catch (cause) { if (active) setError(`连接中断，已保留会话：${(cause as Error).message}`); }
      if (active) timer = setTimeout(poll, 800);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [open]);
  useEffect(() => {
    setCatalog(null);
    if (!current) return;
    let active = true;
    AiApi.catalogs(current.id).then((value) => { if (active) setCatalog(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [current?.id]);

  const send = async (prompt: string) => {
    setOpen(true);
    if (!log || !prompt.trim()) return;
    if (sending.current || current?.state === AiSessionState.Busy) { setDraft(prompt); setError('当前会话正在分析，可停止或新建会话后发送。'); return; }
    const logId = log.id;
    sending.current = true; setSubmitting(true); setOpen(true); setError('');
    try {
      const session = current || await AiApi.create({ logId, mode: config.mode || AiMode.Isolated, repository: config.sourceRoot || log.repository, installRecipe: config.installRecipe, trackLog: config.trackLog });
      setSessions((old) => [session, ...old.filter((item) => item.id !== session.id)]);
      if (logRef.current === logId) setSelected(session.id);
      const response = await AiApi.prompt(session.id, { prompt, recipe: config.recipe, agent: config.agent || undefined, model: config.providerID && config.modelID ? { providerID: config.providerID, modelID: config.modelID } : undefined });
      setSessions((old) => old.map((item) => item.id === response.id ? response : item));
      if (logRef.current === logId) setDraft('');
    } catch (cause) { if (logRef.current === logId) setError((cause as Error).message); }
    finally { sending.current = false; setSubmitting(false); }
  };
  useEffect(() => {
    if (!request || !log || seenRequest.current === request.nonce) return;
    seenRequest.current = request.nonce;
    void send(`${request.title}\n\n${request.text}`);
  }, [request?.nonce, log?.id]);
  const act = async (action: () => Promise<unknown>) => {
    try { await action(); setSessions((await AiApi.state()).sessions); setError(''); } catch (cause) { setError((cause as Error).message); }
  };

  return <>
    <div className={`fixed bottom-24 right-4 z-[80] flex max-w-[calc(100vw-24px)] flex-wrap items-center rounded-lg border p-1 shadow-lg ${light ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'}`}>
      <button className={button} onClick={() => setOpen(true)} aria-label="打开 AI 工作区"><Bot className="h-4 w-4" /></button>
      <button className={button} disabled={!log || !errors.length || busy} onClick={() => void send(`请分析全部 ${errors.length} 条 ERROR/FATAL 日志，识别首个异常和级联错误：\n\n${errors.map((item) => `[日志行 ${item.lineNumber}]\n${item.rawText}`).join('\n\n')}`)}>分析 ERROR</button>
      <button className={button} disabled={!log || !content || busy} onClick={() => { if (window.confirm(`将发送全文：${content.length.toLocaleString()} 个字符，粗估 ${Math.ceil(content.length / 2).toLocaleString()} tokens。长日志可能超过模型上下文，是否继续？`)) void send(`请分析以下完整日志：\n\n${content}`); }}>分析全文</button>
      <button className={button} onClick={() => setHistoryOpen(true)} aria-label="历史日志"><History className="h-4 w-4" /></button>
      <button className={button} onClick={onLocalPath} aria-label="打开本地日志"><FolderOpen className="h-4 w-4" /></button>
      <button className={button} onClick={() => setSettingsOpen(true)} aria-label="AI 设置"><Settings2 className="h-4 w-4" /></button>
    </div>
    <FloatingPanel theme={theme} title={log ? `AI 工作区 · ${log.name}` : 'AI 工作区'} open={open} onClose={() => setOpen(false)} width={660} height={620}>
      <div className="flex h-full min-h-0 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="AI 会话" value={current?.id || ''} onChange={(event) => setSelected(event.target.value)} className={`min-w-0 flex-1 rounded border p-1.5 text-xs ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`}><option value="">新会话</option>{cases.map((item) => <option key={item.id} value={item.id}>{new Date(item.created).toLocaleString()} · {item.mode === AiMode.Source ? '源码' : '独立日志'} · {item.id.slice(-6)}</option>)}</select>
          <button className={button} aria-label="新会话" onClick={() => { setSelected(''); setError(''); }}><Plus className="h-4 w-4" /></button>
          <button className={button} aria-label="会话设置" onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" /></button>
        </div>
        <p className="truncate text-xs text-slate-500" title={current?.directory || log?.origin}>{current?.directory || log?.origin || '打开日志后开始分析'}{busy ? ' · 正在分析…' : ''}</p>
        <div className={`min-h-0 flex-1 space-y-3 overflow-auto rounded-lg p-2 select-text ${light ? 'bg-slate-50' : 'bg-slate-950'}`} aria-label="AI 消息">
          {!current?.messages.length ? <p className="p-5 text-center text-xs text-slate-500">{busy ? '等待内部 Agent 返回…' : '可分析 ERROR、全文，或在日志表格右键选择行。'}</p> : current.messages.map((message, index) => {
            const user = (message.info as { role?: string })?.role === 'user';
            const text = messageText(message);
            return <article key={String((message.info as { id?: string })?.id || index)} className={`rounded-lg p-3 text-xs ${user ? 'ml-5 bg-indigo-600 text-white' : light ? 'mr-5 bg-white text-slate-800' : 'mr-5 bg-slate-900 text-slate-100'}`}><p className="mb-2 font-semibold">{user ? '你' : 'Agent'}</p>{user && text.length > 1600 ? <details><summary className="cursor-pointer">日志上下文 · {text.length.toLocaleString()} 字符 · 展开查看</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans leading-relaxed">{text}</pre></details> : <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{text}</pre>}</article>;
          })}
        </div>
        <div className="max-h-56 overflow-auto">{current?.permissions.map((item) => <div key={String(item.id || item.requestID)} className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-950"><p>权限请求：{String(item.permission)} · {Array.isArray(item.patterns) ? item.patterns.join(', ') : ''}</p><div className="mt-2 flex gap-3"><button onClick={() => void act(() => AiApi.permission(current.id, String(item.id || item.requestID), { reply: 'once' }))}>允许一次</button><button onClick={() => void act(() => AiApi.permission(current.id, String(item.id || item.requestID), { reply: 'reject' }))}>拒绝</button></div></div>)}
          {current?.questions.map((item) => <AiQuestionForm key={String(item.id || item.requestID)} question={item} onSubmit={async (answers) => { await AiApi.question(current.id, String(item.id || item.requestID), { answers }); setSessions((await AiApi.state()).sessions); }} onReject={async () => { await AiApi.question(current.id, String(item.id || item.requestID), {}, true); setSessions((await AiApi.state()).sessions); }} />)}
        </div>
        {error || current?.error ? <div role="alert" className="text-xs text-rose-600">{error || current?.error}{current ? <button onClick={() => void act(() => AiApi.refresh(current.id))} className="ml-2 underline">重新同步会话</button> : null}</div> : null}
        <div className="flex items-end gap-2"><textarea aria-label="AI 问题" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!log || busy} placeholder="向内部 Agent 追问…" className={`min-h-16 min-w-0 flex-1 resize-y rounded-lg border p-2 text-xs ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`} />{busy && current ? <button aria-label="停止 AI" onClick={() => void act(() => AiApi.abort(current.id))} className="rounded-lg bg-rose-600 p-2 text-white"><Square className="h-4 w-4" /></button> : <button aria-label="发送 AI 问题" disabled={!log || !draft.trim() || busy} onClick={() => void send(draft)} className="rounded-lg bg-indigo-600 p-2 text-white disabled:opacity-40">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>}</div>
      </div>
    </FloatingPanel>
    <HistoryBrowser theme={theme} open={historyOpen} revision={log?.id} onClose={() => setHistoryOpen(false)} onOpenHistory={(item) => { setHistoryOpen(false); setOpen(true); onOpenHistory(item); }} />
    <AiSettings theme={theme} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={setConfig} initial={config} catalog={catalog} repository={log?.repository} />
  </>;
}
