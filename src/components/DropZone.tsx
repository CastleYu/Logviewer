import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, FileText, FlaskConical, FolderOpen, HardDrive, History, Server, Upload } from 'lucide-react';
import { HistoryApi } from '../services/historyApi';
import { HistoryKind, type HistoryLog } from '../config/historyTypes';
import { SftpProfileView } from '../config/fileLoadTypes';
import { formatFileSize } from '../utils/logParser';

interface DropZoneProps {
  isLoading: boolean;
  servers: SftpProfileView[];
  onFileSelected: (file: File) => void;
  onOpenLocal: () => void;
  onOpenRemote: (profileId?: string) => void;
  onLoadSample: (count: number) => void;
  onOpenHistory: (log: HistoryLog) => void;
  onShowHistory?: () => void;
}

const recentLimit = 6;

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return date.toLocaleDateString();
}

/** 首页：拖入或选择文件为主操作；右侧给出最近日志与远程服务器，回访时一步直达。 */
export const DropZone: React.FC<DropZoneProps> = ({ isLoading, servers, onFileSelected, onOpenLocal, onOpenRemote, onLoadSample, onOpenHistory }) => {
  const [over, setOver] = useState(false);
  const [recent, setRecent] = useState<HistoryLog[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = servers.filter((item) => item.ready);

  useEffect(() => {
    let active = true;
    HistoryApi.list()
      .then((list) => { if (active) setRecent([...list].sort((a, b) => b.created.localeCompare(a.created)).slice(0, recentLimit)); })
      .catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, []);

  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !isLoading) onFileSelected(file);
  };

  const kindIcon = (kind: HistoryKind) => (kind === HistoryKind.Remote ? <HardDrive className="h-3.5 w-3.5" /> : kind === HistoryKind.Sample ? <FlaskConical className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />);

  return (
    <main className="flex min-h-0 flex-1 overflow-auto bg-canvas">
      <div className="m-auto grid w-full max-w-[1080px] gap-5 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section
          onDragOver={(event) => { event.preventDefault(); if (!isLoading) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`flex flex-col justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:px-10 ${over ? 'border-accent bg-accent-soft' : 'border-line-strong/70 bg-surface'}`}
        >
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Upload className="h-5 w-5" /></span>
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">打开一份日志</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-3">
            把 .log / .txt / .json 文件拖到这里，或从本机、远程服务器打开。解析后可按级别、时间、字段筛选，定位源码并交给 AI 分析。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" disabled={isLoading} onClick={() => inputRef.current?.click()} className="lv-btn lv-btn-primary h-9 px-4 text-[13px]"><Upload className="h-4 w-4" />选择文件</button>
            <button type="button" disabled={isLoading} onClick={() => onOpenRemote()} className="lv-btn h-9 px-4 text-[13px]"><HardDrive className="h-4 w-4 text-accent" />远程服务器</button>
            <button type="button" disabled={isLoading} onClick={onOpenLocal} className="lv-btn lv-btn-ghost h-9 px-3 text-[13px]"><FolderOpen className="h-4 w-4" />按路径打开</button>
          </div>
          <p className="mt-6 text-[12px] text-ink-3">
            第一次用？
            <button type="button" disabled={isLoading} onClick={() => onLoadSample(10000)} className="ml-1 font-semibold text-accent hover:underline">载入 10,000 行示例日志</button>
          </p>
          <input ref={inputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFileSelected(file); event.target.value = ''; }} />
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-[12.5px] font-semibold text-ink"><History className="h-4 w-4 text-ink-3" />最近打开</h2>
            {recent === null ? (
              <div className="space-y-2 p-4">{[0, 1, 2].map((item) => <div key={item} className="h-8 animate-pulse rounded bg-sunken" />)}</div>
            ) : recent.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-ink-3">打开过的日志会保存快照出现在这里，即使原文件已变化或远程不可达也能重新查看。</p>
            ) : (
              <ul className="p-1.5">
                {recent.map((log) => (
                  <li key={log.id}>
                    <button type="button" disabled={isLoading} onClick={() => onOpenHistory(log)} className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-raised" title={log.origin}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-3 group-hover:text-accent">{kindIcon(log.kind)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">{log.name}</span>
                        <span className="block truncate font-mono text-[10.5px] text-ink-3">{log.origin}</span>
                      </span>
                      <span className="shrink-0 text-right text-[10.5px] text-ink-3">
                        <span className="block">{when(log.created)}</span>
                        <span className="block font-mono">{formatFileSize(log.size)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-[12.5px] font-semibold text-ink"><Server className="h-4 w-4 text-ink-3" />远程服务器</h2>
            {ready.length === 0 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <p className="text-[12px] text-ink-3">添加 SFTP/SSH 或 SMB 服务器，直接浏览并打开上面的日志。</p>
                <button type="button" onClick={() => onOpenRemote()} className="lv-btn shrink-0">添加</button>
              </div>
            ) : (
              <ul className="p-1.5">
                {ready.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onOpenRemote(item.id)} className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-raised">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-3 group-hover:text-accent"><HardDrive className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">{item.name}</span>
                        <span className="block truncate font-mono text-[10.5px] text-ink-3">{item.host}{item.protocol === 'smb' ? ' · SMB' : ''}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
