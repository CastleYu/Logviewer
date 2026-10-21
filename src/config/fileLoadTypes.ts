export enum LoadPhase {
  Idle = 'idle',
  Reading = 'reading',
  Downloading = 'downloading',
  Parsing = 'parsing',
  Error = 'error',
}

export enum LoadSourceKind {
  Local = 'local',
  Remote = 'remote',
  Sample = 'sample',
  Reparse = 'reparse',
}

export enum DownloadStatus {
  Queued = 'queued',
  Downloading = 'downloading',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface FileLoadState {
  id: number;
  phase: LoadPhase;
  source: LoadSourceKind;
  fileName: string;
  loadedBytes: number;
  totalBytes: number;
  taskId?: string;
  message?: string;
  remoteKind?: 'sftp' | 'smb';
  tailBytes?: number;
}

export interface SftpProfileView {
  id: string;
  name: string;
  root: string;
  ready: boolean;
  host?: string;
  roots?: string[];
  source?: 'env' | 'registry';
  protocol?: 'sftp' | 'smb';
}

export interface RemoteServerRecord {
  id: string;
  protocol: 'sftp' | 'smb';
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  auth?: 'password' | 'key';
  keyPath?: string;
  paths: string[];
  domain?: string;
  share?: string;
}

export interface RemoteServerDraft {
  protocol: 'sftp' | 'smb';
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  auth?: 'password' | 'key';
  keyPath?: string;
  paths: string[];
  domain?: string;
  share?: string;
}

export interface ProbePathResult {
  path: string;
  ok: boolean;
  message: string;
}

export interface ProbeResult {
  ok: boolean;
  message: string;
  paths: ProbePathResult[];
  home?: string;
  latencyMs?: number;
}

export interface DownloadTaskView {
  id: string;
  status: DownloadStatus;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  remoteSize?: number;
  skippedBytes?: number;
  gzip?: boolean;
}

export class LoadState {
  static idle(): FileLoadState {
    return { id: 0, phase: LoadPhase.Idle, source: LoadSourceKind.Local, fileName: '', loadedBytes: 0, totalBytes: 0 };
  }

  static busy(state: FileLoadState): boolean {
    return state.phase === LoadPhase.Reading || state.phase === LoadPhase.Downloading || state.phase === LoadPhase.Parsing;
  }
}

export interface RemoteDirEntry {
  name: string;
  type: 'file' | 'dir' | 'link';
  size: number;
  modifyTime?: number;
  target?: 'file' | 'dir';
}

export interface RemoteDirList {
  path: string;
  entries: RemoteDirEntry[];
}

export class RemoteApiPath {
  static readonly Profiles = '/api/sftp/profiles';
  static readonly Servers = '/api/sftp/servers';
  static readonly ServerProbe = '/api/sftp/servers/probe';
  static readonly List = '/api/sftp/list';
  static readonly Exec = '/api/sftp/exec';
  static readonly Stat = '/api/sftp/stat';
  static readonly Downloads = '/api/sftp/downloads';
  static readonly ExecStream = '/api/sftp/exec/stream';
  static readonly Home = '/api/sftp/home';

  static paths(id: string): string {
    return `${this.server(id)}/paths`;
  }

  static task(id: string): string {
    return `${this.Downloads}/${encodeURIComponent(id)}`;
  }

  static content(id: string): string {
    return `${this.task(id)}/content`;
  }

  static server(id: string): string {
    return `${this.Servers}/${encodeURIComponent(id)}`;
  }

  static list(profileId: string, remotePath: string): string {
    const params = new URLSearchParams({ profileId, path: remotePath });
    return `${this.List}?${params.toString()}`;
  }
}

export interface RemoteExecResult {
  ok: boolean;
  code: number | null;
  text: string;
  cwd: string | null;
}

export interface RemoteStatResult {
  type: 'dir' | 'file';
  size: number;
  modifyTime?: number;
}

export enum ExecEventKind {
  Out = 'out',
  Err = 'err',
  End = 'end',
  Fail = 'fail',
}

export type ExecEvent =
  | { type: ExecEventKind.Out | ExecEventKind.Err; text: string }
  | { type: ExecEventKind.End; code: number | null; cwd: string | null; truncated: boolean }
  | { type: ExecEventKind.Fail; message: string };

export interface RemoteOpenOptions {
  tailBytes?: number;
  save?: boolean;
}

export enum RemoteProtocolKind {
  Sftp = 'sftp',
  Smb = 'smb',
}

export enum RemoteSortKey {
  Name = 'name',
  Size = 'size',
  Time = 'time',
}

export class RemoteUi {
  static readonly MB = 1024 * 1024;
  /** 超过该体积时先确认打开方式，默认只看末尾。 */
  static readonly LargeFileBytes = 32 * 1024 * 1024;
  static readonly DefaultTailBytes = 8 * 1024 * 1024;
  static readonly TailChoices = [1, 8, 32, 128];
  static readonly RenderCap = 500;
  static readonly RecentLimit = 10;
  static readonly HistoryLimit = 50;
  static readonly ConsoleBlocks = 40;
  static readonly BinaryProbeBytes = 65536;
  static readonly EnvProfileId = 'default';
}

export class RemoteStoreKey {
  static readonly Prefs = 'LOGVIEWER_REMOTE_PREFS';
  static readonly Window = 'LOGVIEWER_REMOTE_WINDOW';
  static readonly History = 'LOGVIEWER_REMOTE_CMD_HISTORY';
}

export enum EntryAction {
  Open = 'open',
  Tail = 'tail',
  Save = 'save',
  Insert = 'insert',
  Copy = 'copy',
  Grep = 'grep',
}
