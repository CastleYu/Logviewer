import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Settings2, Send, Square, LoaderCircle, Terminal, ListOrdered, X, Play } from 'lucide-react';
import { AiMode, AiRepositoryOrigin, AiSessionState, type AiConfig, type AiRepositoryState, type AiSession } from '../config/aiTypes';
import type { SourceTarget } from '../config/sourceTypes';
import { AiUi } from '../config/aiUiTypes';
import type { HistoryLog } from '../config/historyTypes';
import type { LogEntry, ThemeMode } from '../types';
import { AiApi } from '../services/aiApi';
import { HistoryBrowser } from './HistoryBrowser';
import { AiQuestionForm } from './AiQuestionForm';
import { AiSettings } from './AiSettings';
import { AiActivity } from './AiActivity';
import { FloatingPanel } from './FloatingPanel';

const AiConversation = lazy(() => import('./AiConversation').then((module) => ({ default: module.AiConversation })));

export interface AiWorkspaceRequest { logId: string; nonce: number; text: string; title: string; scope: string }
export interface AiWorkspaceProps { theme: ThemeMode; log: HistoryLog | null; logs: LogEntry[]; content: string; request: AiWorkspaceRequest | null; sourceTargets: SourceTarget[]; sourceRevision: number; open: boolean; historyOpen: boolean; onOpenChange: (open: boolean) => void; onHistoryOpenChange: (open: boolean) => void; onRepository?: (repository: string) => void; onOpenHistory: (log: HistoryLog) => void; onLocalPath: () => void }
type SendRun = { cancelled: boolean; logId: string; prompt: string; view: number; sessionId?: string };

export function AiWorkspace({ theme, log, logs, content, request, sourceTargets, sourceRevision, open, historyOpen, onOpenChange, onHistoryOpenChange, onRepository, onOpenHistory }: AiWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextScope, setContextScope] = useState('当前日志 · 自由提问');
  const [config, setConfig] = useState<AiConfig>({ endpoint: 'http://127.0.0.1:4096', executable: 'opencode', launch: false, mode: AiMode.Source, recipe: true });
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [pending, setPending] = useState<{ logId: string; sessionId?: string; prompt: string } | null>(null);
  const [catalog, setCatalog] = useState<{ providers: unknown; agents: unknown } | null>(null);
  const [deferredRequests, setDeferredRequests] = useState<AiWorkspaceRequest[]>([]);
  const [repository, setRepository] = useState<AiRepositoryState | null>(null);
  const [repositoryBusy, setRepositoryBusy] = useState(false);
  const [repositoryChoosing, setRepositoryChoosing] = useState(false);
  const repositoryKey = `${log?.id || ''}:${sourceRevision}:${sourceTargets.map((target) => `${target.file}:${target.line}`).join('|')}`;
  const sending = useRef(false);
  const runRef = useRef<SendRun | null>(null);
  const mutation = useRef(0);
  const selection = useRef(0);
  const seenRequest = useRef(0);
  const logRef = useRef(log?.id);
  logRef.current = log?.id;
  const light = theme === 'light';
  const cases = useMemo(() => sessions.filter((item) => item.logId === log?.id), [sessions, log?.id]);
  const current = selected === null ? cases.find((item) => item.mode === (config.mode || AiMode.Source)) : cases.find((item) => item.id === selected);
  const visibleRun = runRef.current?.logId === log?.id && (runRef.current?.sessionId ? runRef.current.sessionId === current?.id : runRef.current?.view === selection.current);
  const posting = submitting && visibleRun;
  const busy = current?.state === AiSessionState.Busy || current?.state === AiSessionState.Accepted;
  const queue = current?.queue || [];
  const errors = useMemo(() => logs.filter((item) => ['ERROR', 'FATAL'].includes(String(item.fields?.level || '').toUpperCase())), [logs]);
  const button = 'rounded-md px-2 py-1.5 text-xs hover:bg-sunken hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent';

  useEffect(() => {
    let active = true;
    AiApi.state().then((state) => { if (active) { setConfig(state.config); setSessions(state.sessions); } }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { selection.current += 1; setSelected(null); setDraft(''); setError(''); setNotice(''); }, [log?.id]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = mutation.current;
      try { if (current && current.state !== AiSessionState.Error) await AiApi.refresh(current.id); const state = await AiApi.state(); if (active && version === mutation.current && !sending.current) { setSessions(state.sessions); setConnectionError(''); } }
      catch (cause) { if (active) setConnectionError(`连接中断，正在重连；会话保留：${(cause as Error).message}`); }
      if (active) timer = setTimeout(poll, AiUi.PollMs);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [open, current?.id, current?.state]);
  useEffect(() => {
    if (!open || !log || config.mode === AiMode.Isolated) { setRepository(null); setRepositoryBusy(false); return; }
    let active = true;
    setRepository(null);
    setRepositoryBusy(true);
    AiApi.repository({ logId: log.id, targets: sourceTargets, repository: log.repository }).then((value) => {
      if (!active || logRef.current !== log.id) return;
      setRepository(value);
      if (value.repository && !log.repository && value.origin !== AiRepositoryOrigin.Missing) onRepository?.(value.repository);
    }).catch((cause) => { if (active) setError((cause as Error).message); }).finally(() => { if (active) setRepositoryBusy(false); });
    return () => { active = false; };
  }, [open, log?.id, repositoryKey, config.mode]);
  useEffect(() => {
    setCatalog(null);
    if (!current) return;
    let active = true;
    AiApi.catalogs(current.id).then((value) => { if (active) setCatalog(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [current?.id]);

  const send = async (prompt: string, scope = '当前日志 · 自由提问') => {
    onOpenChange(true);
    if (!log || !prompt.trim()) return;
    if (sending.current) return;
    setContextScope(scope);
    const logId = log.id;
    const view = selection.current;
    const run: SendRun = { cancelled: false, logId, prompt, view, sessionId: current?.id };
    runRef.current = run;
    sending.current = true; mutation.current += 1; setSubmitting(true); setPending({ logId, sessionId: current?.id, prompt }); onOpenChange(true); setError(''); setNotice('');
    try {
      const sourceMode = (current?.mode || config.mode || AiMode.Source) === AiMode.Source;
      let boundRepository = current?.repository || log.repository;
      if (sourceMode && !current) {
        if (run.cancelled) return;
        const resolved = repository?.logId === logId ? repository : await AiApi.repository({ logId, targets: sourceTargets, repository: log.repository });
        if (run.cancelled || logRef.current !== logId || selection.current !== view) return;
        const candidate = resolved.repository || (resolved.candidates.length === 1 ? resolved.candidates[0].repository : undefined);
        if (!candidate) {
          setRepository(resolved);
          setError(resolved.candidates.length > 1 ? '检测到多个源码仓库，请先选择一个仓库后再发送。' : '未找到匹配源码仓库，请在设置中配置源码目录或手动选择。');
          if (logRef.current === logId && selection.current === view) setDraft(prompt);
          return;
        }
        boundRepository = candidate;
        setRepository({ ...resolved, repository: candidate, origin: resolved.candidates.length === 1 ? AiRepositoryOrigin.Index : resolved.origin });
        if (!log.repository) onRepository?.(candidate);
      }
      const session = current || await AiApi.create({ logId, mode: sourceMode ? AiMode.Source : AiMode.Isolated, repository: sourceMode ? boundRepository : undefined, targets: sourceMode ? sourceTargets : undefined, installRecipe: config.installRecipe, trackLog: config.trackLog });
      run.sessionId = session.id;
      setSessions((old) => [session, ...old.filter((item) => item.id !== session.id)]);
      setPending({ logId, sessionId: session.id, prompt });
      if (run.cancelled) {
        if (logRef.current === logId && selection.current === view) { setSelected(session.id); setNotice('已取消提交。'); }
        return;
      }
      if (logRef.current === logId && selection.current === view) setSelected(session.id);
      const response = await AiApi.prompt(session.id, { prompt, recipe: config.recipe, agent: config.agent || undefined, model: config.providerID && config.modelID ? { providerID: config.providerID, modelID: config.modelID } : undefined });
      if (run.cancelled || runRef.current !== run) return;
      setSessions((old) => old.map((item) => item.id === response.id ? response : item));
      if (logRef.current === logId && selection.current === view) {
        if (response.state === AiSessionState.Error && !response.queue?.length) { setError(response.error || '发送失败'); setDraft(prompt); }
        else { setDraft((value) => value === prompt ? '' : value); setNotice(response.queue?.length ? '已加入队列；按顺序发送。' : '请求已接收。'); }
      }
    } catch (cause) { if (!run.cancelled && logRef.current === logId && selection.current === view) { setError((cause as Error).message); setDraft((value) => value || prompt); } }
    finally {
      if (runRef.current === run) { runRef.current = null; mutation.current += 1; sending.current = false; setSubmitting(false); setPending(null); }
    }
  };
  useEffect(() => {
    if (!request || seenRequest.current === request.nonce) return;
    seenRequest.current = request.nonce;
    setDeferredRequests((items) => [...items, request]);
    if (sending.current && request.logId === logRef.current) setNotice('新请求已保留，将在当前提交完成后发送。');
  }, [request?.nonce]);
  useEffect(() => {
    if (sending.current || !log) return;
    const next = deferredRequests.find((item) => item.logId === log.id);
    if (!next) return;
    setDeferredRequests((items) => items.filter((item) => item.nonce !== next.nonce));
    void send(`${next.title}\n\n${next.text}`, next.scope);
  }, [deferredRequests, submitting, log?.id]);
  const stop = async (session?: AiSession) => {
    const run = visibleRun ? runRef.current : null;
    const view = selection.current;
    if (!run) { if (session) { setNotice('正在停止当前工作…'); await AiApi.abort(session.id); if (selection.current === view) setNotice('已停止当前工作，队列保留并暂停。'); } return; }
    run.cancelled = true;
    setNotice(run.sessionId ? '正在停止当前工作…' : '正在取消提交，等待会话创建返回…');
    if (run.sessionId) { await AiApi.abort(run.sessionId); if (selection.current === view) setNotice('已停止当前工作，队列保留并暂停。'); }
  };
  const chooseRepository = async (value: string) => {
    const candidate = repository?.candidates.find((item) => item.repository === value);
    const logId = log?.id;
    const view = selection.current;
    if (!candidate || !logId || repositoryChoosing) return;
    setRepositoryChoosing(true);
    try {
      const valueState = await AiApi.repository({ logId, repository: value, targets: sourceTargets });
      if (logRef.current !== logId || selection.current !== view) return;
      setRepository({ ...valueState, repository: valueState.repository || value, origin: AiRepositoryOrigin.Manual });
      onRepository?.(valueState.repository || value);
      setError('');
      setNotice(`已选择源码仓库：${valueState.repository || value}`);
    } catch (cause) {
      if (logRef.current === logId && selection.current === view) setError((cause as Error).message);
    } finally { setRepositoryChoosing(false); }
  };
  const bindRepository = async (path: string) => {
    const logId = log?.id;
    const view = selection.current;
    if (!logId) return;
    const value = await AiApi.repository({ logId, repository: path, targets: sourceTargets });
    if (logRef.current !== logId || selection.current !== view) return;
    setRepository(value);
    if (value.repository) onRepository?.(value.repository);
  };
  const act = async (action: () => Promise<unknown>) => {
    mutation.current += 1; setActing(true); setNotice('');
    try { await action(); mutation.current += 1; setSessions((await AiApi.state()).sessions); setError(''); } catch (cause) { setError((cause as Error).message); }
    finally { mutation.current += 1; setActing(false); }
  };
  const select = (id: string) => { selection.current += 1; setSelected(id); setDraft(''); setError(''); setNotice(''); setContextScope(id ? '历史会话 · 原文范围见消息' : '当前日志 · 自由提问'); };

  return <>
    <FloatingPanel theme={theme} title={`AI 工作区 · ${log?.name || '打开日志后开始分析'}`} open={open} onClose={() => onOpenChange(false)} width={480} height={640}>
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto bg-surface p-3 text-ink">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line pb-2"><span className="mr-auto text-[10px] font-semibold text-ink-3">快速分析</span><button className="lv-btn h-7 px-2 text-[11px]" disabled={!log || !errors.length || submitting} title={`分析 ${errors.length} 条 ERROR/FATAL`} onClick={() => void send(`请分析全部 ${errors.length} 条 ERROR/FATAL 日志，识别首个异常和级联错误：\n\n${errors.map((item) => `[日志行 ${item.lineNumber}]\n${item.rawText}`).join('\n\n')}`, `全部 ERROR/FATAL · ${errors.length.toLocaleString()} 条`)}>分析 ERROR <span className="font-mono text-[10px]">{errors.length}</span></button><button className="lv-btn h-7 px-2 text-[11px]" disabled={!log || !content || submitting} onClick={() => { if (window.confirm(`将发送全文：${content.length.toLocaleString()} 个字符，粗估 ${Math.ceil(content.length / 2).toLocaleString()} tokens。长日志可能超过模型上下文，是否继续？`)) void send(`请分析以下完整日志：\n\n${content}`, `完整日志 · ${logs.length.toLocaleString()} 条 · ${content.length.toLocaleString()} 字符`); }}>分析全文</button></div>
        <p className="shrink-0 truncate rounded bg-raised px-2 py-1 text-[10px] text-ink-3" title={contextScope}>最近请求上下文：{contextScope}</p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <select aria-label="AI 会话" value={current?.id || ''} onChange={(event) => select(event.target.value)} className={`min-w-0 flex-1 rounded border p-1.5 text-xs ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`}><option value="">新会话</option>{cases.map((item) => <option key={item.id} value={item.id}>{new Date(item.created).toLocaleString()} · {item.mode === AiMode.Source ? '源码' : '独立日志'} · {item.id.slice(-6)}</option>)}</select>
          <button className={button} aria-label="新会话" onClick={() => select('')}><Plus className="h-4 w-4" /></button>
          <button className={`${button} flex items-center gap-1`} disabled={!current || acting} title="在此会话目录打开 cmd，恢复同一 OpenCode 会话" onClick={() => current && void act(async () => { await AiApi.terminal(current.id); setNotice('已在服务所在电脑打开 CLI 会话。'); })}><Terminal className="h-4 w-4" />CLI 恢复</button>
          <button className={button} aria-label="会话设置" onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" /></button>
        </div>
        <p className="shrink-0 truncate text-xs text-slate-500" title={current?.directory || log?.origin}>{current?.directory || log?.origin || '打开日志后开始分析'}</p>
        <Suspense fallback={<p role="status" className="min-h-0 flex-1 p-4 text-sm text-slate-500">正在加载对话…</p>}><AiConversation key={current?.id || log?.id || 'empty'} messages={current?.messages || []} busy={busy || posting} light={light} /></Suspense>
        {posting && pending ? <div className="shrink-0 truncate px-2 text-xs text-slate-500" title={pending.prompt}>正在提交：{pending.prompt}</div> : null}
        <AiActivity session={current} submitting={posting} light={light} />
        {current?.streamError && busy ? <p role="status" className="shrink-0 break-words px-2 text-xs text-amber-600">{current.streamError}</p> : null}
        {repositoryBusy ? <p role="status" className="shrink-0 px-2 text-xs text-slate-500">正在根据日志源码位置查找仓库…</p> : repository?.repository ? <p className="shrink-0 truncate px-2 text-xs text-slate-500" title={repository.repository}>源码仓库：{repository.repository} · {repository.origin === AiRepositoryOrigin.Bound ? '已有绑定' : repository.origin === AiRepositoryOrigin.Index ? '索引匹配' : '手动选择'}</p> : null}
        {repository && repository.candidates.length > 0 && !repository.repository ? <div className={`max-h-28 shrink-0 overflow-auto rounded-md border p-2 text-xs ${light ? 'border-slate-200' : 'border-slate-700'}`}><p className="mb-1">选择源码仓库后再发送：</p>{repository.candidates.map((item) => <button type="button" disabled={repositoryChoosing} key={item.repository} onClick={() => void chooseRepository(item.repository)} className={`${button} mr-1 mb-1 max-w-full break-all border border-indigo-300 text-left`}>{item.repository}</button>)}</div> : null}
        {!repositoryBusy && repository?.origin === AiRepositoryOrigin.Missing ? <p className="shrink-0 px-2 text-xs text-amber-600">未匹配到源码仓库。<button className="ml-1 underline" onClick={() => setSettingsOpen(true)}>配置索引或绑定目录</button></p> : null}
        {(queue.length > 0 || current?.queuePaused) && current ? <details open className={`shrink-0 rounded-md border px-2 py-1 text-xs ${light ? 'border-slate-200' : 'border-slate-700'}`}>
          <summary className="cursor-pointer py-1"><ListOrdered className="mr-1 inline h-3.5 w-3.5" />待发送 {queue.length} 条 · {current.queuePaused ? '已暂停' : '顺序执行'}</summary>
          <ol className="max-h-28 space-y-1 overflow-auto">{queue.map((item, index) => <li key={item.id} className="flex items-start gap-2 py-1"><span className="text-slate-500">{index + 1}.</span><details className="min-w-0 flex-1"><summary className="cursor-pointer truncate" title={item.prompt}>{item.prompt}</summary><p className="whitespace-pre-wrap break-words py-1">{item.prompt}</p></details><button className={button} disabled={acting} aria-label={`移除队列第 ${index + 1} 条`} onClick={() => void act(() => AiApi.drop(current.id, item.id))}><X className="h-3.5 w-3.5" /></button></li>)}</ol>
          {current.queuePaused ? <button className={`${button} mt-1 flex items-center gap-1 text-indigo-500`} disabled={acting || busy} onClick={() => void act(() => AiApi.resume(current.id))}><Play className="h-3.5 w-3.5" />继续队列</button> : null}
        </details> : null}
        <div className="max-h-48 shrink-0 overflow-auto">{current?.permissions.map((item) => <div key={String(item.id || item.requestID)} className={`mb-2 rounded-lg p-2 text-xs ${light ? 'bg-amber-50 text-amber-950' : 'bg-amber-950/50 text-amber-100'}`}><p>权限请求：{String(item.permission)} · {Array.isArray(item.patterns) ? item.patterns.join(', ') : ''}</p><div className="mt-2 flex gap-3"><button disabled={acting} className={button} onClick={() => void act(() => AiApi.permission(current.id, String(item.id || item.requestID), { reply: 'once' }))}>允许一次</button><button disabled={acting} className={button} onClick={() => void act(() => AiApi.permission(current.id, String(item.id || item.requestID), { reply: 'reject' }))}>拒绝</button></div></div>)}
          {current?.questions.map((item) => <AiQuestionForm key={String(item.id || item.requestID)} question={item} light={light} onSubmit={async (answers) => { await AiApi.question(current.id, String(item.id || item.requestID), { answers }); setSessions((await AiApi.state()).sessions); }} onReject={async () => { await AiApi.question(current.id, String(item.id || item.requestID), {}, true); setSessions((await AiApi.state()).sessions); }} />)}
        </div>
        {connectionError || error || current?.error ? <div role="alert" className={`max-h-24 shrink-0 overflow-auto break-words text-xs ${light ? 'text-rose-600' : 'text-rose-300'}`}>{connectionError || error || current?.error}{current?.error && current.lastPrompt ? <button className="ml-2 underline" onClick={() => setDraft(current.lastPrompt!.prompt)}>取回本轮输入</button> : null}{current ? <button disabled={acting} onClick={() => void act(() => AiApi.refresh(current.id))} className="ml-2 underline">重新同步会话</button> : null}</div> : null}
        <div className="flex shrink-0 items-end gap-2"><textarea aria-label="AI 问题" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!acting) void send(draft); } }} disabled={!log} placeholder={busy || current?.queuePaused ? '继续输入，消息将加入队列…' : '向内部 Agent 追问…'} className={`max-h-36 min-h-16 min-w-0 flex-1 resize-y rounded-lg border p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`} />
          {(busy || posting) ? <button aria-label="停止 AI" title="停止当前工作并暂停队列" disabled={acting} onClick={() => void act(() => stop(current))} className="rounded-lg bg-rose-600 p-2.5 text-white disabled:opacity-40"><Square className="h-4 w-4" /></button> : null}
          <button aria-label={busy || current?.queuePaused ? '加入 AI 队列' : '发送 AI 问题'} disabled={!log || !draft.trim() || submitting || acting} onClick={() => void send(draft)} className="rounded-lg bg-indigo-600 p-2.5 text-white disabled:opacity-40">{posting ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : busy || current?.queuePaused ? <ListOrdered className="h-4 w-4" /> : <Send className="h-4 w-4" />}</button>
        </div>
        <div className="flex shrink-0 flex-wrap justify-between gap-1 text-[11px] text-slate-500"><span>Enter 发送 · Shift+Enter 换行 · 工作中默认排队</span><span role="status">{notice}</span></div>
      </div>
    </FloatingPanel>
    <HistoryBrowser theme={theme} open={historyOpen} revision={log?.id} onClose={() => onHistoryOpenChange(false)} onOpenHistory={(item) => { onHistoryOpenChange(false); onOpenChange(true); onOpenHistory(item); }} />
    <AiSettings key={log?.id || 'empty'} theme={theme} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={setConfig} initial={config} catalog={catalog} repository={repository?.repository || log?.repository} onBind={bindRepository} />
  </>;
}
