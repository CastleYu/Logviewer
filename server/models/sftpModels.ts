import type SftpClient from 'ssh2-sftp-client';
import { DownloadStatus } from '../config/constants';

export interface SftpProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  privateKey?: string;
  root: string;
  roots?: string[];
  fingerprint?: string;
  maxBytes: number;
  protocol?: 'sftp' | 'smb';
  domain?: string;
  share?: string;
}

export interface PublicSftpProfile {
  id: string;
  name: string;
  root: string;
  ready: boolean;
  roots?: string[];
  source?: 'env' | 'registry';
  protocol?: 'sftp' | 'smb';
}

export interface DownloadTask {
  id: string;
  profileId: string;
  remotePath: string;
  fileName: string;
  localPath: string;
  partPath: string;
  status: DownloadStatus;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  client?: SftpClient;
  cancelled: boolean;
}

export interface DownloadTaskView {
  id: string;
  status: DownloadStatus;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}
