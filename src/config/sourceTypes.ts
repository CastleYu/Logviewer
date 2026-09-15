export enum SourceIde { PyCharm = 'pycharm', Idea = 'idea', Clion = 'clion' }

export class SourceConst {
  static readonly Api = '/api/source';
  static readonly Config = '/config';
  static readonly Rebuild = '/rebuild';
  static readonly Lookup = '/lookup';
  static readonly Open = '/open';
  static readonly Store = '.logviewer-source.json';
  static readonly Header = 'X-Logviewer-Source';
  static readonly HeaderValue = '1';
  static readonly ColumnsKey = 'LOGVIEWER_SOURCE_COLUMNS';
  static readonly CellAttr = 'data-source-field';
  static readonly CellSelector = '[data-source-field]';
  static readonly MaxRoots = 32;
  static readonly MaxFiles = 1_000_000;
  static readonly LineArg = '--line';
  static readonly Names: Record<SourceIde, string> = { [SourceIde.PyCharm]: 'PyCharm', [SourceIde.Idea]: 'IDEA', [SourceIde.Clion]: 'CLion' };
  static readonly Exe: Record<SourceIde, string> = { [SourceIde.PyCharm]: 'pycharm64.exe', [SourceIde.Idea]: 'idea64.exe', [SourceIde.Clion]: 'clion64.exe' };
  static readonly Extensions: Record<string, SourceIde> = { '.py': SourceIde.PyCharm, '.java': SourceIde.Idea, '.c': SourceIde.Clion, '.cpp': SourceIde.Clion };
}

export interface SourceConfig { roots: string[]; programs: Record<SourceIde, string> }
export interface SourceState extends SourceConfig { count: number; updated: string | null; busy: boolean; error?: string }
export interface SourceMatch { path: string; ide: SourceIde | null; ready: boolean }
export interface SourceColumns { file: string; line: string }
export interface SourceTarget { file: string; line: number }
