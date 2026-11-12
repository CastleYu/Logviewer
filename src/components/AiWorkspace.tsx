import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ChevronDown, MoreHorizontal, Plus, Send, Square, X } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { AiConst, AiDefaults, AiLink, AiMode, AiPartKind, AiRepositoryOrigin, AiSessionState, AiToolStatus, type AiConfig, type AiMsg, type AiNote, type AiPart, type AiRemote, type AiRepositoryState, type AiSession, type AiView } from '../config/aiTypes';
import type { SourceTarget } from '../config/sourceTypes';
import type { HistoryLog } from '../config/historyTypes';
import type { LogEntry, ThemeMode } from '../types';
import { AiApi } from '../services/aiApi';
import { SourceApi } from '../services/sourceApi';
import { HistoryBrowser } from './HistoryBrowser';
import { AiSettings } from './AiSettings';
import { FloatingPanel } from './FloatingPanel';
import { Menu, Tooltip, menuItem } from './Tooltip';

export interface AiWorkspaceRequest { logId: string; nonce: number; text: string; title: string; scope: string }
export interface AiWorkspaceProps { theme: ThemeMode; log: HistoryLog | null; logs: LogEntry[]; content: string; request: AiWorkspaceRequest | null; sourceTargets: SourceTarget[]; sourceRevision: number; open: boolean; historyOpen: boolean; onOpenChange: (open: boolean) => void; onHistoryOpenChange: (open: boolean) => void; onRepository?: (repository: string) => void; onOpenHistory: (log: HistoryLog) => void; onLocalPath: () => void; onJump?: (line: number) => void; getView?: () => AiView }

const linkText = (value: string) => value
  .replace(/(^|[^A-Za-z0-9_])L(\d{1,7})\b/g, '$1[L$2](#line-$2)')
  .replace(/第\s*(\d{1,7})\s*行/g, '[第 $1 行](#line-$1)')
  .replace(/源行\s*(\d{1,7})/g, '[源行 $1](#line-$1)')
  .replace(/(^|[\s`（(])((?:[\w.-]+\/)*[\w.-]+\.(?:py|go|ts|tsx|js|java|cpp|c|cs|rs)):(\d{1,7})/g, (_all, lead: string, file: string, line: string) => `${lead}[${file}:${line}](#file-${encodeURIComponent(file)}:${line})`);

function openFile(file: string, line: number): void {
  const target = { file, line };
  SourceApi.lookup(file).then((rows) => SourceApi.open(target, rows[0]?.path || file)).catch(() => undefined);
}

function follow(event: MouseEvent, jump?: (line: number) => void): void {
  const target = event.target as HTMLElement;
  const link = target.closest('[data-streamdown="link"]');
  if (link) {
    const label = (link.textContent || '').trim();
    const line = label.match(/^(?:L|第\s*|源行\s*)(\d+)\s*行?$/);
    if (line) { event.preventDefault(); event.stopPropagation(); jump?.(Number(line[1])); return; }
    const file = label.match(/^(.+):(\d+)$/);
    if (file) { event.preventDefault(); event.stopPropagation(); openFile(file[1], Number(file[2])); return; }
  }
  const node = target.closest('a');
  if (!node) return;
  const href = node.getAttribute('href') || '';
  if (href.startsWith('#line-')) { event.preventDefault(); jump?.(Number(href.slice(6))); return; }
  if (href.startsWith('#file-')) {
    event.preventDefault();
    const body = href.slice(6);
    const cut = body.lastIndexOf(':');
    openFile(decodeURIComponent(body.slice(0, cut)), Number(body.slice(cut + 1)));
  }
}

function LineText({ text, jump }: { text: string; jump?: (line: number) => void }) {
  const bits = text.split(/(L\d{1,7}|第\s*\d{1,7}\s*行|源行\s*\d{1,7})/g);
  return <span className="whitespace-pre-wrap break-words">{bits.map((bit, index) => {
    const line = bit.match(/^(?:L|第\s*|源行\s*)(\d+)/);
    if (!line) return <span key={index}>{bit}</span>;
    return <button key={index} type="button" className="text-accent-ink underline" onClick={() => jump?.(Number(line[1]))}>{bit}</button>;
  })}</span>;
}

function PartView({ part, jump, onUndo, onAllow }: { key?: string | number; part: AiPart; jump?: (line: number) => void; onUndo: (id: string) => void; onAllow: (id: string) => void }) {
  if (part.t === AiPartKind.User) return <LineText text={part.text} jump={jump} />;
  if (part.t === AiPartKind.Text) return <div onClickCapture={(event) => follow(event, jump)}><Streamdown mode="static" plugins={{ code }} linkSafety={{ enabled: true }}>{linkText(part.text)}</Streamdown></div>;
  if (part.t === AiPartKind.Thought) return <details className="rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink-2"><summary>思考</summary><p className="mt-1 whitespace-pre-wrap">{part.text}</p></details>;
  if (part.t === AiPartKind.Tool) return <details className="rounded-md border border-line bg-raised px-2 py-1 text-xs" open={part.status === AiToolStatus.Fail}><summary className="cursor-pointer">{part.name} · {part.status}</summary><p className="mt-1 text-ink-3">{part.args}</p><div className="mt-1"><LineText text={part.result} jump={jump} /></div></details>;
  if (part.t === AiPartKind.Plan) return <ul className="space-y-1 rounded-md border border-line px-2 py-1 text-xs">{part.items.map((item, index) => <li key={index}>{item.status || '·'} {item.text}</li>)}</ul>;
  if (part.t === AiPartKind.Note) return <div className="flex items-center gap-2 rounded-md border border-ok/40 bg-ok-soft px-2 py-1 text-xs"><span>已写入 {part.name || part.kind}</span><button type="button" className="lv-btn h-6 px-2" onClick={() => onUndo(part.id)}>撤销</button></div>;
  if (part.t === AiPartKind.Deny) return <div className="rounded-md border border-danger/40 bg-danger-soft px-2 py-1 text-xs"><p>已拒绝 {part.title}</p><p className="text-ink-2">{part.why}</p><button type="button" className="lv-btn mt-1 h-6 px-2" onClick={() => onAllow(part.id)}>放行</button></div>;
  return null;
}

function Message({ msg, jump, onUndo, onAllow }: { key?: string | number; msg: AiMsg; jump?: (line: number) => void; onUndo: (id: string) => void; onAllow: (id: string) => void }) {
  return <article className={`rounded-lg px-2 py-1.5 text-sm ${msg.role === 'user' ? 'bg-accent-soft' : 'bg-sunken'}`}>
    <div className="mb-1 text-[10px] font-semibold text-ink-3">{msg.role === 'user' ? '我' : 'Agent'}{msg.stop ? ' · 已停止' : ''}</div>
    <div className="space-y-1">{msg.parts.map((part, index) => <PartView key={index} part={part} jump={jump} onUndo={onUndo} onAllow={onAllow} />)}</div>
  </article>;
}

export function AiWorkspace({ theme, log, logs, request, sourceTargets, sourceRevision, open, historyOpen, onOpenChange, onHistoryOpenChange, onRepository, onOpenHistory, onJump, getView }: AiWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<'chat' | 'notes'>('chat');
  const [config, setConfig] = useState<AiConfig>(AiDefaults.config());
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [remote, setRemote] = useState<AiRemote[]>([]);
  const [link, setLink] = useState<AiLink>(AiLink.Off);
  const [steering, setSteering] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [steer, setSteer] = useState(false);
  const [chip, setChip] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [noteId, setNoteId] = useState('');
  const [noteName, setNoteName] = useState('');
  const [noteText, setNoteText] = useState('');
  const [repository, setRepository] = useState<AiRepositoryState | null>(null);
  const [menu, setMenu] = useState<{ kind: 'session' | 'model' | 'mode' | 'more' | 'slash'; rect: DOMRect } | null>(null);
  const [deferred, setDeferred] = useState<AiWorkspaceRequest[]>([]);
  const seen = useRef(0);
  const refreshed = useRef(new Set<string>());
  const logRef = useRef(log?.id);
  logRef.current = log?.id;
  const box = useRef<HTMLDivElement>(null);
  const cases = useMemo(() => sessions.filter((item) => !log || item.logId === log.id), [sessions, log?.id]);
  const current = cases.find((item) => item.id === selected) || cases[0];
  const busy = current?.state === AiSessionState.Busy;
  const view = getView?.() || AiDefaults.view();
  const lines = view.selected;
  const chipText = lines.length ? `选中 ${lines.length} 行 · L${Math.min(...lines)}–L${Math.max(...lines)}` : view.search ? `搜索 ${view.search}` : view.filter ? `筛选 ${view.filter}` : '';
  const model = current?.options.find((item) => item.id === 'model');
  const mode = current?.options.find((item) => item.id === 'mode');
  const slash = draft.startsWith('/') && !draft.includes(' ') ? draft.slice(1) : '';
  const commands = (current?.commands || []).filter((item) => !slash || item.name.includes(slash));
  const dot = link === AiLink.Ready ? 'bg-ok' : link === AiLink.Work ? 'bg-warn' : link === AiLink.Fail ? 'bg-danger' : 'bg-ink-3';
  const linkName = link === AiLink.Ready ? '就绪' : link === AiLink.Work ? '工作中' : link === AiLink.Fail ? '出错' : '未连接';

  const take = (state: { sessions: AiSession[]; config: AiConfig; link: AiLink; steering?: boolean; remote?: AiRemote[] }) => {
    setSessions(state.sessions);
    setConfig(state.config);
    setLink(state.link);
    setSteering(!!state.steering);
    setRemote(state.remote || []);
  };
  const put = (session: AiSession) => setSessions((old) => old.some((item) => item.id === session.id) ? old.map((item) => item.id === session.id ? session : item) : [session, ...old]);

  useEffect(() => {
    let live = true;
    AiApi.state().then((state) => { if (live) take(state); }).catch((cause) => { if (live) setError((cause as Error).message); });
    const source = new EventSource(`${AiConst.Api}/events`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type?: string; session?: AiSession };
      if (payload.type === 'session' && payload.session) put(payload.session);
      if (payload.type === 'state') AiApi.state().then((state) => { if (live) take(state); }).catch(() => undefined);
    };
    return () => { live = false; source.close(); };
  }, []);
  useEffect(() => { setSelected(null); setDraft(''); setChip(true); setError(''); refreshed.current.clear(); }, [log?.id]);
  useEffect(() => { const node = box.current; if (node) node.scrollTop = node.scrollHeight; }, [current?.messages, current?.state, open]);
  useEffect(() => {
    if (sessions.some((item) => item.state === AiSessionState.Busy)) setLink(AiLink.Work);
    else if (sessions.some((item) => item.state === AiSessionState.Error || item.link === AiLink.Fail)) setLink(AiLink.Fail);
    else if (sessions.some((item) => item.agentId)) setLink(AiLink.Ready);
  }, [sessions]);
  useEffect(() => {
    const item = current;
    if (!item || item.legacy || item.closed || !item.agentId || item.loaded !== false || refreshed.current.has(item.id)) return;
    refreshed.current.add(item.id);
    AiApi.refresh(item.id).then(put).catch((cause) => setError((cause as Error).message));
  }, [current?.id, current?.loaded]);
  useEffect(() => {
    if (!open || !log || config.mode === AiMode.Isolated) { setRepository(null); return; }
    let live = true;
    AiApi.repository({ logId: log.id, targets: sourceTargets, repository: log.repository }).then((value) => {
      if (!live || logRef.current !== log.id) return;
      setRepository(value);
      if (value.repository && !log.repository && value.origin !== AiRepositoryOrigin.Missing) onRepository?.(value.repository);
    }).catch((cause) => { if (live) setError((cause as Error).message); });
    return () => { live = false; };
  }, [open, log?.id, sourceRevision, config.mode, sourceTargets, log?.repository, onRepository]);
  useEffect(() => {
    if (tab !== 'notes' || !log) return;
    let live = true;
    AiApi.notes(log.id).then((rows) => { if (live) setNotes(rows); }).catch((cause) => { if (live) setError((cause as Error).message); });
    return () => { live = false; };
  }, [tab, log?.id, current?.messages]);

  const freshView = (): AiView => {
    const next = getView?.() || AiDefaults.view();
    return chip ? next : { ...next, use: false, selected: [] };
  };
  const ensure = async (fresh = false): Promise<AiSession> => {
    if (!fresh && current && !current.closed) return current;
    if (!log) throw new Error('请先打开日志');
    let sourceMode = (config.mode || AiMode.Source) === AiMode.Source;
    let repositoryPath = log.repository || repository?.repository;
    if (sourceMode && !repositoryPath) {
      const resolved = await AiApi.repository({ logId: log.id, targets: sourceTargets, repository: log.repository });
      repositoryPath = resolved.repository || (resolved.candidates.length === 1 ? resolved.candidates[0].repository : undefined);
      setRepository(resolved.repository ? { ...resolved, repository: repositoryPath, origin: resolved.origin } : resolved);
      if (!repositoryPath && resolved.candidates.length > 1) throw new Error('检测到多个源码仓库，请先选择一个。');
      if (!repositoryPath) { sourceMode = false; setNotice('未找到源码仓库，已使用隔离日志工作区'); }
      if (repositoryPath && !log.repository) onRepository?.(repositoryPath);
    }
    const session = await AiApi.create({ logId: log.id, mode: sourceMode ? AiMode.Source : AiMode.Isolated, repository: sourceMode ? repositoryPath : undefined, targets: sourceMode ? sourceTargets : undefined, installRecipe: config.installRecipe, trackLog: config.trackLog });
    put(session);
    setSelected(session.id);
    return session;
  };
  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    onOpenChange(true);
    setError('');
    setNotice('');
    try {
      const session = await ensure();
      if (session.legacy) { setError('旧版会话只读，不能继续发送'); return; }
      const next = await AiApi.prompt(session.id, prompt, freshView(), steer && busy);
      put(next);
      setDraft('');
      setSteer(false);
      setNotice(next.state === AiSessionState.Busy && next.queue.some((item) => item.text === prompt) ? '已加入队列' : '');
    } catch (cause) { setError((cause as Error).message); }
  };
  useEffect(() => {
    if (!request || seen.current === request.nonce) return;
    seen.current = request.nonce;
    setDeferred((items) => [...items, request]);
  }, [request]);
  useEffect(() => {
    if (!log) return;
    const next = deferred.find((item) => item.logId === log.id);
    if (!next || busy) return;
    setDeferred((items) => items.filter((item) => item.nonce !== next.nonce));
    void send(next.text);
  }, [deferred, log?.id, busy]);

  const act = async (task: () => Promise<AiSession | void>) => {
    setError('');
    try { const session = await task(); if (session) put(session); } catch (cause) { setError((cause as Error).message); }
  };
  const move = (index: number, step: number) => {
    if (!current) return;
    const ids = current.queue.map((item) => item.id);
    const next = index + step;
    if (next < 0 || next >= ids.length) return;
    const [id] = ids.splice(index, 1);
    ids.splice(next, 0, id);
    void act(() => AiApi.order(current.id, ids));
  };
  const openMenu = (kind: NonNullable<typeof menu>['kind'], event: MouseEvent<HTMLButtonElement>) => setMenu({ kind, rect: event.currentTarget.getBoundingClientRect() });
  const writeNote = async () => {
    if (!log || !noteText.trim()) return;
    try {
      const saved = await AiApi.saveNote(log.id, noteName || '笔记', noteText, noteId || undefined);
      setNotes((rows) => noteId ? rows.map((row) => row.id === saved.id ? saved : row) : [saved, ...rows]);
      setNoteId('');
      setNoteName('');
      setNoteText('');
    } catch (cause) { setError((cause as Error).message); }
  };
  const empty = !current?.messages.length;
  const suggestions = [
    { label: '概览这份日志', text: '概览这份日志' },
    { label: '分析错误', text: '分析这份日志里最主要的错误' },
    { label: `分析选中的 ${lines.length} 行`, text: '分析当前选中的行', off: !lines.length },
    { label: '分析当前筛选结果', text: '分析当前筛选结果', off: !view.filter && !view.search },
  ];

  const bar = <>
    <Tooltip text={linkName}><span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-label={linkName} /></Tooltip>
    <button type="button" className="lv-btn h-6 max-w-36 px-2 text-[10px]" disabled={!model} onClick={(event) => openMenu('model', event)}>{model?.options.find((item) => item.value === (current?.model || model.value))?.name || current?.model || '模型'}<ChevronDown className="h-3 w-3" /></button>
    {mode?.options.length ? <button type="button" className="lv-btn h-6 max-w-24 px-2 text-[10px]" onClick={(event) => openMenu('mode', event)}>{mode.options.find((item) => item.value === (current?.modeId || mode.value))?.name || '模式'}<ChevronDown className="h-3 w-3" /></button> : null}
  </>;

  return <>
    <FloatingPanel theme={theme} title={`AI · ${log?.name || '打开日志后开始'}`} open={open} onClose={() => onOpenChange(false)} onMinimize={() => setMinimized((value) => !value)} minimized={minimized} extra={bar} fill width={520} height={680}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
          <button type="button" className="lv-btn h-7 min-w-0 flex-1 px-2 text-[11px]" onClick={(event) => openMenu('session', event)}><span className="truncate">{current ? `${current.title}${current.legacy ? ' · 只读' : ''}` : '会话'}</span><ChevronDown className="h-3 w-3 shrink-0" /></button>
          <Tooltip text="新会话"><button type="button" className="lv-icon-btn h-7 w-7" aria-label="新会话" disabled={!log} onClick={() => void act(async () => { const session = await ensure(true); setSelected(session.id); setNotice('已新建会话'); return session; })}><Plus className="h-3.5 w-3.5" /></button></Tooltip>
          <Tooltip text="更多"><button type="button" className="lv-icon-btn h-7 w-7" aria-label="更多" onClick={(event) => openMenu('more', event)}><MoreHorizontal className="h-3.5 w-3.5" /></button></Tooltip>
        </div>
        <div className="flex shrink-0 gap-1 px-2 pt-1">
          <button type="button" className={`lv-btn h-7 px-2 text-[11px] ${tab === 'chat' ? '!bg-accent-soft !text-accent-ink' : ''}`} onClick={() => setTab('chat')}>对话</button>
          <button type="button" className={`lv-btn h-7 px-2 text-[11px] ${tab === 'notes' ? '!bg-accent-soft !text-accent-ink' : ''}`} onClick={() => setTab('notes')}>笔记</button>
          {repository?.repository ? <span className="ml-auto truncate text-[10px] text-ink-3" title={repository.repository}>仓库 {repository.repository.split(/[/\\]/).pop()}</span> : null}
        </div>
        {repository && !repository.repository && repository.candidates.length > 1 ? <div className="shrink-0 space-y-1 px-2 py-1">{repository.candidates.map((item) => <button key={item.repository} type="button" className="lv-btn h-7 w-full justify-start px-2 text-[11px]" onClick={() => void AiApi.repository({ logId: log!.id, repository: item.repository, targets: sourceTargets }).then((value) => { setRepository(value); if (value.repository) onRepository?.(value.repository); })}>{item.repository}</button>)}</div> : null}
        {tab === 'notes' ? <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
          {notes.map((item) => <article key={item.id} className="rounded-md border border-line p-2 text-xs"><header className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate">{item.name || item.kind}</strong><button type="button" className="text-accent-ink" onClick={() => { setNoteId(item.id); setNoteName(item.name); setNoteText(item.text); }}>编辑</button><button type="button" className="text-danger" onClick={() => void AiApi.undo(item.id).then(() => { setNotes((rows) => rows.filter((row) => row.id !== item.id)); if (noteId === item.id) { setNoteId(''); setNoteName(''); setNoteText(''); } })}>删除</button></header><pre className="mt-1 whitespace-pre-wrap text-ink-2">{item.text}</pre></article>)}
          {!notes.length ? <p className="text-xs text-ink-3">还没有笔记</p> : null}
          <input aria-label="笔记标题" value={noteName} onChange={(event) => setNoteName(event.target.value)} placeholder="标题" className="h-8 w-full rounded-md border border-line bg-sunken px-2 text-xs" />
          <textarea aria-label="笔记正文" value={noteText} onChange={(event) => setNoteText(event.target.value)} className="h-24 w-full rounded-md border border-line bg-sunken p-2 text-xs" />
          <div className="flex gap-2"><button type="button" className="lv-btn h-7 px-2 text-[11px]" disabled={!log || !noteText.trim()} onClick={() => void writeNote()}>{noteId ? '保存修改' : '保存笔记'}</button>{noteId ? <button type="button" className="lv-btn h-7 px-2 text-[11px]" onClick={() => { setNoteId(''); setNoteName(''); setNoteText(''); }}>取消</button> : null}<button type="button" className="lv-btn h-7 px-2 text-[11px]" disabled={!notes.length} onClick={() => { const blob = new Blob([notes.map((item) => `# ${item.name}\n\n${item.text}`).join('\n\n')], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'notes.md'; link.click(); URL.revokeObjectURL(url); }}>导出</button></div>
        </div> : <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-auto p-2" role="log">
          {empty ? <div className="grid grid-cols-2 gap-2">{suggestions.map((item) => <button key={item.label} type="button" disabled={!log || item.off} className="rounded-lg border border-line bg-raised px-2 py-3 text-left text-xs hover:border-line-strong disabled:opacity-40" onClick={() => void send(item.text)}>{item.label}</button>)}</div> : current?.messages.map((msg) => <Message key={msg.id} msg={msg} jump={onJump} onUndo={(id) => void AiApi.undo(id)} onAllow={(id) => current && void act(() => AiApi.allow(current.id, id))} />)}
          {current?.queuePaused ? <p className="text-[11px] text-warn">队列已暂停</p> : null}
        </div>}
        {tab === 'chat' ? <div className="shrink-0 space-y-1 border-t border-line p-2">
          {current?.queue.length ? <ol className="max-h-24 space-y-1 overflow-auto text-[11px]">{current.queue.map((item, index) => <li key={item.id} className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate">{index + 1}. {item.text}</span><Tooltip text="上移"><button type="button" aria-label="上移" onClick={() => move(index, -1)}>↑</button></Tooltip><Tooltip text="下移"><button type="button" aria-label="下移" onClick={() => move(index, 1)}>↓</button></Tooltip><Tooltip text="移出队列"><button type="button" aria-label="移除" onClick={() => void act(() => AiApi.drop(current.id, item.id))}><X className="h-3 w-3" /></button></Tooltip></li>)}</ol> : null}
          {chip && chipText ? <button type="button" className="inline-flex max-w-full items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[10px] text-ink-2" onClick={() => setChip(false)}>📎 {chipText} <X className="h-3 w-3" /></button> : null}
          {error ? <p role="alert" className="text-[11px] text-danger">{error}</p> : null}
          {notice ? <p role="status" className="text-[11px] text-ink-3">{notice}</p> : null}
          <div className="flex items-end gap-1">
            <textarea aria-label="向 AI 提问" value={draft} disabled={!!current?.legacy} onChange={(event) => { setDraft(event.target.value); if (event.target.value.startsWith('/') && !event.target.value.includes(' ')) setMenu({ kind: 'slash', rect: event.target.getBoundingClientRect() }); else if (menu?.kind === 'slash') setMenu(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} placeholder={current?.legacy ? '旧版会话只读' : '提问，或输入 /'} className="h-16 min-w-0 flex-1 resize-none rounded-md border border-line bg-sunken p-2 text-xs outline-none" />
            <div className="flex flex-col gap-1">
              {busy ? <Tooltip text="停止当前轮"><button type="button" className="lv-btn lv-btn-danger h-8 px-2" aria-label="停止" onClick={() => current && void act(() => AiApi.abort(current.id))}><Square className="h-3.5 w-3.5" />停止</button></Tooltip> : null}
              {current?.queuePaused ? <Tooltip text="继续发送队列"><button type="button" className="lv-btn h-8 px-2" onClick={() => current && void act(() => AiApi.resume(current.id))}>继续</button></Tooltip> : null}
              <Tooltip text={busy ? '加入队列，本轮结束后发送' : '发送消息'}><button type="button" className="lv-btn lv-btn-primary h-8 px-2" disabled={!draft.trim() || !!current?.legacy} onClick={() => void send(draft)}><Send className="h-3.5 w-3.5" />{busy ? '排队' : '发送'}</button></Tooltip>
            </div>
          </div>
          {steering && busy ? <label className="flex items-center gap-1 text-[11px] text-ink-2"><input type="checkbox" checked={steer} onChange={(event) => setSteer(event.target.checked)} />插入到当前轮</label> : null}
        </div> : null}
      </div>
    </FloatingPanel>
    <Menu open={menu?.kind === 'session'} anchor={menu?.rect || null} label="会话" onClose={() => setMenu(null)}>
      {cases.map((item) => <button key={item.id} type="button" role="menuitem" className={menuItem(item.id === current?.id)} onClick={() => { setSelected(item.id); setMenu(null); }}>{item.legacy ? '只读 · ' : ''}{item.title}</button>)}
      {remote.filter((item) => !sessions.some((row) => row.agentId === item.sessionId)).map((item) => <button key={item.sessionId} type="button" role="menuitem" className={menuItem()} disabled>{item.title}</button>)}
      {!cases.length ? <p className="px-2 py-1 text-[11px] text-ink-3">还没有会话</p> : null}
    </Menu>
    <Menu open={menu?.kind === 'model'} anchor={menu?.rect || null} label="模型" onClose={() => setMenu(null)}>
      {(model?.options || []).map((item) => <button key={item.value} type="button" role="menuitem" className={menuItem(item.value === (current?.model || model?.value))} onClick={() => { setMenu(null); if (current) void act(() => AiApi.model(current.id, item.value)); }}>{item.name}</button>)}
    </Menu>
    <Menu open={menu?.kind === 'mode'} anchor={menu?.rect || null} label="模式" onClose={() => setMenu(null)}>
      {(mode?.options || []).map((item) => <button key={item.value} type="button" role="menuitem" className={menuItem(item.value === (current?.modeId || mode?.value))} onClick={() => { setMenu(null); if (current) void act(() => AiApi.mode(current.id, item.value, mode?.id)); }}>{item.name}</button>)}
    </Menu>
    <Menu open={menu?.kind === 'more'} anchor={menu?.rect || null} label="更多" onClose={() => setMenu(null)}>
      <button type="button" role="menuitem" className={menuItem()} disabled={!current || !!current.legacy} onClick={() => { setMenu(null); if (current) void AiApi.terminal(current.id).then(() => setNotice('已打开终端')).catch((cause) => setError((cause as Error).message)); }}>在终端继续</button>
      <button type="button" role="menuitem" className={menuItem()} disabled={!current} onClick={() => { setMenu(null); if (current) void act(() => AiApi.refresh(current.id)); }}>刷新</button>
      <button type="button" role="menuitem" className={menuItem()} disabled={!current} onClick={() => { setMenu(null); if (current) void act(() => AiApi.close(current.id)); }}>关闭会话</button>
      <button type="button" role="menuitem" className={menuItem()} disabled={!current} onClick={() => { setMenu(null); if (current) void AiApi.remove(current.id).then((state) => { take(state); setSelected(null); }); }}>删除会话</button>
      <button type="button" role="menuitem" className={menuItem()} onClick={() => { setMenu(null); setSettingsOpen(true); }}>设置</button>
    </Menu>
    <Menu open={menu?.kind === 'slash'} anchor={menu?.rect || null} label="命令" onClose={() => setMenu(null)}>
      {commands.map((item) => <button key={item.name} type="button" role="menuitem" className={menuItem()} onClick={() => { setDraft(`/${item.name} `); setMenu(null); }}><span className="font-mono">/{item.name}</span> <span className="text-ink-3">{item.description}</span></button>)}
      {!commands.length ? <p className="px-2 py-1 text-[11px] text-ink-3">暂无命令</p> : null}
    </Menu>
    <AiSettings theme={theme} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={(next) => { setConfig(next); setSettingsOpen(false); }} />
    <HistoryBrowser theme={theme} open={historyOpen} revision={log?.id} onClose={() => onHistoryOpenChange(false)} onOpenHistory={(item) => { onHistoryOpenChange(false); onOpenChange(true); onOpenHistory(item); }} />
  </>;
}

