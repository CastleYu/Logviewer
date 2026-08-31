import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Server, X } from 'lucide-react';
import { SftpProfileView } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';

interface RemoteFileDialogProps {
  open: boolean;
  profiles: SftpProfileView[];
  busy: boolean;
  theme: ThemeMode;
  onClose: () => void;
  onSubmit: (profileId: string, remotePath: string) => void;
}

export const RemoteFileDialog: React.FC<RemoteFileDialogProps> = ({ open, profiles, busy, theme, onClose, onSubmit }) => {
  const [profileId, setProfileId] = useState('');
  const [remotePath, setRemotePath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const light = theme === 'light';
  const profile = profiles.find((item) => item.id === profileId) || profiles[0];

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profileId, profiles]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', close);
    };
  }, [busy, onClose, open]);

  if (!open) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.ready || !remotePath.trim() || busy) return;
    onSubmit(profile.id, remotePath.trim());
  };

  return (
    <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="remote-file-title" className={`w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl ${light ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`}>
        <div className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${light ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500"><Server className="h-4.5 w-4.5" /></div>
            <div className="min-w-0">
              <h2 id="remote-file-title" className="text-sm font-bold">打开 SFTP 远程文件</h2>
              <p className={`mt-0.5 text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>下载完成后使用当前日志格式自动打开</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭" className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">服务器</span>
            <select value={profile?.id || ''} onChange={(event) => setProfileId(event.target.value)} disabled={busy} className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-indigo-500 ${light ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`}>
              {profiles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.ready ? '' : '（未配置）'}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">远程文件绝对路径</span>
            <input ref={inputRef} value={remotePath} onChange={(event) => setRemotePath(event.target.value)} disabled={busy} placeholder={`${profile?.root || '/'}application.log`} className={`h-10 w-full rounded-lg border px-3 font-mono text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 ${light ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`} />
            <span className={`mt-1.5 block text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>允许目录：<code className="font-mono">{profile?.root || '/'}</code></span>
          </label>
          {!profile?.ready ? (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${light ? 'bg-amber-50 text-amber-900' : 'bg-amber-950/50 text-amber-200'}`}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>后端尚未读取到 SFTP 连接环境变量，请先完成服务器配置。</span>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className={`rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>取消</button>
            <button type="submit" disabled={!profile?.ready || !remotePath.trim() || busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">下载并打开</button>
          </div>
        </form>
      </section>
    </div>
  );
};
