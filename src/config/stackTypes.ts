export enum RecordMode {
  Line = 'line',
  Stack = 'stack',
}

export enum StackLanguage {
  Python = 'python',
  Java = 'java',
}

export enum StackStatus {
  Complete = 'complete',
  Partial = 'partial',
}

export enum StackRelation {
  Root = 'root',
  Cause = 'cause',
  Context = 'context',
  Suppressed = 'suppressed',
}

export enum FrameKind {
  Source = 'source',
  Native = 'native',
  Unknown = 'unknown',
}

export class StackPattern {
  static readonly lines = /\r?\n/;
  static readonly header = /^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
  static readonly python = /(?:^|[\s\[])Traceback \(most recent call last\):\s*$/;
  static readonly group = /Exception Group Traceback|^\s*[|+]\s*(?:[-+]+|\d+\s*[-+])/;
  static readonly pyFrame = /^\s*File "(.+)", line (\d+)(?:, in (.+))?\s*$/;
  static readonly pyError = /^([\w.]+)(?::\s*(.*))?$/;
  static readonly cause = /^The above exception was the direct cause of the following exception:\s*$/;
  static readonly context = /^During handling of the above exception, another exception occurred:\s*$/;
  static readonly javaFrame = /^\s+at\s+([^\s(]+)\(([^)]*)\)\s*$/;
  static readonly javaHead = /^(?:Exception in thread "[^"]+"\s+)?([\w$]+(?:\.[\w$]+)*)(?::\s*(.*))?$/;
  static readonly javaError = /^(?:Exception in thread "[^"]+"\s+)?(?:[\w$]+\.)*[\w$]*(?:Exception|Error|Throwable)(?::.*)?$/;
  static readonly javaLink = /^(\s*)(Caused by:|Suppressed:)\s*(.+)$/;
  static readonly more = /^\s*\.\.\. (\d+) (?:more|common frames omitted)\s*$/;
  static readonly circular = /^\s*\[CIRCULAR REFERENCE:.*\]\s*$/;
  static readonly source = /^(.*):(\d+)$/;
  static readonly indent = /^\s+/;
}

export class StackText {
  static readonly native = 'Native Method';
  static readonly unknown = 'Unknown Source';
  static readonly suppressed = 'Suppressed:';
  static readonly fallback = 'fallback';
  static readonly unknownLevel = 'OTHER';
  static readonly missing = '-';
  static readonly title = '堆栈详情';
}

export interface StackFrame {
  raw: string;
  name: string;
  file?: string;
  line?: number;
  kind: FrameKind;
  source?: string[];
}

export interface StackException {
  type: string;
  message: string;
  relation: StackRelation;
  parent?: number;
  frames: StackFrame[];
  omitted?: number;
}

export interface StackTrace {
  language: StackLanguage;
  status: StackStatus;
  raw: string;
  exceptions: StackException[];
}

export interface LogRecord {
  head: string;
  raw: string;
  start: number;
  end: number;
  stack?: StackTrace;
}
