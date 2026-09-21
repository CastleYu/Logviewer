import type { SourceTarget, SourceRepository } from './sourceTypes';

export enum AiMode { Isolated = 'isolated', Source = 'source' }
export enum AiRepositoryOrigin { Bound = 'bound', Index = 'index', Manual = 'manual', Missing = 'missing' }
export enum AiSessionState { Accepted = 'accepted', Busy = 'busy', Idle = 'idle', Aborted = 'aborted', Error = 'error' }
export enum AiRequestKind { Prompt = 'prompt', Abort = 'abort', Permission = 'permission', Question = 'question' }
export enum AiConnectStage { Existing = 'existing_unreachable', MissingProgram = 'program_missing', Start = 'start_failed', Exit = 'server_exited', Ready = 'started_unreachable', Closed = 'application_closing' }

export class AiConnectConst {
  static readonly ProbeMs = 2500;
  static readonly StartMs = 15000;
  static readonly PollMs = 100;
  static readonly Host = '127.0.0.1';
  static readonly Path = '/path';
  static readonly PasswordPrefix = 'LOGVIEWER_OPENCODE_PASSWORD_';
  static readonly Username = 'OPENCODE_SERVER_USERNAME';
  static readonly Password = 'OPENCODE_SERVER_PASSWORD';
  static readonly DisableUpdate = 'OPENCODE_DISABLE_AUTOUPDATE';
  static readonly DisableModels = 'OPENCODE_DISABLE_MODELS_FETCH';
}

export const AiConst = {
  ConfigFile: 'ai-config.json',
  SessionsFile: 'ai-sessions.json',
  SourceConfigFile: 'source-config.json',
  RepositoryLock: 'repository:',
  MaxSourceTargets: 64,
  WorkspaceDir: 'ai-workspaces',
  RecipeDir: '.opencode/agents',
  HeaderDirectory: 'x-opencode-directory',
  DefaultPort: 4096,
  PollMs: 500,
  PollTimeoutMs: 30 * 60 * 1000,
  Api: '/api/ai',
  JsonLimit: '1gb',
  InputName: 'input.log',
  DiagnoseRecipe: 'logviewer-diagnose.md',
  EvidenceRecipe: 'logviewer-evidence.md',
} as const;

export const AiRoute = {
  State: '/state',
  Config: '/config',
  Launch: '/launch',
  Sessions: '/sessions',
  Prompt: '/prompt',
  Abort: '/abort',
  Permissions: '/permissions',
  Questions: '/questions',
  Reply: '/reply',
  Reject: '/reject',
  Repository: '/repository',
} as const;

export type AiConfig = {
  endpoint: string;
  executable: string;
  /** Legacy persisted field; connection now always tries endpoint before managed fallback. */
  launch?: boolean;
  managed?: boolean;
  username?: string;
  passwordEnv?: string;
  providerID?: string;
  modelID?: string;
  agent?: string;
  recipe?: boolean;
  mode?: AiMode;
  sourceRoot?: string;
  installRecipe?: boolean;
  trackLog?: boolean;
};

export type AiCreateInput = {
  logId: string;
  mode?: AiMode;
  repository?: string;
  targets?: SourceTarget[];
  trackLog?: boolean;
  installRecipe?: boolean;
};

export type AiRepositoryInput = { logId: string; targets?: SourceTarget[]; repository?: string };
export type AiRepositoryState = { logId: string; repository?: string; candidates: SourceRepository[]; origin: AiRepositoryOrigin };

export type AiPromptInput = {
  sessionId: string;
  prompt: string;
  recipe?: boolean;
  model?: { providerID: string; modelID: string };
  agent?: string;
};

export type AiQueueItem = {
  id: string;
  prompt: string;
  recipe?: boolean;
  model?: { providerID: string; modelID: string };
  agent?: string;
  created: string;
};

export type AiActivity = { type: string; message?: string; attempt?: number; next?: number };

export type AiPermission = Record<string, unknown> & { id?: string; requestID?: string; sessionID?: string };
export type AiQuestion = Record<string, unknown> & { id?: string; requestID?: string; sessionID?: string };
export type AiMessage = Record<string, unknown>;

export type AiSession = {
  id: string;
  logId: string;
  mode: AiMode;
  directory: string;
  repository?: string;
  trackLog: boolean;
  created: string;
  state: AiSessionState;
  messages: AiMessage[];
  permissions: AiPermission[];
  questions: AiQuestion[];
  error?: string;
  endpoint?: string;
  username?: string;
  passwordEnv?: string;
  managed?: boolean;
  executable?: string;
  queue?: AiQueueItem[];
  queuePaused?: boolean;
  activity?: AiActivity;
  submittedAt?: number;
  streamError?: string;
  lastPrompt?: AiQueueItem;
  clearedError?: string;
  logPath?: string;
  sourceAnchor?: SourceTarget;
};

export type AiState = {
  sessions: AiSession[];
  config: AiConfig & { passwordConfigured: boolean };
};
