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
}

export interface SftpProfileView {
  id: string;
  name: string;
  root: string;
  ready: boolean;
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

export class RemoteApiPath {
  static readonly Profiles = '/api/sftp/profiles';
  static readonly Downloads = '/api/sftp/downloads';

  static task(id: string): string {
    return `${this.Downloads}/${encodeURIComponent(id)}`;
  }

  static content(id: string): string {
    return `${this.task(id)}/content`;
  }
}
