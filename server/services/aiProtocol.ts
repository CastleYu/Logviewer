import { AiMessageError } from '../../src/config/aiMessageTypes';

export class AiProtocol {
  static readonly Busy = 'busy';
  static readonly Retry = 'retry';
  static readonly Idle = 'idle';
  static readonly Accepted = 'accepted';
  static readonly Prompt = '/prompt_async';
  static readonly Status = '/session/status';
  static readonly Events = '/event';
  static readonly SessionError = 'session.error';
  static readonly Compacted = 'session.compacted';
  static readonly ToolCalls = 'tool-calls';
  static readonly Unknown = 'unknown';
  static readonly Aborted = AiMessageError.Aborted;
  static readonly StreamRetryMs = 3000;
  static readonly StreamConnectMs = 2500;

  static error(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    const info = error as { name?: string; data?: { message?: string }; message?: string } | undefined;
    return info?.data?.message || info?.message || JSON.stringify(error) || '未知 Agent 错误';
  }

  static isAbort(error: unknown): boolean { return (error as { name?: string } | undefined)?.name === AiProtocol.Aborted; }
  static errorKey(info: unknown): string | undefined {
    const value = info as { id?: string; time?: unknown; error?: unknown } | undefined;
    return value?.error ? JSON.stringify([value.id, value.time, value.error]) : undefined;
  }
}

export type AiRemoteStatus = { type?: string; attempt?: number; message?: string; next?: number };

export type AiRemoteEvent = { type: string; properties?: { sessionID?: string; error?: unknown } };
