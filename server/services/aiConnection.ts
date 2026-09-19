import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { AiConnectConst, AiConnectStage, type AiConfig } from '../../src/config/aiTypes';

export class AiConnectionError extends Error {
  constructor(readonly stage: AiConnectStage, message: string) { super(message); }
}

export class AiConnection {
  static expand(value: string): string {
    return value.replace(/%([A-Za-z_][\w]*)%|\$\{([A-Za-z_][\w]*)\}|\$env:([A-Za-z_][\w]*)/gi, (_match, a, b, c) => {
      const name = a || b || c;
      if (process.env[name] === undefined) throw new Error(`环境变量 ${name} 未设置`);
      return process.env[name]!;
    });
  }

  static async endpoint(value: string): Promise<string> {
    const expanded = this.expand(value).trim();
    const url = new URL(/^https?:\/\//i.test(expanded) ? expanded : `http://${expanded}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('实例地址格式无效，请使用 IP:端口或 HTTP(S) 地址');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addresses.length || addresses.some(({ address: ip }) => !this.internal(ip))) throw new Error('实例地址必须指向回环或企业内网');
    return url.toString().replace(/\/$/, '');
  }

  static internal(ip: string): boolean {
    return ip === '::1' || /^(fc|fd)[0-9a-f]{2}:/i.test(ip) || ip.startsWith('fe80:') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('172.') && Number(ip.split('.')[1]) >= 16 && Number(ip.split('.')[1]) <= 31;
  }

  static async probe(directory: string, config: AiConfig, get: typeof fetch, timeout = AiConnectConst.ProbeMs): Promise<void> {
    const url = new URL(AiConnectConst.Path, `${config.endpoint}/`);
    url.searchParams.set('directory', directory);
    const headers: Record<string, string> = {};
    const password = config.passwordEnv ? process.env[config.passwordEnv] : undefined;
    if (password) headers.authorization = `Basic ${Buffer.from(`${config.username || 'opencode'}:${password}`).toString('base64')}`;
    const response = await get(url.toString(), { headers, signal: AbortSignal.timeout(timeout), redirect: 'manual' });
    if (response.status === 401 || response.status === 403) throw new Error(`实例认证失败（HTTP ${response.status}）`);
    if (!response.ok) throw new Error(`实例返回 HTTP ${response.status}`);
    const body = await response.json() as { directory?: unknown };
    if (typeof body.directory !== 'string') throw new Error('响应不符合 OpenCode serve 协议（缺少 directory）');
    if (path.resolve(body.directory) !== path.resolve(directory)) throw new Error('实例的工作目录与请求目录不一致');
  }

  static reason(error: unknown): string {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return '连接超时';
    const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code || (error as { code?: string })?.code;
    if (code === 'ECONNREFUSED') return '连接被拒绝';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '主机地址无法解析';
    if (error instanceof Error && error.message === 'fetch failed') return '网络连接失败';
    return error instanceof Error ? error.message : '连接失败';
  }
}
