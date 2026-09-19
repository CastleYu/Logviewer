import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronRight, FolderOpen, GripHorizontal, Minus, RefreshCw, Settings2 } from 'lucide-react';
import { RemoteDirEntry, SftpProfileView } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';
import { RemoteFileApi } from '../services/remoteFileApi';
import { completeBrowseInput } from '../utils/browseCommands';
import { allowedRoots, logDirectory, normalizeRemotePath, parentRemotePath, pathCrumbs } from '../utils/browsePath';
import { RemoteFileExplorer } from './RemoteFileExplorer';
import { ServerPicker } from './ServerPicker';
import {
  BrowseSession,
  createBrowseSession,
  hideBrowseWindow,
  moveBrowseWindow,
  rememberListing,
  shouldFetchBrowseListing,
  setBrowsePath,
  setBrowseProfile,
  showBrowseWindow,
} from '../utils/browseSession';

export interface BrowseOpenRequest {
  nonce: number;
  profileId?: string;
  path?: string;
}

interface RemoteBrowseWindowProps {
  visible: boolean;
  request: BrowseOpenRequest | null;
  profiles: SftpProfileView[];
  busy: boolean;
  theme: ThemeMode;
  onVisible: (visible: boolean) => void;
  onOpenFile: (profileId: string, path: string) => void;
  onConfigureServers: () => void;
}

function profileRoots(profile?: SftpProfileView): string[] {
  return allowedRoots(profile?.roots, profile?.root);
}

export const RemoteBrowseWindow: React.FC<RemoteBrowseWindowProps> = ({
  visible,
  request,
  profiles,
  busy,
  theme,
  onVisible,
  onOpenFile,
  onConfigureServers,
}) => {
  const light = theme === 'light';
  const ready = profiles.filter((item) => item.ready);
  const [session, setSession] = useState<BrowseSession>(() => createBrowseSession('', '/'));
  const sessionRef = useRef(session);
  const [everOpened, setEverOpened] = useState(false);
  const [command, setCommand] = useState('');
  const [pathInput, setPathInput] = useState('/');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [status, setStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [executing, setExecuting] = useState(false);
  const [size, setSize] = useState({ width: 560, height: 460 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appliedNonce = useRef(0);
  const commandAbort = useRef<AbortController | null>(null);
  useEffect(() => () => commandAbort.current?.abort(), []);

  const apply = (next: BrowseSession) => {
    sessionRef.current = next;
    setSession(next);
  };

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { setPathInput(session.path); }, [session.path]);

  useEffect(() => {
    if (!visible) return;
    setEverOpened(true);
    if (sessionRef.current.visible) return;
    apply(showBrowseWindow(sessionRef.current));
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      if (sessionRef.current.visible) apply(hideBrowseWindow(sessionRef.current));
      return;
    }
    if (!request) return;
    if (request.profileId && !profiles.some((item) => item.id === request.profileId)) return;
    const nextProfile = (request.profileId && profiles.find((item) => item.id === request.profileId && item.ready))
      || ready[0]
      || profiles[0];
    if (!nextProfile) return;
    if (request.nonce === appliedNonce.current) return;
    appliedNonce.current = request.nonce;
    const profile = nextProfile;
    const roots = profileRoots(profile);
    const nextPath = request.path || logDirectory(roots);
    apply(showBrowseWindow(setBrowseProfile(sessionRef.current, profile.id, nextPath)));
    setStatus(null);
    setCandidates([]);
    setCommand('');
    setPathInput(nextPath);
  }, [profiles, request, visible]);

  const profile = profiles.find((item) => item.id === session.profileId) || ready[0] || profiles[0];
  const roots = profileRoots(profile);
  const currentPath = session.path || roots[0] || '/';
  const trail = useMemo(() => pathCrumbs(currentPath, roots), [currentPath, roots]);
  const up = parentRemotePath(currentPath, roots);
  const entries = (session.listing?.path === currentPath ? session.listing.entries : []) as RemoteDirEntry[];

  useEffect(() => {
    const current = sessionRef.current;
    if (!shouldFetchBrowseListing(current, currentPath)) return;
    const listedProfile = profiles.find((item) => item.id === current.profileId);
    if (!listedProfile?.ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    RemoteFileApi.list(current.profileId, currentPath)
      .then((listed) => {
        if (cancelled) return;
        apply(rememberListing(sessionRef.current, listed));
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : '无法列出远程目录');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentPath, profiles, refreshKey, session.profileId]);

  const go = (pathValue: string) => {
    const normalized = normalizeRemotePath(pathValue);
    setPathInput(normalized);
    setSelected(null);
    setCandidates([]);
    apply(setBrowsePath(sessionRef.current, normalized));
  };

  const refresh = () => {
    const current = sessionRef.current;
    apply({ ...current, listing: null });
    setRefreshKey((value) => value + 1);
  };

  const runRemote = async (commandText: string) => {
    if (executing || !commandText.trim()) return;
    if (!profile?.ready) {
      setStatus('请先选择已配置的服务器');
      return;
    }
    if (profile.protocol === 'smb') {
      setStatus('SMB 不支持 SSH 命令，请使用上方路径输入框和目录列表。');
      return;
    }
    setHistory((items) => [...items.filter((item) => item !== commandText), commandText].slice(-30));
    setHistoryIndex(-1);
    setExecuting(true);
    setStatus('正在执行…');
    try {
      const controller = new AbortController();
      commandAbort.current = controller;
      const result = await RemoteFileApi.exec(profile.id, currentPath, commandText, controller.signal);
      if (sessionRef.current.profileId !== profile.id || sessionRef.current.path !== currentPath) return;
      setOutput(`${result.text || (result.ok ? '' : `退出码 ${result.code ?? '?'}`)}${result.cwd ? `${result.text ? '\n' : ''}工作目录：${result.cwd}` : ''}`);
      setStatus(result.ok ? (result.cwd ? `工作目录：${result.cwd}` : null) : `退出码 ${result.code ?? '失败'}${result.cwd ? ` · 工作目录：${result.cwd}` : ''}`);
      if (result.cwd && result.cwd !== currentPath) {
        go(result.cwd);
      } else if (result.ok) {
        refresh();
      }
    } catch (cause) {
      setOutput('');
      setStatus(cause instanceof Error ? cause.message : '远程命令执行失败');
    } finally {
      commandAbort.current = null;
      setExecuting(false);
    }
  };

  const onPathKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      go(pathInput);
    }
  };

  const onCommandKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const result = completeBrowseInput(command, entries);
      setCommand(result.input);
      setCandidates(result.candidates.length > 1 ? result.candidates : []);
      if (result.candidates.length === 1) setStatus(null);
      else if (result.candidates.length === 0) setStatus(command.trim() ? '没有匹配的名称' : null);
      else setStatus(result.candidates.join('  '));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void runRemote(command);
      setCommand('');
    }
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setCommand(history[history.length - 1 - next]);
    }
    if (event.key === 'ArrowDown' && historyIndex >= 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setCommand(next < 0 ? '' : history[history.length - 1 - next]);
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    dragRef.current = { dx: event.clientX - session.x, dy: event.clientY - session.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const x = Math.max(8, Math.min(event.clientX - dragRef.current.dx, window.innerWidth - 240));
    const y = Math.max(8, Math.min(event.clientY - dragRef.current.dy, window.innerHeight - 48));
    apply(moveBrowseWindow(sessionRef.current, x, y));
  };

  const endDrag = () => { dragRef.current = null; };

  const startResize = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    resizeRef.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const resize = (event: React.PointerEvent<HTMLElement>) => {
    const start = resizeRef.current;
    if (!start) return;
    setSize({ width: Math.max(360, Math.min(window.innerWidth - session.x - 8, start.width + event.clientX - start.x)), height: Math.max(300, Math.min(window.innerHeight - session.y - 8, start.height + event.clientY - start.y)) });
  };
  const endResize = () => { resizeRef.current = null; };

  const hide = () => {
    apply(hideBrowseWindow(sessionRef.current));
    onVisible(false);
  };

  const show = () => {
    apply(showBrowseWindow(sessionRef.current));
    onVisible(true);
  };

  const panelHidden = !visible;
  const chip = everOpened && panelHidden;

  return (
    <>
      {chip ? (
        <button
          type="button"
          aria-label="显示目录窗口"
          onClick={show}
          className={`fixed bottom-4 left-4 z-[70] inline-flex max-w-[min(420px,calc(100vw-2rem))] items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl ${
            light ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-700 bg-slate-900 text-slate-100'
          }`}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          <span className="truncate font-mono" data-browse-path={currentPath}>{currentPath}</span>
        </button>
      ) : null}
      <section
        role="dialog"
        aria-label="远程目录"
        aria-hidden={panelHidden}
        style={{ left: `min(${session.x}px, max(8px, calc(100vw - ${size.width + 8}px)))`, top: `min(${session.y}px, max(8px, calc(100vh - ${size.height + 8}px)))`, width: `min(${size.width}px, calc(100vw - 16px))`, height: `min(${size.height}px, calc(100vh - 16px))` }}
        className={`fixed z-[70] overflow-hidden rounded-xl border shadow-2xl ${
          panelHidden ? 'hidden' : 'flex flex-col'
        } ${light ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-700 bg-slate-900 text-slate-100'}`}
      >
        <header
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`flex shrink-0 cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xs font-bold">远程目录</h2>
            <p className={`truncate font-mono text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`} data-browse-path={currentPath}>
              {profile?.name || '未选择服务器'} · {currentPath}
            </p>
          </div>
          <button type="button" aria-label="隐藏目录窗口" onPointerDown={(event) => event.stopPropagation()} onClick={hide} className={`rounded p-1 ${light ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}>
            <Minus className="h-4 w-4" />
          </button>
        </header>

        <div className={`flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5 ${light ? 'border-slate-200' : 'border-slate-800'}`}>
          <ServerPicker
            profiles={profiles}
            value={profile?.id || ''}
            theme={theme}
            disabled={loading}
            onChange={(next) => apply(setBrowseProfile(sessionRef.current, next.id, logDirectory(profileRoots(next))))}
          />
          <button type="button" onClick={() => { if (up) go(up); }} disabled={!up || loading} className="rounded p-1 disabled:opacity-30" aria-label="上级目录">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px]">
            {trail.map((item, index) => (
              <React.Fragment key={item}>
                {index > 0 ? <ChevronRight className="inline h-3 w-3 text-slate-400" /> : null}
                <button type="button" onClick={() => go(item)} className="rounded px-1 py-0.5 hover:text-indigo-600">{index === 0 ? item : item.slice(item.lastIndexOf('/') + 1)}</button>
              </React.Fragment>
            ))}
          </div>
          <button type="button" onClick={onConfigureServers} className="rounded p-1" aria-label="配置服务器" title="配置服务器">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={refresh} disabled={!profile?.ready || loading} className="rounded p-1 disabled:opacity-30" aria-label="刷新目录">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {!profile?.ready ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
            <p>请先在前端注册 SFTP 服务器，无需依赖环境变量。</p>
            <button type="button" onClick={onConfigureServers} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">注册服务器</button>
          </div>
        ) : (
          <RemoteFileExplorer
            theme={theme}
            busy={busy}
            listedPath={session.listing?.path || currentPath}
            entries={entries}
            loading={loading}
            error={error}
            selected={selected}
            onSelected={setSelected}
            onEnter={go}
            onOpen={(pathValue) => { if (profile?.ready) onOpenFile(profile.id, pathValue); }}
            onRefresh={refresh}
            onLink={(pathValue) => {
              const id = profile.id;
              RemoteFileApi.stat(id, pathValue).then((item) => {
                if (sessionRef.current.profileId !== id) return;
                if (item.type === 'dir') go(pathValue); else onOpenFile(id, pathValue);
              }).catch((cause) => setError(cause.message));
            }}
          />
        )}

        <div className={`shrink-0 border-t px-2.5 py-2 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}>
          {output ? (
            <pre className={`mb-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md border px-2 py-1 font-mono text-[10px] leading-relaxed ${light ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-800 bg-slate-900 text-slate-300'}`}>{output}</pre>
          ) : null}
          <label className="mb-1 flex items-center gap-2 font-mono text-[11px]">
            <span className="shrink-0 text-slate-500">路径</span>
            <input aria-label="远程路径" value={pathInput} onChange={(event) => setPathInput(event.target.value)} onKeyDown={onPathKey} placeholder="/" className={`h-8 min-w-0 flex-1 rounded-md border px-2 outline-none ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'}`} />
            <button type="button" onClick={() => go(pathInput)} disabled={loading || executing} className="rounded bg-indigo-600 px-2 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40">进入</button>
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px]">
            <span className="shrink-0 text-indigo-500">$</span>
            <input
              ref={inputRef}
              aria-label="目录命令"
              value={command}
              onChange={(event) => { setCommand(event.target.value); setCandidates([]); }}
              onKeyDown={onCommandKey}
              placeholder={profile?.protocol === 'smb' ? 'SMB 不支持 SSH 命令' : '任意 SSH 命令：cd、ls -la、管道…'}
              disabled={executing || profile?.protocol === 'smb'}
              className={`h-8 w-full rounded-md border px-2 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'}`}
            />
          </label>
          {executing ? <button type="button" onClick={() => commandAbort.current?.abort()} className="mt-1 rounded border px-2 py-1 text-xs">停止命令</button> : null}
          <p className={`mt-1 min-h-4 truncate text-[10px] ${light ? 'text-slate-500' : 'text-slate-400'}`} aria-live="polite">
            {status || (candidates.length > 1 ? candidates.join('  ') : '路径输入负责导航；命令输入原样交给远程 POSIX shell')}
          </p>
        </div>
        <span aria-hidden="true" onPointerDown={startResize} onPointerMove={resize} onPointerUp={endResize} onPointerCancel={endResize} className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" />
      </section>
    </>
  );
};
