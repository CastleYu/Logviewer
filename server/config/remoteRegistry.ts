import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApiErrorCode, ServerValue } from './constants';
import type { PublicSftpProfile, SftpProfile } from '../models/sftpModels';
import type { RemoteProtocol, RemoteRegistryFile, RemoteServerInput, RemoteServerRecord } from '../models/remoteModels';
import { RemotePath } from '../services/remotePath';
import { ServiceError } from '../services/serviceError';

export class RemoteRegistry {
  private servers: RemoteServerRecord[] = [];

  constructor(private readonly filePath: string) {
    this.load();
  }

  list(): RemoteServerRecord[] {
    return this.servers.map((server) => ({ ...server, paths: [...server.paths] }));
  }

  get(id: string): RemoteServerRecord | null {
    return this.servers.find((server) => server.id === id) || null;
  }

  toProfile(id: string): SftpProfile | null {
    const record = this.get(id);
    if (!record) return null;
    return this.asProfile(record);
  }

  publicViews(): PublicSftpProfile[] {
    return this.servers.map((server) => ({
      id: server.id,
      name: server.name,
      root: server.paths[0] || ServerValue.DefaultRoot,
      ready: true,
      roots: [...server.paths],
      source: 'registry' as const,
      protocol: server.protocol,
    }));
  }

  preview(input: RemoteServerInput): RemoteServerRecord {
    return this.normalize(input, 'preview');
  }

  create(input: RemoteServerInput): RemoteServerRecord {
    const record = this.normalize(input, crypto.randomUUID());
    this.servers.push(record);
    this.persist();
    return { ...record, paths: [...record.paths] };
  }

  update(id: string, input: RemoteServerInput): RemoteServerRecord {
    if (id === ServerValue.ProfileId) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, '环境变量中的默认服务器不可修改', 400);
    }
    const index = this.servers.findIndex((server) => server.id === id);
    if (index === -1) throw new ServiceError(ApiErrorCode.ServerNotFound, '未找到该注册服务器', 404);
    const record = this.normalize(input, id);
    this.servers[index] = record;
    this.persist();
    return { ...record, paths: [...record.paths] };
  }

  delete(id: string): void {
    if (id === ServerValue.ProfileId) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, '环境变量中的默认服务器不可删除', 400);
    }
    const next = this.servers.filter((server) => server.id !== id);
    if (next.length === this.servers.length) {
      throw new ServiceError(ApiErrorCode.ServerNotFound, '未找到该注册服务器', 404);
    }
    this.servers = next;
    this.persist();
  }

  private asProfile(record: RemoteServerRecord): SftpProfile {
    return {
      id: record.id,
      name: record.name,
      host: record.host,
      port: record.port,
      user: record.user,
      password: record.password,
      root: record.paths[0] || ServerValue.DefaultRoot,
      roots: [...record.paths],
      fingerprint: record.fingerprint,
      maxBytes: record.maxBytes && record.maxBytes > 0 ? record.maxBytes : ServerValue.DefaultMaxBytes,
      protocol: record.protocol,
      domain: record.domain,
      share: record.share,
    };
  }

  private normalize(input: RemoteServerInput, id: string): RemoteServerRecord {
    const name = this.text(input.name, '名称');
    const host = this.text(input.host, '主机');
    const user = this.text(input.user, '用户名');
    const password = typeof input.password === 'string' ? input.password : '';
    if (!password.trim()) throw new ServiceError(ApiErrorCode.InvalidRequest, '请填写密码', 400);
    const protocol = this.protocol(input.protocol);
    const port = this.port(input.port, protocol);
    const paths = this.paths(input.paths);
    const share = typeof input.share === 'string' ? input.share.trim() : '';
    const domain = typeof input.domain === 'string' ? input.domain.trim() : '';
    if (protocol === 'smb' && !share) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, 'SMB 服务器需要填写共享名', 400);
    }
    return {
      id,
      protocol,
      name,
      host,
      port,
      user,
      password,
      paths,
      domain: domain || undefined,
      share: share || undefined,
      fingerprint: typeof input.fingerprint === 'string' && input.fingerprint.trim() ? input.fingerprint.trim() : undefined,
      maxBytes: typeof input.maxBytes === 'number' && input.maxBytes > 0 ? input.maxBytes : undefined,
    };
  }

  private protocol(value: unknown): RemoteProtocol {
    if (value === undefined || value === 'sftp') return 'sftp';
    if (value === 'smb') return 'smb';
    throw new ServiceError(ApiErrorCode.InvalidRequest, '协议仅支持 sftp 或 smb', 400);
  }

  private port(value: unknown, protocol: RemoteProtocol): number {
    if (value === undefined || value === null || value === '') {
      return protocol === 'smb' ? ServerValue.DefaultSmbPort : ServerValue.DefaultPort;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, '端口必须是 1–65535 的整数', 400);
    }
    return parsed;
  }

  private paths(value: unknown): string[] {
    if (!Array.isArray(value)) throw new ServiceError(ApiErrorCode.InvalidRequest, '请至少填写一个日志路径', 400);
    const unique: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const normalized = RemotePath.parse(item);
      if (!unique.includes(normalized)) unique.push(normalized);
    }
    if (unique.length === 0) throw new ServiceError(ApiErrorCode.InvalidRequest, '请至少填写一个日志路径', 400);
    return unique;
  }

  private text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ServiceError(ApiErrorCode.InvalidRequest, `请填写${label}`, 400);
    }
    const trimmed = value.trim();
    if (trimmed.length > 120) throw new ServiceError(ApiErrorCode.InvalidRequest, `${label}过长`, 400);
    return trimmed;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      this.servers = [];
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as RemoteRegistryFile;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.servers)) {
        throw new Error('invalid registry');
      }
      this.servers = parsed.servers
        .filter((server) => server && typeof server.id === 'string' && server.id !== ServerValue.ProfileId)
        .map((server) => this.normalize(server, server.id));
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new Error(`无法读取远程服务器注册文件 ${path.basename(this.filePath)}，请检查 JSON 是否完整`);
    }
  }

  private persist(): void {
    const payload: RemoteRegistryFile = { version: 1, servers: this.servers };
    fs.writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
}
