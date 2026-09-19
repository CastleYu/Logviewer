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
}

export interface DownloadTaskView {
  id: string;
  status: DownloadStatus;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
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
