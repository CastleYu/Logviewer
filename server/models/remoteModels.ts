export type RemoteProtocol = 'sftp' | 'smb';
export type RemoteAuth = 'password' | 'key';

export interface RemoteServerRecord {
  id: string;
  protocol: RemoteProtocol;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  auth?: RemoteAuth;
  keyPath?: string;
  paths: string[];
  domain?: string;
  share?: string;
  fingerprint?: string;
  maxBytes?: number;
}

export interface RemoteRegistryFile {
  version: 1;
  servers: RemoteServerRecord[];
}

export interface RemoteServerInput {
  protocol?: RemoteProtocol;
  name: string;
  host: string;
  port?: number;
  user: string;
  password: string;
  auth?: RemoteAuth;
  keyPath?: string;
  paths: string[];
  domain?: string;
  share?: string;
  fingerprint?: string;
  maxBytes?: number;
}
