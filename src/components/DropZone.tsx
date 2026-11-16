import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, FileText, HardDrive, History, Plus, Search, Server, Upload, X } from 'lucide-react';
import { HistoryApi } from '../services/historyApi';
import { RemoteFileApi } from '../services/remoteFileApi';
import { HistoryKind, type HistoryLog } from '../config/historyTypes';
import { RemoteProtocolKind, RemoteServerRecord, SftpProfileView } from '../config/fileLoadTypes';
import { HomeConst } from '../config/uiConstants';
import { formatFileSize } from '../utils/logParser';
import { Tooltip } from './Tooltip';

interface DropZoneProps {
  isLoading: boolean;
  servers: SftpProfileView[];
  remoteRevision?: number;
  onFileSelected: (file: File) => void;
  onOpenRemote: (profileId?: string) => void;
  onManageRemote: () => void;
  onOpenHistory: (log: HistoryLog) => void;
  onShowHistory?: () => void;
}

interface RemoteDisplayItem {
  id: string;
  name: string;
  protocol: string;
  endpoint: string;
  searchBlob: string;
  ready: boolean;
}

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

function hasFileDrag(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes(HomeConst.DragFilesType);
}

function toDisplayServer(record: RemoteServerRecord): RemoteDisplayItem {
  const isSmb = record.protocol === RemoteProtocolKind.Smb;
  const hostPort = isSmb ? record.host : `${record.host}:${record.port || 22}`;
  const endpoint = record.user ? `${record.user}@${hostPort}` : hostPort;
  const protoLabel = isSmb ? 'SMB' : 'SFTP';
  return {
    id: record.id,
    name: record.name || record.host,
    protocol: protoLabel,
    endpoint,
    searchBlob: `${record.name} ${record.host} ${record.user} ${record.port} ${protoLabel} ${record.paths.join(' ')}`.toLowerCase(),
    ready: true,
  };
}

/**
 * 首页（M3）：三列等高布局（拖放与主入口 / 最近打开 / 远程服务器），仅对真实文件拖拽亮框。
 */
export const DropZone: React.FC<DropZoneProps> = ({
  isLoading,
  servers,
  remoteRevision = 0,
  onFileSelected,
  onOpenRemote,
  onManageRemote,
  onOpenHistory,
  onShowHistory,
}) => {
  const [over, setOver] = useState(false);
  const [recent, setRecent] = useState<HistoryLog[] | null>(null);
  const [records, setRecords] = useState<RemoteServerRecord[] | null>(null);
  const [serverQuery, setServerQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    HistoryApi.list()
      .then((list) => {
        if (!active) return;
        const filtered = list
          .filter((item) => item.kind !== HistoryKind.Sample)
          .sort((a, b) => b.created.localeCompare(a.created));
        setRecent(filtered);
      })
      .catch(() => {
        if (active) setRecent([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    RemoteFileApi.servers()
      .then((list) => {
        if (active) setRecords(list);
      })
      .catch(() => {
        if (active) setRecords([]);
      });
    return () => {
      active = false;
    };
  }, [remoteRevision, servers]);

  const remoteItems = useMemo<RemoteDisplayItem[]>(() => {
    const items = (records || []).map(toDisplayServer);
    const seen = new Set(items.map((item) => item.id));
    for (const profile of servers) {
      if (profile.ready && !seen.has(profile.id)) {
        const protoLabel = profile.protocol === RemoteProtocolKind.Smb ? 'SMB' : 'SFTP';
        items.push({
          id: profile.id,
          name: profile.name,
          protocol: protoLabel,
          endpoint: profile.host || profile.root || '环境配置',
          searchBlob: `${profile.name} ${profile.host || ''} ${profile.root || ''} ${protoLabel}`.toLowerCase(),
          ready: profile.ready,
        });
      }
    }
    return items;
  }, [records, servers]);

  const filteredRemotes = useMemo(() => {
    const q = serverQuery.trim().toLowerCase();
    if (!q) return remoteItems;
    return remoteItems.filter((item) => item.searchBlob.includes(q));
  }, [remoteItems, serverQuery]);

  const dragOver = (event: React.DragEvent) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    if (!isLoading) setOver(true);
  };

  const drop = (event: React.DragEvent) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      setOver(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    if (!isLoading) onFileSelected(files[0]);
  };

  const kindIcon = (kind: HistoryKind) =>
    kind === HistoryKind.Remote ? <HardDrive className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />;

  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto bg-canvas">
      <div className="m-auto grid w-full max-w-[1160px] grid-cols-1 gap-4 px-4 py-8 sm:px-6 lg:h-[500px] lg:grid-cols-3 lg:py-6">
        {/* 左列：主拖放区（[远程服务器] + 主 [选择文件]） */}
        <section
          onDragOver={dragOver}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors lg:h-full ${
            over ? 'border-accent bg-accent-soft' : 'border-line-strong/70 bg-surface'
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Upload className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-[20px] font-semibold tracking-tight text-ink">打开或拖入日志</h1>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onOpenRemote()}
              className="lv-btn h-9 px-4 text-[13px]"
            >
              <HardDrive className="h-4 w-4 text-accent" />
              远程服务器
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
              className="lv-btn lv-btn-primary h-9 px-4 text-[13px]"
            >
              <Upload className="h-4 w-4" />
              选择文件
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected(file);
              event.target.value = '';
            }}
          />
        </section>

        {/* 中列：最近打开（过滤示例日志，支持内部滚动） */}
        <section className="flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:h-full">
          <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
            <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <History className="h-4 w-4 text-ink-3" />
              最近打开
            </h2>
            {onShowHistory && recent && recent.length > 0 ? (
              <button type="button" onClick={onShowHistory} className="text-[11px] text-ink-3 hover:text-ink">
                全部 {recent.length} 条
              </button>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {recent === null ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-9 animate-pulse rounded bg-sunken" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex h-full min-h-[160px] items-center justify-center px-4 py-8 text-center text-[12px] text-ink-3">
                还没有打开过日志
              </div>
            ) : (
              <ul className="p-1.5">
                {recent.map((log) => (
                  <li key={log.id}>
                    <Tooltip text={`${log.name} · ${log.origin}`} className="block w-full">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onOpenHistory(log)}
                        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised disabled:opacity-40"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-3 transition-colors group-hover:text-accent">
                          {kindIcon(log.kind)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">{log.name}</span>
                          <span className="block truncate font-mono text-[10.5px] text-ink-3">{log.origin}</span>
                        </span>
                        <span className="shrink-0 text-right text-[10.5px] tabular-nums text-ink-3">
                          <span className="block">{when(log.created)}</span>
                          <span className="block font-mono">{formatFileSize(log.size)}</span>
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 右列：远程服务器（搜索 + 注册 + 全部列表滚动） */}
        <section className="flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:h-full">
          <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
            <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <Server className="h-4 w-4 text-ink-3" />
              远程服务器
              {remoteItems.length > 0 ? (
                <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-3">
                  {remoteItems.length}
                </span>
              ) : null}
            </h2>
            <Tooltip text="注册新的远程服务器">
              <button
                type="button"
                disabled={isLoading}
                onClick={onManageRemote}
                className="lv-btn h-6.5 px-2 text-[11px]"
              >
                <Plus className="h-3.5 w-3.5" />
                注册
              </button>
            </Tooltip>
          </header>

          <div className="shrink-0 border-b border-line/70 px-3 py-2">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-3" />
              <input
                type="text"
                value={serverQuery}
                onChange={(event) => setServerQuery(event.target.value)}
                aria-label="搜索远程服务器"
                placeholder="搜索名称、主机、用户名…"
                className="lv-input h-7.5 w-full pl-8 pr-7 text-xs"
              />
              {serverQuery ? (
                <Tooltip text="清空搜索" className="absolute right-1.5 inline-flex">
                  <button
                    type="button"
                    aria-label="清空服务器搜索"
                    onClick={() => setServerQuery('')}
                    className="flex h-5 w-5 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {records === null ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-9 animate-pulse rounded bg-sunken" />
                ))}
              </div>
            ) : remoteItems.length === 0 ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2.5 px-4 py-8 text-center">
                <p className="text-[12px] text-ink-3">还没有注册远程服务器</p>
                <button type="button" disabled={isLoading} onClick={onManageRemote} className="lv-btn h-7 px-3 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  注册服务器
                </button>
              </div>
            ) : filteredRemotes.length === 0 ? (
              <div className="flex h-full min-h-[140px] items-center justify-center px-4 py-8 text-center text-[12px] text-ink-3">
                没有匹配的服务器
              </div>
            ) : (
              <ul className="p-1.5">
                {filteredRemotes.map((server) => (
                  <li key={server.id}>
                    <Tooltip text={`浏览 ${server.name} (${server.endpoint})`} className="block w-full">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onOpenRemote(server.id)}
                        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised disabled:opacity-40"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">{server.name}</span>
                          <span className="block truncate font-mono text-[10.5px] text-ink-3">{server.endpoint}</span>
                        </span>
                        <span className="shrink-0 rounded border border-line bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
                          {server.protocol}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};
