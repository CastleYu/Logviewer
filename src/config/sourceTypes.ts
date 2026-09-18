export enum SourceIde { PyCharm = 'pycharm', Idea = 'idea', Clion = 'clion', WebStorm = 'webstorm', GoLand = 'goland', Rider = 'rider', Code = 'code' }

export interface SourceOpener {
  id: string;
  name: string;
  exe: string;
  pattern: string;
}

export class SourcePreset {
  static readonly All: SourceOpener[] = [
    { id: SourceIde.PyCharm, name: 'PyCharm', exe: 'pycharm64.exe', pattern: '.py' },
    { id: SourceIde.Idea, name: 'IDEA', exe: 'idea64.exe', pattern: '.java' },
    { id: SourceIde.Clion, name: 'CLion', exe: 'clion64.exe', pattern: '.c, .cpp' },
    { id: SourceIde.WebStorm, name: 'WebStorm', exe: 'webstorm64.exe', pattern: '.js, .ts, .jsx, .tsx' },
    { id: SourceIde.GoLand, name: 'GoLand', exe: 'goland64.exe', pattern: '.go' },
    { id: SourceIde.Rider, name: 'Rider', exe: 'rider64.exe', pattern: '.cs' },
    { id: SourceIde.Code, name: 'VS Code', exe: 'Code.exe', pattern: '' },
  ];
}

export class SourceConst {
  static readonly Api = '/api/source';
  static readonly Config = '/config';
  static readonly Rebuild = '/rebuild';
  static readonly Root = '/root';
  static readonly RootRebuild = '/root/rebuild';
  static readonly Openers = '/openers';
  static readonly PickFolder = '/pick-folder';
  static readonly PickFile = '/pick-file';
  static readonly Lookup = '/lookup';
  static readonly Open = '/open';
  static readonly Store = '.logviewer-source.json';
  static readonly Header = 'X-Logviewer-Source';
  static readonly HeaderValue = '1';
  static readonly ColumnsKey = 'LOGVIEWER_SOURCE_COLUMNS';
  static readonly OverrideKey = 'LOGVIEWER_SOURCE_OVERRIDE';
  static readonly CellAttr = 'data-source-field';
  static readonly CellSelector = '[data-source-field]';
  static readonly MaxRoots = 32;
  static readonly MaxOpeners = 32;
  static readonly MaxFiles = 1_000_000;
  static readonly LineArg = '--line';
  static readonly Names: Record<SourceIde, string> = Object.fromEntries(SourcePreset.All.map((item) => [item.id, item.name])) as Record<SourceIde, string>;
  static readonly Exe: Record<SourceIde, string> = Object.fromEntries(SourcePreset.All.map((item) => [item.id, item.exe])) as Record<SourceIde, string>;
  static readonly Extensions: Record<string, SourceIde> = { '.py': SourceIde.PyCharm, '.java': SourceIde.Idea, '.c': SourceIde.Clion, '.cpp': SourceIde.Clion };
}

export interface SourceConfig { roots: string[]; openers: SourceOpener[] }
export interface SourceRootInfo { path: string; count: number }
export interface SourceState extends SourceConfig {
  count: number;
  updated: string | null;
  busy: boolean;
  error?: string;
  rootsInfo: SourceRootInfo[];
  detected: SourceOpener[];
}
export interface SourceMatch { path: string; openerId: string | null; openerName: string | null; ready: boolean }
export interface SourceColumns { file: string; line: string }
export interface SourceTarget { file: string; line: number }
