import type { SourceTarget, SourceRepository } from './sourceTypes';

export enum AiMode { Isolated = 'isolated', Source = 'source' }
export enum AiRepositoryOrigin { Bound = 'bound', Index = 'index', Manual = 'manual', Missing = 'missing' }
export enum AiSessionState { Idle = 'idle', Busy = 'busy', Aborted = 'aborted', Error = 'error' }
export enum AiLink { Off = 'off', Ready = 'ready', Work = 'work', Fail = 'fail' }
export enum AiPartKind { User = 'user', Text = 'text', Thought = 'thought', Tool = 'tool', Plan = 'plan', Note = 'note', Deny = 'deny' }
export enum AiPermitState { Pending = 'pending', Allow = 'allow', Deny = 'deny' }
export enum AiNoteKind { Note = 'note', Report = 'report', Memory = 'memory' }
export enum AiToolStatus { Wait = 'wait', Run = 'run', Done = 'done', Fail = 'fail' }

export class AiConst {
  static readonly ConfigFile = 'ai-config.json';
  static readonly SessionsFile = 'ai-sessions.json';
  static readonly SourceConfigFile = 'source-config.json';
  static readonly RepositoryLock = 'repository:';
  static readonly MaxSourceTargets = 64;
  static readonly WorkspaceDir = 'ai-workspaces';
  static readonly RecipeDir = '.opencode/agents';
  static readonly Api = '/api/ai';
  static readonly JsonLimit = '2mb';
  static readonly InputName = 'input.log';
  static readonly DiagnoseRecipe = 'logviewer-diagnose.md';
  static readonly EvidenceRecipe = 'logviewer-evidence.md';
  static readonly NotesDir = 'notes';
  static readonly MemoryFile = 'memory.json';
  static readonly McpName = 'logtools';
  static readonly Protocol = 1;
  static readonly Client = 'LogViewer';
  static readonly PromptMs = 10 * 60 * 1000;
  static readonly BootMs = 30_000;
  static readonly HoldMs = 20_000;
  static readonly LineRef = 'L';
}

export class AiCmd {
  static readonly Command = 'opencode acp';
  static readonly Resume = 'opencode --session {sessionId}';
  static readonly Login = 'opencode auth login';
  static readonly Bin = 'D:\\Code\\data\\opencode\\bin\\opencode.cmd';
  static readonly ExeName = 'opencode';
  static readonly SessionToken = '{sessionId}';
}

export class AiRoute {
  static readonly State = '/state';
  static readonly Config = '/config';
  static readonly Probe = '/probe';
  static readonly Login = '/login';
  static readonly Events = '/events';
  static readonly Sessions = '/sessions';
  static readonly Prompt = '/prompt';
  static readonly Abort = '/abort';
  static readonly View = '/view';
  static readonly Queue = '/queue';
  static readonly Resume = '/resume';
  static readonly Terminal = '/terminal';
  static readonly Refresh = '/refresh';
  static readonly Close = '/close';
  static readonly Model = '/model';
  static readonly Mode = '/mode';
  static readonly Notes = '/notes';
  static readonly Undo = '/undo';
  static readonly Permit = '/permit';
  static readonly Repository = '/repository';
  static readonly Commands = '/commands';
}

export class AcpMethod {
  static readonly Initialize = 'initialize';
  static readonly New = 'session/new';
  static readonly Load = 'session/load';
  static readonly List = 'session/list';
  static readonly Prompt = 'session/prompt';
  static readonly Cancel = 'session/cancel';
  static readonly Close = 'session/close';
  static readonly Delete = 'session/delete';
  static readonly SetOption = 'session/set_config_option';
  static readonly Update = 'session/update';
  static readonly Permit = 'session/request_permission';
  static readonly Read = 'fs/read_text_file';
  static readonly Write = 'fs/write_text_file';
  static readonly Auth = 'authenticate';
}

export class AcpUpdate {
  static readonly Text = 'agent_message_chunk';
  static readonly Thought = 'agent_thought_chunk';
  static readonly User = 'user_message_chunk';
  static readonly Tool = 'tool_call';
  static readonly ToolUp = 'tool_call_update';
  static readonly Plan = 'plan';
  static readonly Commands = 'available_commands_update';
}

export class AcpCapKey {
  static readonly Load = 'loadSession';
  static readonly Http = 'http';
  static readonly Steering = 'steering';
  static readonly Model = 'model';
  static readonly Mode = 'mode';
  static readonly ExtraDirs = 'additionalDirectories';
}

export class ToolName {
  static readonly Overview = 'log_overview';
  static readonly Search = 'log_search';
  static readonly Read = 'log_read';
  static readonly Record = 'log_record';
  static readonly Stats = 'log_stats';
  static readonly Errors = 'log_errors';
  static readonly Selection = 'log_selection';
  static readonly View = 'log_view';
  static readonly NoteWrite = 'note_write';
  static readonly NoteRead = 'note_read';
  static readonly NoteList = 'note_list';
  static readonly MemoryWrite = 'memory_write';
  static readonly MemorySearch = 'memory_search';
  static readonly ReportWrite = 'report_write';
  static readonly All = [ToolName.Overview, ToolName.Search, ToolName.Read, ToolName.Record, ToolName.Stats, ToolName.Errors, ToolName.Selection, ToolName.View, ToolName.NoteWrite, ToolName.NoteRead, ToolName.NoteList, ToolName.MemoryWrite, ToolName.MemorySearch, ToolName.ReportWrite];
}

export class ToolCap {
  static readonly Body = 8192;
  static readonly Overview = 1024;
  static readonly Line = 200;
  static readonly Search = 50;
  static readonly Errors = 30;
  static readonly Groups = 50;
  static readonly Before = 20;
  static readonly After = 50;
  static readonly Modules = 10;
}

export class PermKind {
  static readonly Read = 'read';
  static readonly Search = 'search';
  static readonly Fetch = 'fetch';
  static readonly Think = 'think';
  static readonly Edit = 'edit';
  static readonly Delete = 'delete';
  static readonly Move = 'move';
  static readonly Execute = 'execute';
  static readonly Allow = [PermKind.Read, PermKind.Search, PermKind.Fetch, PermKind.Think];
  static readonly Deny = [PermKind.Edit, PermKind.Delete, PermKind.Move, PermKind.Execute];
  static readonly DenyWhy = '请使用 note_write / report_write';
}

export class AiGuard {
  static readonly Env = 'OPENCODE_CONFIG_CONTENT';
  static readonly Rules = [
    { action: 'edit', resource: '*', effect: 'ask' },
    { action: 'external_directory', resource: '*', effect: 'ask' },
    { action: 'shell', resource: '*', effect: 'ask' },
  ];
}

export class EnvName {
  static readonly GoKey = 'OPENCODE_GO_API_KEY';
  static readonly Base = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'ComSpec', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'SYSTEMDRIVE', 'USERNAME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'OPENCODE_DB'];
}

export class LegacyKey {
  static readonly Pass = ['password', 'Env'].join('');
  static readonly Endpoint = 'endpoint';
  static readonly Launch = 'launch';
  static readonly User = 'username';
  static readonly Provider = 'providerID';
  static readonly Model = 'modelID';
  static readonly Executable = 'executable';
}

export class McpMethod {
  static readonly Initialize = 'initialize';
  static readonly List = 'tools/list';
  static readonly Call = 'tools/call';
  static readonly Ping = 'ping';
  static readonly Initialized = 'notifications/initialized';
}

export type AiOptionItem = { value: string; name: string };
export type AiOption = { id: string; name: string; value: string; options: AiOptionItem[] };
export type AiCommand = { name: string; description: string };
export type AiUsage = { input: number; output: number; total: number };
export type AiToolSize = { name: string; bytes: number; truncated: boolean; at: string };
export type AiAuthMethod = { id: string; name: string; description: string };

export type AiConfig = {
  name: string;
  command: string;
  mode: AiMode;
  envAllow: string[];
  resume: string;
  login: string;
  recipe: boolean;
  installRecipe: boolean;
  trackLog: boolean;
  allow: string[];
  deny: string[];
};

export type AiProbe = {
  name: string;
  version: string;
  load: boolean;
  http: boolean;
  steering: boolean;
  auth: AiAuthMethod[];
  error?: string;
};

export type AiPart =
  | { t: AiPartKind.User; text: string }
  | { t: AiPartKind.Text; text: string }
  | { t: AiPartKind.Thought; text: string }
  | { t: AiPartKind.Tool; id: string; name: string; args: string; status: AiToolStatus; result: string }
  | { t: AiPartKind.Plan; items: { text: string; status: string }[] }
  | { t: AiPartKind.Note; id: string; name: string; kind: AiNoteKind }
  | { t: AiPartKind.Deny; id: string; title: string; why: string };

export type AiMsg = { id: string; role: 'user' | 'agent'; parts: AiPart[]; done?: boolean; stop?: boolean };

export type AiQueueItem = { id: string; text: string; steer?: boolean; created: string };
export type AiPermit = { id: string; title: string; kind: string; state: AiPermitState; why: string };
export type AiNote = { id: string; logId: string; name: string; text: string; kind: AiNoteKind; tags: string[]; created: string };
export type AiView = { selected: number[]; search: string; filter: string; from: number; to: number; use: boolean };

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

export type AiPromptInput = { sessionId: string; text: string; steer?: boolean; view?: AiView };

export type AiSession = {
  id: string;
  agentId?: string;
  legacy: boolean;
  title: string;
  logId: string;
  mode: AiMode;
  directory: string;
  repository?: string;
  snapshot?: string;
  trackLog: boolean;
  created: string;
  model?: string;
  modeId?: string;
  options: AiOption[];
  commands: AiCommand[];
  state: AiSessionState;
  messages: AiMsg[];
  queue: AiQueueItem[];
  queuePaused: boolean;
  permits: AiPermit[];
  error?: string;
  link: AiLink;
  usage: AiUsage;
  toolSizes: AiToolSize[];
  calls: string[];
  view: AiView;
  sourceKey?: string;
  contentHash?: string;
  origin?: string;
  closed?: boolean;
  replay?: boolean;
  loaded?: boolean;
};

export type AiRemote = { sessionId: string; cwd: string; title: string };
export type AiState = { sessions: AiSession[]; config: AiConfig; link: AiLink; agent?: { name: string; version: string }; steering?: boolean; remote?: AiRemote[] };

export class AiDefaults {
  static config(): AiConfig {
    return {
      name: 'OpenCode',
      command: AiCmd.Command,
      mode: AiMode.Source,
      envAllow: [EnvName.GoKey],
      resume: AiCmd.Resume,
      login: AiCmd.Login,
      recipe: true,
      installRecipe: false,
      trackLog: false,
      allow: [...PermKind.Allow],
      deny: [...PermKind.Deny],
    };
  }
  static view(): AiView { return { selected: [], search: '', filter: '', from: 0, to: 0, use: true }; }
  static usage(): AiUsage { return { input: 0, output: 0, total: 0 }; }
}
