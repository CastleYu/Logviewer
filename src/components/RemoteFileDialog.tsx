import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, FolderOpen, Server, Settings2, X } from 'lucide-react';
import { SftpProfileView } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';
import { RemoteServerEditor } from './RemoteServerEditor';

interface RemoteFileDialogProps {
  open: boolean;
  profiles: SftpProfileView[];
  busy: boolean;
  theme: ThemeMode;
  onClose: () => void;
  onSubmit: (profileId: string, remotePath: string) => void;
  onServersChanged?: () => void;
  onBrowseWindow?: (profileId: string, path: string) => void;
}

function allowedPaths(profile?: SftpProfileView): string[] {
  if (!profile) return ['/'];
  const paths = (profile.roots && profile.roots.length > 0 ? profile.roots : [profile.root || '/']).filter(Boolean);
  return paths.length > 0 ? paths : ['/'];
}

export const RemoteFileDialog: React.FC<RemoteFileDialogProps> = ({ open, profiles, busy, theme, onClose, onSubmit, onServersChanged, onBrowseWindow }) => {
  const [profileId, setProfileId] = useState('');
  const [remotePath, setRemotePath] = useState('');
  const [mode, setMode] = useState<'open' | 'register'>('open');
  const inputRef = useRef<HTMLInputElement>(null);
  const light = theme === 'light';
  const profile = profiles.find((item) => item.id === profileId) || profiles[0];
  const paths = allowedPaths(profile);
  const openTitle = profile?.protocol === 'smb' ? '打开 SMB 远程文件' : '打开 SFTP 远程文件';

  useEffect(() => {
    if (profileId && profiles.some((item) => item.id === profileId)) return;
    const ready = profiles.find((item) => item.ready);
    setProfileId((ready || profiles[0])?.id || '');
  }, [profileId, profiles]);

  const openBrowse = (pathValue?: string) => {
    if (!profile?.ready || busy || !onBrowseWindow) return;
    onBrowseWindow(profile.id, pathValue || paths[0] || '/');
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setMode('open');
      return;
    }
    const timer = window.setTimeout(() => { if (mode === 'open') inputRef.current?.focus(); }, 50);
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', close);
    };
  }, [busy, mode, onClose, open]);

  if (!open) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.ready || !remotePath.trim() || busy) return;
    onSubmit(profile.id, remotePath.trim());
  };

  return (
    <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="remote-file-title" className={`w-full overflow-hidden rounded-xl border shadow-2xl ${mode === 'register' ? 'max-w-2xl max-h-[min(900px,92vh)] flex flex-col' : 'max-w-lg'} ${light ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`}>
        <div className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${light ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500"><Server className="h-4.5 w-4.5" /></div>
            <div className="min-w-0">
              <h2 id="remote-file-title" className="text-sm font-bold">{mode === 'register' ? '注册远程服务器' : openTitle}</h2>
              <p className={`mt-0.5 text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>{mode === 'register' ? '在页面内创建、测试并保存 SFTP/SMB 服务器，浏览窗口直接使用这些注册项' : '下载完成后使用当前日志格式自动打开'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭" className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><X className="h-4 w-4" /></button>
        </div>
        {mode === 'register' ? (
          <RemoteServerEditor
            theme={theme}
            disabled={busy}
            onBack={() => setMode('open')}
            onChanged={() => onServersChanged?.()}
            onBrowse={(server) => {
              setProfileId(server.id);
              onBrowseWindow?.(server.id, server.paths[0] || '/');
              onClose();
            }}
          />
        ) : (
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="block">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
              <span>服务器</span>
              <button type="button" onClick={() => setMode('register')} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline disabled:opacity-40">
                <Settings2 className="h-3.5 w-3.5" />
                注册服务器
              </button>
            </div>
            <select value={profile?.id || ''} onChange={(event) => setProfileId(event.target.value)} disabled={busy} className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-indigo-500 ${light ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`}>
              {profiles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.protocol === 'smb' ? ' [SMB]' : ''}{item.ready ? '' : '（未配置）'}</option>)}
            </select>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">远程文件绝对路径</span>
            <input ref={inputRef} value={remotePath} onChange={(event) => setRemotePath(event.target.value)} disabled={busy} placeholder={`${profile?.root || '/'}application.log`} className={`h-10 w-full rounded-lg border px-3 font-mono text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 ${light ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`} />
            {paths.length <= 1 ? (
              <span className={`mt-1.5 flex items-center justify-between gap-2 text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>起始路径：<code className="font-mono">{paths[0] || '/'}</code></span>
                <button type="button" onClick={() => openBrowse(paths[0] || '/')} disabled={busy || !profile?.ready || !onBrowseWindow} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline disabled:opacity-40">
                  <FolderOpen className="h-3.5 w-3.5" />
                  浏览目录
                </button>
              </span>
            ) : (
              <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>收藏路径：</span>
                {paths.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setRemotePath(item.endsWith('/') ? item : `${item}/`);
                      openBrowse(item);
                    }}
                    disabled={busy}
                    className={`rounded-md border px-1.5 py-0.5 font-mono ${
                      light ? 'border-slate-300 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-indigo-900' : 'border-slate-700 bg-slate-950 hover:bg-indigo-950/50 hover:border-indigo-700 text-indigo-100'
                    }`}
                  >
                    {item}
                  </button>
                ))}
                <button type="button" onClick={() => openBrowse()} disabled={busy || !profile?.ready || !onBrowseWindow} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline disabled:opacity-40">
                  <FolderOpen className="h-3.5 w-3.5" />
                  浏览目录
                </button>
              </div>
            )}
          </label>
          {!profile?.ready ? (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${light ? 'bg-amber-50 text-amber-900' : 'bg-amber-950/50 text-amber-200'}`}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{profiles.some((item) => item.ready) ? '当前服务器尚未就绪，请改选已注册服务器。' : '尚未注册可用的远程服务器。请先在「注册服务器」中配置 SFTP，浏览窗口将使用这些保存的服务器，无需环境变量。'}</span>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className={`rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>取消</button>
            <button type="submit" disabled={!profile?.ready || !remotePath.trim() || busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">下载并打开</button>
          </div>
        </form>
        )}
      </section>
    </div>
  );
};
