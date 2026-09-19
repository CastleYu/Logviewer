import fs from 'node:fs';
import { EnvKey, ServerValue } from './constants';
import type { PublicSftpProfile, SftpProfile } from '../models/sftpModels';

export class SftpConfig {
  static load(): SftpProfile | null {
    const host = this.env(EnvKey.Host, EnvKey.FallbackHost);
    const user = this.env(EnvKey.User, EnvKey.FallbackUser);
    const password = this.env(EnvKey.Password, EnvKey.FallbackPassword);
    const keyPath = process.env[EnvKey.KeyPath]?.trim();
    if (!host || !user || (!password && !keyPath)) return null;

    const privateKey = keyPath ? fs.readFileSync(keyPath, 'utf8') : undefined;
    return {
      id: ServerValue.ProfileId,
      name: ServerValue.ProfileName,
      host,
      port: this.number(this.env(EnvKey.Port, EnvKey.FallbackPort), ServerValue.DefaultPort),
      user,
      password: password || undefined,
      privateKey,
      root: process.env[EnvKey.Root]?.trim() || ServerValue.DefaultRoot,
      fingerprint: process.env[EnvKey.Fingerprint]?.trim() || undefined,
      maxBytes: this.number(process.env[EnvKey.MaxBytes], ServerValue.DefaultMaxBytes),
    };
  }

  static public(profile: SftpProfile | null): PublicSftpProfile[] {
    const root = profile?.root || ServerValue.DefaultRoot;
    return [{
      id: ServerValue.ProfileId,
      name: ServerValue.ProfileName,
      root,
      ready: Boolean(profile),
      host: profile?.host,
      roots: [root],
      source: 'env',
      protocol: 'sftp',
    }];
  }

  private static env(primary: string, fallback: string): string {
    return process.env[primary]?.trim() || process.env[fallback]?.trim() || '';
  }

  private static number(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
