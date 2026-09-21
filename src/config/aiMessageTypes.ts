export enum AiMessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
  Tool = 'tool',
}

export enum AiPartType {
  Text = 'text',
  Reasoning = 'reasoning',
  Tool = 'tool',
  File = 'file',
  Agent = 'agent',
  Subtask = 'subtask',
  Compaction = 'compaction',
  Retry = 'retry',
  StepStart = 'step-start',
  StepFinish = 'step-finish',
  Snapshot = 'snapshot',
  Patch = 'patch',
}

export enum AiToolStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Error = 'error',
}

export enum AiMessageError { Aborted = 'MessageAbortedError' }

export class AiMessageLabels {
  static readonly Markdown = {
    close: '关闭', copied: '已复制', copyCode: '复制代码', copyLink: '复制链接', copyTable: '复制表格',
    copyTableAsCsv: '复制为 CSV', copyTableAsMarkdown: '复制为 Markdown', copyTableAsTsv: '复制为 TSV',
    downloadFile: '下载代码', downloadImage: '下载图片', downloadTable: '下载表格',
    downloadTableAsCsv: '下载 CSV', downloadTableAsMarkdown: '下载 Markdown',
    exitFullscreen: '退出全屏', externalLinkWarning: '即将打开外部链接，请确认地址。',
    imageNotAvailable: '图片无法显示', openExternalLink: '打开外部链接', openLink: '打开链接',
    resetView: '重置视图', viewFullscreen: '全屏查看', zoomIn: '放大', zoomOut: '缩小',
  };
  static readonly User = '你';
  static readonly Assistant = 'Agent';
  static readonly Response = '回复';
  static readonly Reasoning = '思考过程';
  static readonly Tool = '工具调用';
  static readonly Details = '详情';
  static readonly Summary = '压缩摘要';
  static readonly Unknown = '未识别消息';
  static readonly BackToBottom = '回到底部';
  static readonly Pending = '等待中';
  static readonly Running = '运行中';
  static readonly Completed = '已完成';
  static readonly Error = '错误';
}

export type AiMessageInfo = {
  id?: string;
  role?: string;
  error?: unknown;
  time?: string | number | { created?: string | number; completed?: string | number };
  finish?: string | boolean;
  summary?: boolean | string;
};

export type AiMessagePart = Record<string, unknown> & { type?: string };
export type AiMessage = { info?: AiMessageInfo; parts?: AiMessagePart[] };
