import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUp, Clock3, Eye, EyeOff, HardDrive, Maximize2, Minimize2, Minus,
  Plus, RefreshCw, Search, Server, Settings2, Star, TerminalSquare, X,
} from 'lucide-react';
import { EntryAction, RemoteDirEntry, RemoteOpenOptions, RemoteProtocolKind, RemoteStoreKey, RemoteUi, SftpProfileView } from '../config/fileLoadTypes';
import { RemoteFileApi } from '../services/remoteFileApi';
import { RemotePrefs } from '../utils/remotePrefs';
import { baseName, middleEllipsis, normalizeRemotePath, parentRemotePath, resolveInput } from '../utils/browsePath';
import { shQuote } from '../utils/remoteExec';
import { RemotePathBar } from './RemotePathBar';
import { RemoteFileList, isDir } from './RemoteFileList';
import { RemoteConsole, RemoteConsoleHandle } from './RemoteConsole';
import { RemoteOpenSheet } from './RemoteOpenSheet';

export interface BrowseOpenRequest {
  nonce: number;
  profileId?: string;
  path?: string;
}

interface RemoteWorkbenchProps {
  visible: boolean;
  request: BrowseOpenRequest | null;
  profiles: SftpProfileView[];
  busy: boolean;
  onVisible: (visible: boolean) => void;
  onOpen: (profileId: string, path: string, options: RemoteOpenOptions) => void;
  onManage: (profileId?: string | null) => void;
  onServersChanged: () => void;
}

interface Frame { x: number; y: number; w: number; h: number; max: boolean; console: number; showConsole: boolean }

function loadFrame(): Frame {
  const fallback: Frame = { x: 24, y: 64, w: 1040, h: 660, max: false, console: 200, showConsole: false };
  let saved: Partial<Frame> | null = null;
  try { saved = JSON.parse(localStorage.getItem(RemoteStoreKey.Window) || 'null') as Partial<Frame> | null; } catch { /* ignore */ }
  const value = { ...fallback, ...(saved || {}) };
  // 窗口尺寸可能在隐藏标签页里被记成 0，统一夹到可用范围；超出视口的部分由 CSS min() 再收紧
  return {
    ...value,
    x: Math.max(0, Number(value.x) || 0),
    y: Math.max(0, Number(value.y) || 0),
    w: Number(value.w) >= RemoteUi.MinWidth ? Number(value.w) : fallback.w,
    h: Number(value.h) >= RemoteUi.MinHeight ? Number(value.h) : fallback.h,
    console: Math.max(96, Number(value.console) || fallback.console),
  };
}

interface Listing { profileId: string; path: string; entries: RemoteDirEntry[] }

/**
 * 远程工作台：服务器 / 收藏 / 最近目录侧栏 + 路径栏 + 文件列表 + 可折叠终端。
 * 一个窗口完成“选服务器 → 找目录 → 执行命令 → 打开或下载日志”，可最大化、拖动、缩放、最小化成底部标签。
 */
export const RemoteWorkbench: React.FC<RemoteWorkbenchProps> = ({ visible, request, profiles, busy, onVisible, onOpen, onManage, onServersChanged }) => {
  const usable = useMemo(() => profiles.filter((item) => item.ready), [profiles]);
  const [frame, setFrame] = useState<Frame>(loadFrame);
  const [profileId, setProfileId] = useState('');
  const [path, setPath] = useState('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(false);
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [homes, setHomes] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ path: string; size: number; modifyTime?: number; tail?: boolean } | null>(null);
  const [serverQuery, setServerQuery] = useState('');
  const [everShown, setEverShown] = useState(false);
  const consoleRef = useRef<RemoteConsoleHandle>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const applied = useRef(0);
  const drag = useRef<{ kind: 'move' | 'size' | 'console'; x: number; y: number; frame: Frame } | null>(null);

  const profile = usable.find((item) => item.id === profileId);
  const shell = profile?.protocol !== RemoteProtocolKind.Smb;
  const favorites = (profile?.roots || []).map(normalizeRemotePath).filter((item) => item !== '/');
  const starred = favorites.includes(path);
  const entries = listing && listing.profileId === profileId && listing.path === path ? listing.entries : [];
  const recent = profile ? RemotePrefs.recent(profile.id).filter((item) => item !== path).slice(0, 6) : [];

  useEffect(() => {
    try { localStorage.setItem(RemoteStoreKey.Window, JSON.stringify(frame)); } catch { /* ignore */ }
  }, [frame]);
  useEffect(() => { if (visible) setEverShown(true); }, [visible]);

  const startAt = useCallback(async (target: SftpProfileView): Promise<string> => {
    const remembered = RemotePrefs.last(target.id);
    if (remembered) return remembered;
    const favorite = (target.roots || []).map(normalizeRemotePath).find((item) => item !== '/');
    if (favorite) return favorite;
    try {
      const home = homes[target.id] || await RemoteFileApi.home(target.id);
      setHomes((value) => ({ ...value, [target.id]: home }));
      return home;
    } catch { return '/'; }
  }, [homes]);

  const switchTo = useCallback(async (target: SftpProfileView, at?: string) => {
    setProfileId(target.id);
    setBack([]);
    setForward([]);
    setQuery('');
    setError(null);
    setNotice(null);
    setListing(null);
    setPath(normalizeRemotePath(at || await startAt(target)));
  }, [startAt]);

  // 外部打开请求（顶部按钮、服务器管理“保存并浏览”）
  useEffect(() => {
    if (!visible || !request || request.nonce === applied.current) return;
    const wanted = request.profileId ? usable.find((item) => item.id === request.profileId) : undefined;
    if (request.profileId && !wanted) return; // 等新注册的服务器出现在列表里
    applied.current = request.nonce;
    const target = wanted || (profile ? undefined : usable.find((item) => item.id === RemotePrefs.server()) || usable[0]);
    if (target) void switchTo(target, request.path);
  }, [visible, request, usable, profile, switchTo]);

  // 当前服务器被删除时回退
  useEffect(() => {
    if (profileId && !usable.some((item) => item.id === profileId)) {
      setProfileId('');
      setListing(null);
      if (usable[0] && visible) void switchTo(usable[0]);
    }
  }, [usable, profileId, visible, switchTo]);

  useEffect(() => {
    if (!profileId || !path || !visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    RemoteFileApi.list(profileId, path)
      .then((value) => {
        if (cancelled) return;
        setListing({ profileId, path, entries: value.entries });
        RemotePrefs.visit(profileId, path);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '无法读取目录'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId, path, reload, visible]);

  const go = (next: string, record = true) => {
    const target = normalizeRemotePath(next);
    if (target === path) { setReload((value) => value + 1); return; }
    if (record && path) { setBack((items) => [...items, path].slice(-50)); setForward([]); }
    setNotice(null);
    setQuery('');
    setPath(target);
  };
  const goBack = () => { const prev = back[back.length - 1]; if (!prev) return; setBack(back.slice(0, -1)); setForward([path, ...forward]); go(prev, false); };
  const goForward = () => { const next = forward[0]; if (!next) return; setForward(forward.slice(1)); setBack([...back, path]); go(next, false); };
  const up = parentRemotePath(path, []);

  const requestOpen = (full: string, size: number, modifyTime?: number) => {
    if (!profile) return;
    if (busy) { setNotice('正在加载另一个文件，完成后再打开'); return; }
    if (size > RemoteUi.LargeFileBytes) { setSheet({ path: full, size, modifyTime }); return; }
    onOpen(profile.id, full, {});
  };

  const activate = (entry: RemoteDirEntry, full: string) => {
    if (isDir(entry)) { go(full); return; }
    if (entry.type === 'link' && !entry.target && profile && shell) {
      RemoteFileApi.stat(profile.id, full)
        .then((stat) => (stat.type === 'dir' ? go(full) : requestOpen(full, stat.size, stat.modifyTime)))
        .catch((cause) => setNotice(cause instanceof Error ? cause.message : '无法解析链接'));
      return;
    }
    requestOpen(full, entry.size, entry.modifyTime);
  };

  const submitPath = (input: string) => {
    const target = resolveInput(path || '/', input, (profile && homes[profile.id]) || '/');
    if (!profile || !shell) { go(target); return; }
    RemoteFileApi.stat(profile.id, target)
      .then((stat) => {
        if (stat.type === 'dir') { go(target); return; }
        const parent = parentRemotePath(target, []) || '/';
        if (parent !== path) go(parent);
        requestOpen(target, stat.size, stat.modifyTime);
      })
      .catch(() => go(target)); // 让列表展示具体错误（不存在 / 无权限）
  };

  const act = (action: EntryAction, entry: RemoteDirEntry, full: string) => {
    if (!profile) return;
    if (action === EntryAction.Open) requestOpen(full, entry.size, entry.modifyTime);
    if (action === EntryAction.Tail) setSheet({ path: full, size: entry.size, modifyTime: entry.modifyTime, tail: true });
    if (action === EntryAction.Save) { if (busy) setNotice('正在加载另一个文件，完成后再下载'); else onOpen(profile.id, full, { save: true }); }
    if (action === EntryAction.Copy) { void navigator.clipboard?.writeText(full); setNotice(`已复制 ${full}`); }
    if (action === EntryAction.Insert || action === EntryAction.Grep) {
      setFrame((value) => ({ ...value, showConsole: true }));
      const arg = shQuote(entry.name);
      window.setTimeout(() => consoleRef.current?.insert(action === EntryAction.Grep ? `grep -n -i 'error' ${arg} | tail -n 200` : arg), 30);
    }
  };

  const toggleStar = async () => {
    if (!profile) return;
    const next = starred ? favorites.filter((item) => item !== path) : [...favorites, path];
    try {
      await RemoteFileApi.setPaths(profile.id, next);
      onServersChanged();
      setNotice(starred ? '已取消收藏' : '已收藏当前目录');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '收藏失败');
    }
  };

  const hide = () => onVisible(false);

  // 拖动、缩放、终端高度
  const begin = (kind: 'move' | 'size' | 'console') => (event: React.PointerEvent) => {
    if (event.button !== 0 || (kind === 'move' && (frame.max || (event.target as HTMLElement).closest('button,input')))) return;
    drag.current = { kind, x: event.clientX, y: event.clientY, frame };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const base = state.frame;
    if (state.kind === 'move') setFrame({ ...base, x: Math.max(0, Math.min(window.innerWidth - 160, base.x + dx)), y: Math.max(0, Math.min(window.innerHeight - 44, base.y + dy)) });
    if (state.kind === 'size') setFrame({ ...base, w: Math.max(RemoteUi.MinWidth, base.w + dx), h: Math.max(RemoteUi.MinHeight, base.h + dy) });
    if (state.kind === 'console') setFrame({ ...base, console: Math.max(96, Math.min(560, base.console - dy)) });
  };
  const end = () => { drag.current = null; };

  // 快捷键：Ctrl+F 过滤、Ctrl+` 终端、Alt+← → ↑
  const onKey = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); filterRef.current?.focus(); }
    if (event.ctrlKey && event.key === '`') { event.preventDefault(); setFrame((value) => ({ ...value, showConsole: !value.showConsole })); }
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); goBack(); }
    if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); goForward(); }
    if (event.altKey && event.key === 'ArrowUp' && up) { event.preventDefault(); go(up); }
  };

  const style: React.CSSProperties = frame.max
    ? { left: 8, top: 8, width: 'calc(100vw - 16px)', height: 'calc(100vh - 16px)' }
    : {
      left: `min(${frame.x}px, max(0px, calc(100vw - ${frame.w}px)))`,
      top: `min(${frame.y}px, max(0px, calc(100vh - ${frame.h}px)))`,
      width: `min(${frame.w}px, calc(100vw - 16px))`,
      height: `min(${frame.h}px, calc(100vh - 16px))`,
    };

  const servers = serverQuery.trim() ? usable.filter((item) => `${item.name} ${item.host}`.toLowerCase().includes(serverQuery.trim().toLowerCase())) : usable;
  const hiddenCount = entries.filter((entry) => entry.name.startsWith('.')).length;

  return (
    <>
      {everShown && !visible ? (
        <button type="button" onClick={() => onVisible(true)} aria-label="显示远程工作台"
          className="fixed bottom-3 left-3 z-[70] inline-flex max-w-[min(440px,calc(100vw-24px))] items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-2.5 pr-3.5 text-[12px] text-ink shadow-[var(--shadow-pop)] hover:border-line-strong">
          <HardDrive className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="shrink-0 font-semibold">{profile?.name || '远程'}</span>
          {path ? <span className="truncate font-mono text-ink-3" title={path}>{middleEllipsis(path, 40)}</span> : null}
        </button>
      ) : null}
      <section
        role="dialog"
        aria-label="远程工作台"
        aria-hidden={!visible}
        style={style}
        onKeyDown={onKey}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className={`@container fixed z-[85] flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[var(--shadow-window)] ${visible ? 'flex' : 'hidden'}`}
      >
        <header onPointerDown={begin('move')} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button')) setFrame((value) => ({ ...value, max: !value.max })); }}
          className={`flex h-10 shrink-0 select-none items-center gap-2 border-b border-line bg-raised pl-3 pr-1.5 ${frame.max ? '' : 'cursor-grab active:cursor-grabbing'}`}>
          <HardDrive className="h-4 w-4 shrink-0 text-accent" />
          <h2 className="shrink-0 text-[13px] font-semibold">远程</h2>
          {profile ? (
            <span className="min-w-0 truncate text-[12px] text-ink-3" title={`${profile.name} · ${profile.host || ''}`}>
              {profile.name}{profile.host && profile.host !== profile.name ? ` · ${profile.host}` : ''}{profile.protocol === RemoteProtocolKind.Smb ? ' · SMB' : ''}
            </span>
          ) : null}
          <span className="flex-1" />
          <button type="button" className="lv-btn lv-btn-ghost h-7 px-2" onClick={() => onManage(profile?.id)}><Settings2 className="h-3.5 w-3.5" /><span className="hidden @[560px]:inline">管理服务器</span></button>
          <button type="button" className="lv-icon-btn" onClick={hide} aria-label="最小化" title="最小化到左下角"><Minus className="h-4 w-4" /></button>
          <button type="button" className="lv-icon-btn" onClick={() => setFrame((value) => ({ ...value, max: !value.max }))} aria-label={frame.max ? '还原' : '最大化'}>
            {frame.max ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className="lv-icon-btn" onClick={hide} aria-label="关闭"><X className="h-4 w-4" /></button>
        </header>

        {usable.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <Server className="h-9 w-9 text-ink-3" />
            <div>
              <p className="text-[14px] font-semibold">还没有远程服务器</p>
              <p className="mt-1 text-[12px] text-ink-3">添加一台 SFTP/SSH 或 SMB 服务器，就能在这里浏览目录、执行命令、直接打开日志。</p>
            </div>
            <button type="button" className="lv-btn lv-btn-primary" onClick={() => onManage(null)}><Plus className="h-3.5 w-3.5" />添加服务器</button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-52 shrink-0 flex-col overflow-hidden border-r border-line bg-raised @[720px]:flex">
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                <div className="mb-1 flex items-center justify-between px-1.5">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">服务器</span>
                  <button type="button" className="lv-icon-btn h-5 w-5" onClick={() => onManage(null)} aria-label="添加服务器" title="添加服务器"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                {usable.length > 6 ? <input value={serverQuery} onChange={(event) => setServerQuery(event.target.value)} placeholder="搜索服务器" aria-label="搜索服务器" className="lv-input mb-1 h-7" /> : null}
                {servers.map((item) => (
                  <button key={item.id} type="button" onClick={() => { if (item.id !== profileId) void switchTo(item); }}
                    className={`mb-px flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${item.id === profileId ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-sunken'}`} title={`${item.name}${item.host ? ` · ${item.host}` : ''}`}>
                    <Server className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{item.name}</span>
                    {item.protocol === RemoteProtocolKind.Smb ? <span className="text-[9.5px] font-semibold text-ink-3">SMB</span> : null}
                  </button>
                ))}
                {profile ? (
                  <>
                    <p className="mb-1 mt-3 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">收藏</p>
                    {favorites.length === 0 ? <p className="px-2 text-[11.5px] text-ink-3">点击路径栏旁的 ☆ 收藏当前目录</p> : null}
                    {favorites.map((item) => (
                      <button key={item} type="button" onClick={() => go(item)} title={item}
                        className={`mb-px flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-[11.5px] ${item === path ? 'bg-sunken text-ink' : 'text-ink-2 hover:bg-sunken'}`}>
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />
                        <span className="min-w-0 truncate">{middleEllipsis(item, 26)}</span>
                      </button>
                    ))}
                    {recent.length > 0 ? <p className="mb-1 mt-3 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">最近</p> : null}
                    {recent.map((item) => (
                      <button key={item} type="button" onClick={() => go(item)} title={item} className="mb-px flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-[11.5px] text-ink-2 hover:bg-sunken">
                        <Clock3 className="h-3 w-3 shrink-0 text-ink-3" />
                        <span className="min-w-0 truncate">{middleEllipsis(item, 26)}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            </aside>

            <div className="relative flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
                <select aria-label="选择服务器" className="lv-input h-[30px] w-32 shrink-0 @[720px]:hidden" value={profileId} onChange={(event) => { const next = usable.find((item) => item.id === event.target.value); if (next) void switchTo(next); }}>
                  {usable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <button type="button" className="lv-icon-btn" onClick={goBack} disabled={back.length === 0} aria-label="后退" title="后退 (Alt+←)"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" className="lv-icon-btn hidden @[560px]:inline-flex" onClick={goForward} disabled={forward.length === 0} aria-label="前进" title="前进 (Alt+→)"><ArrowRight className="h-4 w-4" /></button>
                <button type="button" className="lv-icon-btn" onClick={() => up && go(up)} disabled={!up} aria-label="上级目录" title="上级目录 (Alt+↑ / Backspace)"><ArrowUp className="h-4 w-4" /></button>
                <RemotePathBar path={path || '/'} disabled={!profile} onGo={submitPath} />
                <button type="button" className="lv-icon-btn" onClick={() => void toggleStar()} disabled={!profile} aria-pressed={starred} aria-label={starred ? '取消收藏' : '收藏当前目录'} title={starred ? '取消收藏' : '收藏当前目录'}>
                  <Star className={`h-4 w-4 ${starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                </button>
                <button type="button" className="lv-icon-btn" onClick={() => setReload((value) => value + 1)} disabled={!profile || loading} aria-label="刷新" title="刷新">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
                <div className="relative min-w-0 flex-1 @[560px]:max-w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ink-3" />
                  <input ref={filterRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }} placeholder="过滤当前目录（Ctrl+F）" aria-label="过滤当前目录" className="lv-input h-7 pl-7" />
                </div>
                <button type="button" className="lv-btn lv-btn-ghost h-7 px-2 text-[11.5px]" aria-pressed={hidden} onClick={() => setHidden((value) => !value)} title="显示以 . 开头的隐藏文件">
                  {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}<span className="hidden @[560px]:inline">隐藏文件{hiddenCount ? ` ${hiddenCount}` : ''}</span>
                </button>
                <span className="flex-1" />
                {notice ? <span className="min-w-0 truncate text-[11.5px] text-ink-2" role="status" title={notice}>{notice}</span> : null}
              </div>

              <RemoteFileList
                path={path}
                entries={entries}
                loading={loading}
                error={error}
                query={query}
                hidden={hidden}
                busy={busy}
                shell={shell}
                onActivate={activate}
                onAction={act}
                onUp={() => up && go(up)}
                onRetry={() => setReload((value) => value + 1)}
              />

              {frame.showConsole ? (
                <div className="flex shrink-0 flex-col border-t border-line" style={{ height: frame.console }}>
                  <div onPointerDown={begin('console')} className="h-1.5 shrink-0 cursor-row-resize bg-raised hover:bg-accent/30" aria-hidden="true" />
                  <div className="min-h-0 flex-1">
                    <RemoteConsole
                      ref={consoleRef}
                      profileId={profileId}
                      cwd={path || '/'}
                      entries={entries}
                      enabled={Boolean(profile) && shell}
                      onCwd={(next) => go(next)}
                      onDone={() => setReload((value) => value + 1)}
                    />
                  </div>
                </div>
              ) : null}

              <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-raised px-3 text-[11px] text-ink-3">
                <span>{entries.length} 项{hiddenCount && !hidden ? `（${hiddenCount} 个隐藏）` : ''}</span>
                <span className="min-w-0 flex-1 truncate font-mono" title={path}>{baseName(path || '/')}</span>
                <button type="button" onClick={() => setFrame((value) => ({ ...value, showConsole: !value.showConsole }))} aria-pressed={frame.showConsole}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${frame.showConsole ? 'text-accent' : 'hover:text-ink'}`} title="终端 (Ctrl+`)">
                  <TerminalSquare className="h-3.5 w-3.5" />终端
                </button>
              </footer>

              {sheet && profile ? (
                <RemoteOpenSheet
                  path={sheet.path}
                  size={sheet.size}
                  modifyTime={sheet.modifyTime}
                  preferTail={sheet.tail}
                  onCancel={() => setSheet(null)}
                  onConfirm={(options) => { setSheet(null); onOpen(profile.id, sheet.path, options); }}
                />
              ) : null}
            </div>
          </div>
        )}
        {!frame.max ? <span aria-hidden="true" onPointerDown={begin('size')} className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" /> : null}
      </section>
    </>
  );
};
