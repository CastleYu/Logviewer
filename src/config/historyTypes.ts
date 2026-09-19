export enum HistoryKind { Local = 'local', Remote = 'remote', Sample = 'sample' }

export interface HistoryLog {
  id: string;
  name: string;
  origin: string;
  kind: HistoryKind;
  created: string;
  size: number;
  formatId: string;
  repository?: string;
}

export class HistoryConst {
  static readonly Api = '/api/history';
  static readonly Store = '.logviewer-history';
  static readonly Metadata = 'metadata.json';
  static readonly Content = 'content.txt';
  static readonly Header = 'X-Logviewer-History';
  static readonly HeaderValue = '1';
  static readonly Local = '/local';
  static readonly Pick = '/pick';
}
