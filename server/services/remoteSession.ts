import crypto from 'node:crypto';
import SftpClient from 'ssh2-sftp-client';
import { Client } from 'ssh2';
import { ServerValue } from '../config/constants';
import type { SftpProfile } from '../models/sftpModels';

export class RemoteSessionValue {
  static readonly IdleMs = 30_000;
  static readonly MaxSessions = 32;
}

function key(profile: SftpProfile): string {
  const auth = `${profile.password || ''}\0${profile.privateKey || ''}`;
  return `${profile.protocol || 'sftp'}\0${profile.host}\0${profile.port}\0${profile.user}\0${profile.fingerprint || ''}\0${crypto.createHash('sha256').update(auth).digest('hex')}`;
}

type SftpEntry = { client: SftpClient; ready: Promise<void>; tail: Promise<unknown>; last: number; users: number; active: number; timer?: ReturnType<typeof setTimeout> };
const sftp = new Map<string, SftpEntry>();

function sftpOptions(profile: SftpProfile): Parameters<SftpClient['connect']>[0] {
  return {
    host: profile.host, port: profile.port, username: profile.user,
    password: profile.password, privateKey: profile.privateKey,
    readyTimeout: ServerValue.ReadyTimeoutMs, keepaliveInterval: ServerValue.KeepaliveMs,
    hostHash: profile.fingerprint ? 'sha256' : undefined,
    hostVerifier: profile.fingerprint ? (value: string) => value === profile.fingerprint : undefined,
  };
}

async function closeSftp(id: string, entry: SftpEntry): Promise<void> {
  if (sftp.get(id) !== entry || entry.users > 0 || entry.active > 0) return;
  sftp.delete(id);
  if (entry.timer) clearTimeout(entry.timer);
  await entry.client.end().catch(() => false);
}

async function invalidateSftp(id: string, entry: SftpEntry): Promise<void> {
  if (sftp.get(id) !== entry) return;
  sftp.delete(id);
  if (entry.timer) clearTimeout(entry.timer);
  await entry.client.end().catch(() => false);
}

function evictSftp(): void {
  if (sftp.size < RemoteSessionValue.MaxSessions) return;
  const oldest = [...sftp.entries()].filter((item) => item[1].users === 0 && item[1].active === 0).sort((a, b) => a[1].last - b[1].last)[0];
  if (oldest) void closeSftp(oldest[0], oldest[1]);
}

async function getSftp(profile: SftpProfile): Promise<[string, SftpEntry]> {
  const id = key(profile);
  let entry = sftp.get(id);
  if (!entry) {
    evictSftp();
    let current: SftpEntry | undefined;
    const client = new SftpClient(`logviewer-${profile.id}`, {
      error: () => { if (current) void invalidateSftp(id, current); },
      end: () => { if (current) void invalidateSftp(id, current); },
      close: () => { if (current) void invalidateSftp(id, current); },
    });
    entry = { client, ready: Promise.resolve(), tail: Promise.resolve(), last: Date.now(), users: 0, active: 0 };
    current = entry;
    sftp.set(id, entry);
    entry.ready = client.connect(sftpOptions(profile)).then(() => undefined);
    try { await entry.ready; }
    catch (error) { sftp.delete(id); await client.end().catch(() => false); throw error; }
  }
  entry.last = Date.now();
  if (entry.timer) clearTimeout(entry.timer);
  return [id, entry];
}

export async function withSftpSession<T>(profile: SftpProfile, fn: (client: SftpClient) => Promise<T>): Promise<T> {
  const [id, entry] = await getSftp(profile);
  entry.users += 1;
  const run = entry.tail.then(() => { entry.active += 1; return entry.ready; }).then(() => fn(entry.client));
  entry.tail = run.then(() => undefined, () => undefined);
  try { return await run; }
  finally {
    entry.active = Math.max(0, entry.active - 1);
    entry.users = Math.max(0, entry.users - 1);
    entry.last = Date.now();
    entry.timer = setTimeout(() => { if (Date.now() - entry.last >= RemoteSessionValue.IdleMs && entry.users === 0 && entry.active === 0) void closeSftp(id, entry); }, RemoteSessionValue.IdleMs);
    entry.timer.unref?.();
  }
}

type SshEntry = { client: Client; ready: Promise<void>; tail: Promise<unknown>; last: number; users: number; active: number; timer?: ReturnType<typeof setTimeout> };
const ssh = new Map<string, SshEntry>();

async function getSsh(profile: SftpProfile): Promise<[string, SshEntry]> {
  const id = key(profile);
  let entry = ssh.get(id);
  if (entry) { entry.last = Date.now(); if (entry.timer) clearTimeout(entry.timer); return [id, entry]; }
  if (ssh.size >= RemoteSessionValue.MaxSessions) {
    const oldest = [...ssh.entries()].sort((a, b) => a[1].last - b[1].last)[0];
    if (oldest && oldest[1].users === 0 && oldest[1].active === 0) { ssh.delete(oldest[0]); oldest[1].client.end(); }
  }
  const client = new Client();
  entry = { client, ready: Promise.resolve(), tail: Promise.resolve(), last: Date.now(), users: 0, active: 0 };
  ssh.set(id, entry);
  entry.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSH connection timeout')), ServerValue.ConnectTimeoutMs);
      timer.unref?.();
      client.once('ready', () => { clearTimeout(timer); resolve(); });
      client.once('error', (error) => { clearTimeout(timer); if (ssh.get(id) === entry) ssh.delete(id); reject(error); });
      client.once('close', () => { if (ssh.get(id) === entry) ssh.delete(id); });
      client.connect(sftpOptions(profile) as never);
    });
  try { await entry.ready;
  } catch (error) { ssh.delete(id); client.end(); throw error; }
  return [id, entry];
}

export async function withSshSession<T>(profile: SftpProfile, fn: (client: Client) => Promise<T>): Promise<T> {
  const [id, entry] = await getSsh(profile);
  entry.users += 1;
  const run = entry.tail.then(() => { entry.active += 1; return entry.ready; }).then(() => fn(entry.client));
  entry.tail = run.then(() => undefined, () => undefined);
  try { return await run; }
  finally {
    entry.active = Math.max(0, entry.active - 1);
    entry.users = Math.max(0, entry.users - 1);
    entry.last = Date.now();
    entry.timer = setTimeout(() => { if (Date.now() - entry.last >= RemoteSessionValue.IdleMs && entry.users === 0 && entry.active === 0 && ssh.get(id) === entry) { ssh.delete(id); entry.client.end(); } }, RemoteSessionValue.IdleMs);
    entry.timer.unref?.();
  }
}

export async function closeRemoteSessions(): Promise<void> {
  const sftpEntries = [...sftp.entries()];
  const sshEntries = [...ssh.entries()];
  sftp.clear();
  ssh.clear();
  await Promise.all([
    ...sftpEntries.map(([, entry]) => entry.client.end().catch(() => false)),
    ...sshEntries.map(([, entry]) => new Promise<void>((resolve) => { entry.client.once('close', () => resolve()); entry.client.end(); })),
  ]);
}
