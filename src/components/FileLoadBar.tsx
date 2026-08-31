import React from 'react';
import { AlertTriangle, LoaderCircle, Server, X } from 'lucide-react';
import { FileLoadState, LoadPhase, LoadSourceKind, LoadState } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';
import { formatFileSize } from '../utils/logParser';

interface FileLoadBarProps {
  state: FileLoadState;
  theme: ThemeMode;
  onCancel: () => void;
  onDismiss: () => void;
}

export const FileLoadBar: React.FC<FileLoadBarProps> = ({ state, theme, onCancel, onDismiss }) => {
  if (state.phase === LoadPhase.Idle) return null;
  const light = theme === 'light';
  const busy = LoadState.busy(state);
  const determinate = state.phase === LoadPhase.Downloading && state.totalBytes > 0;
  const percent = determinate ? Math.min(100, Math.round((state.loadedBytes / state.totalBytes) * 100)) : 0;
  const label = state.phase === LoadPhase.Error
    ? state.message || '文件加载失败'
    : state.phase === LoadPhase.Downloading
      ? '正在从 SFTP 下载'
      : state.phase === LoadPhase.Parsing
        ? '正在解析日志'
        : '正在读取文件';

  return (
    <section
      aria-live="polite"
      className={`shrink-0 border-b px-3 py-2 ${
        state.phase === LoadPhase.Error
          ? light ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-950/70 border-rose-900 text-rose-100'
          : light ? 'bg-indigo-50 border-indigo-200 text-indigo-950' : 'bg-slate-900 border-indigo-950 text-indigo-50'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${state.phase === LoadPhase.Error ? 'bg-rose-500/15 text-rose-500' : 'bg-indigo-500/15 text-indigo-500'}`}>
          {state.phase === LoadPhase.Error ? <AlertTriangle className="w-4 h-4" /> : state.source === LoadSourceKind.Remote ? <Server className="w-4 h-4" /> : <LoaderCircle className="w-4 h-4 animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <div className="min-w-0 flex items-center gap-2">
              <strong className="truncate font-semibold" title={state.fileName}>{state.fileName || '远程文件'}</strong>
              <span className={`shrink-0 ${state.phase === LoadPhase.Error ? 'text-rose-600 dark:text-rose-300' : 'text-indigo-700 dark:text-indigo-300'}`}>{label}</span>
            </div>
            {determinate ? <span className="shrink-0 font-mono tabular-nums text-indigo-600 dark:text-indigo-300">{formatFileSize(state.loadedBytes)} / {formatFileSize(state.totalBytes)} · {percent}%</span> : null}
          </div>
          {busy ? (
            <div className={`mt-1.5 h-1 overflow-hidden rounded-full ${light ? 'bg-indigo-200/70' : 'bg-slate-800'}`}>
              <div
                className={`h-full rounded-full bg-indigo-500 transition-[width] duration-200 ${determinate ? '' : 'w-1/3 animate-load-slide'}`}
                style={determinate ? { width: `${percent}%` } : undefined}
              />
            </div>
          ) : null}
        </div>
        {state.phase === LoadPhase.Downloading ? (
          <button type="button" onClick={onCancel} className={`shrink-0 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${light ? 'border-slate-300 bg-white hover:bg-slate-100' : 'border-slate-700 bg-slate-950 hover:bg-slate-800'}`}>取消</button>
        ) : null}
        {state.phase === LoadPhase.Error ? (
          <button type="button" onClick={onDismiss} aria-label="关闭错误提示" className="shrink-0 p-1 rounded-md hover:bg-rose-500/10"><X className="w-4 h-4" /></button>
        ) : null}
      </div>
    </section>
  );
};
