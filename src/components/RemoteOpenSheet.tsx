import React, { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { RemoteOpenOptions, RemoteUi } from '../config/fileLoadTypes';
import { formatFileSize } from '../utils/logParser';

interface RemoteOpenSheetProps {
  path: string;
  size: number;
  modifyTime?: number;
  preferTail?: boolean;
  onConfirm: (options: RemoteOpenOptions) => void;
  onCancel: () => void;
}

/** 大文件打开前的确认：整个文件 / 只看末尾 N MB / 原样下载到本机。 */
export const RemoteOpenSheet: React.FC<RemoteOpenSheetProps> = ({ path, size, modifyTime, preferTail, onConfirm, onCancel }) => {
  const gzip = path.toLowerCase().endsWith('.gz');
  const [tail, setTail] = useState(!gzip && (Boolean(preferTail) || size > RemoteUi.LargeFileBytes));
  const [mb, setMb] = useState(RemoteUi.DefaultTailBytes / RemoteUi.MB);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const name = path.slice(path.lastIndexOf('/') + 1);
  const choice = (active: boolean) => `flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'}`;

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px]" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section role="dialog" aria-modal="true" aria-label="打开远程文件" className="w-full max-w-md rounded-xl border border-line bg-surface shadow-[var(--shadow-window)]">
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13px] font-semibold text-ink" title={name}>{name}</h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={path}>{path}</p>
            <p className="mt-1 text-[11.5px] text-ink-2">
              {formatFileSize(size)}{gzip ? ' · gzip 压缩，会在服务端解压' : ''}{modifyTime ? ` · 修改于 ${new Date(modifyTime).toLocaleString()}` : ''}
            </p>
          </div>
          <button type="button" className="lv-icon-btn" onClick={onCancel} aria-label="关闭"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-2 px-4 py-3">
          <button type="button" className={choice(!tail)} aria-pressed={!tail} onClick={() => setTail(false)}>
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${!tail ? 'border-accent bg-accent' : 'border-line-strong'}`} />
            <span>
              <span className="block text-[12.5px] font-semibold text-ink">打开整个文件</span>
              <span className="block text-[11.5px] text-ink-3">{size > RemoteUi.LargeFileBytes ? '文件较大，下载和解析会比较慢，也更占浏览器内存' : '完整下载后解析'}</span>
            </span>
          </button>
          <button type="button" disabled={gzip} className={`${choice(tail)} disabled:opacity-45`} aria-pressed={tail} onClick={() => setTail(true)}>
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${tail ? 'border-accent bg-accent' : 'border-line-strong'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-ink">只看末尾（推荐用于大日志）</span>
              <span className="block text-[11.5px] text-ink-3">{gzip ? '压缩文件无法只读末尾' : '只下载文件最后一段，自动丢弃开头不完整的那一行'}</span>
            </span>
          </button>
          {tail ? (
            <div className="flex items-center gap-2 pl-9">
              <span className="text-[11.5px] text-ink-3">读取</span>
              <span className="lv-seg">
                {RemoteUi.TailChoices.map((value) => (
                  <button key={value} type="button" aria-pressed={mb === value} onClick={() => setMb(value)}>{value} MB</button>
                ))}
              </span>
            </div>
          ) : null}
        </div>
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button type="button" className="lv-btn lv-btn-ghost" onClick={() => onConfirm({ save: true })}><Download className="h-3.5 w-3.5" />下载到本机</button>
          <span className="flex-1" />
          <button type="button" className="lv-btn" onClick={onCancel}>取消</button>
          <button type="button" className="lv-btn lv-btn-primary" autoFocus onClick={() => onConfirm(tail ? { tailBytes: mb * RemoteUi.MB } : {})}>打开</button>
        </footer>
      </section>
    </div>
  );
};
