export enum DownloadStatus {
  Queued = 'queued',
  Downloading = 'downloading',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum ApiErrorCode {
  InvalidRequest = 'INVALID_REQUEST',
  ServerUnavailable = 'SERVER_UNAVAILABLE',
  ServerNotFound = 'SERVER_NOT_FOUND',
  PathDenied = 'PATH_DENIED',
  FileNotFound = 'FILE_NOT_FOUND',
  NotAFile = 'NOT_A_FILE',
  FileTooLarge = 'FILE_TOO_LARGE',
  TaskNotFound = 'TASK_NOT_FOUND',
  TaskNotReady = 'TASK_NOT_READY',
  DownloadFailed = 'DOWNLOAD_FAILED',
}

export class ApiPath {
  static readonly Base = '/api';
  static readonly Profiles = '/api/sftp/profiles';
  static readonly Servers = '/api/sftp/servers';
  static readonly ServerProbe = '/api/sftp/servers/probe';
  static readonly List = '/api/sftp/list';
  static readonly Exec = '/api/sftp/exec';
  static readonly Downloads = '/api/sftp/downloads';
  static readonly Health = '/api/health';
}

export class EnvKey {
  static readonly Host = 'LOGVIEWER_SFTP_HOST';
  static readonly Port = 'LOGVIEWER_SFTP_PORT';
  static readonly User = 'LOGVIEWER_SFTP_USER';
  static readonly Password = 'LOGVIEWER_SFTP_PASSWORD';
  static readonly KeyPath = 'LOGVIEWER_SFTP_PRIVATE_KEY';
  static readonly Root = 'LOGVIEWER_SFTP_ROOT';
  static readonly Fingerprint = 'LOGVIEWER_SFTP_HOST_FINGERPRINT';
  static readonly MaxBytes = 'LOGVIEWER_SFTP_MAX_BYTES';
  static readonly ListenPort = 'LOGVIEWER_PORT';
  static readonly HmrPort = 'LOGVIEWER_HMR_PORT';
  static readonly FallbackHost = 'ABYSS_SERVER_HOST';
  static readonly FallbackPort = 'ABYSS_SERVER_PORT';
  static readonly FallbackUser = 'ABYSS_SERVER_USER';
  static readonly FallbackPassword = 'ABYSS_SERVER_PASSWORD';
}

export class ServerValue {
  static readonly ProfileId = 'default';
  static readonly ProfileName = '默认 SFTP 服务器';
  static readonly DefaultPort = 22;
  static readonly DefaultSmbPort = 445;
  static readonly DefaultListenPort = 3000;
  static readonly DefaultHmrPort = 24678;
  static readonly PortBackoffTries = 20;
  static readonly DefaultRoot = '/';
  static readonly DefaultMaxBytes = 512 * 1024 * 1024;
  static readonly ConnectTimeoutMs = 15_000;
  static readonly ReadyTimeoutMs = 20_000;
  static readonly KeepaliveMs = 10_000;
  static readonly CacheDir = '.logviewer-cache';
  static readonly RegistryFile = '.logviewer-remotes.json';
  static readonly PartSuffix = '.part';
}
