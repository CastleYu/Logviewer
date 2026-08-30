/**
 * Types for LogViewer Pro
 */

import type { RuntimeFieldFilters } from './config/logFormatTypes';

export interface ParsedLogFields {
  timestamp: string;      // 1. 时间戳
  level: string;          // 2. 日志级别 (INFO, WARN, ERROR, etc.)
  requestId: string;      // 3. 请求ID
  operationDesc: string;  // 4. 操作描述 (可能包含嵌套中括号)
  functionName: string;   // 5. 函数名
  threadId: string;       // 6. 线程ID
  memoryAddress: string;  // 7. 内存地址
  module: string;         // 8. 模块
  fileName: string;       // 9. 文件名
  lineNumber: string;     // 10. 行号
  [key: string]: unknown;
}

export interface LogEntry {
  id: number;                     // 0-indexed 行序列号
  lineNumber: number;             // 1-indexed 显示行号
  success: boolean;               // 是否解析成功 (是否包含完整10个字段)
  fields?: ParsedLogFields;       // 解析成功的字段集合
  rawText: string;                // 原始单行文本
  parseErrorReason?: string;      // 解析失败原因（如括号不匹配、字段数不足）
  parserId?: string;
}

export interface LogStats {
  fileName: string;
  fileSize: number;               // 字节数
  totalCount: number;
  successCount: number;
  failedCount: number;
  parseDurationMs: number;        // 解析耗时（毫秒）
  levelCounts: Record<string, number>; // 各级别数量统计
}

export interface PinnedHighlight {
  id: string;
  keyword: string;
  color: string;                  // 'purple' | 'amber' | 'emerald' | 'cyan' | 'rose' | 'indigo'
  matchCase?: boolean;
  isRegex?: boolean;
}

export enum ColumnFilterKey {
  Index = 'index',
  Timestamp = 'timestamp',
  Level = 'level',
  RequestId = 'requestId',
  OperationDesc = 'operationDesc',
  FunctionName = 'functionName',
  ThreadId = 'threadId',
  MemoryAddress = 'memoryAddress',
  Module = 'module',
  FileName = 'fileName',
}

export enum FilterValue {
  All = 'ALL',
  FailedOnly = 'FAILED_ONLY',
}

export enum LogLevel {
  Debug = 'DEBUG',
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR',
}

export interface TextColumnFilter {
  value: string;
  matchCase: boolean;
  isRegex: boolean;
}

export interface NumericColumnFilter {
  min: string;
  max: string;
}

export interface ColumnFilterState {
  index: NumericColumnFilter;
  requestId: TextColumnFilter;
  operationDesc: TextColumnFilter;
  functionName: TextColumnFilter;
  memoryAddress: TextColumnFilter;
  fileName: TextColumnFilter;
}

export interface FilterOptions {
  level: string;                  // 'ALL' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FAILED_ONLY'
  selectedLevels: string[];       // 多选日志级别, [] 或包含 'ALL' 表示全部
  searchKeyword: string;
  searchColumn?: string;          // 单选搜索列 (兼容)
  searchColumns?: string[];       // 多选搜索列: ['ALL'] 或 ['operationDesc', 'requestId', ...]
  isRegex: boolean;
  matchCase: boolean;
  selectedModule: string;         // 'ALL' 或具体模块
  selectedThread: string;         // 'ALL' 或具体线程
  // 1. 区间筛选：从该字符串首次出现行 ~ 末次出现行
  rangeKeyword: string;
  // 2. 时间范围筛选（精确到毫秒）
  startTime: string;              // 'YYYY-MM-DDTHH:mm:ss.sss' 或 'YYYY-MM-DD HH:mm:ss,sss'
  endTime: string;
  isUtcOffset: boolean;           // 是否开启 UTC 转换 (配置后，输入的 GMT+8 时间自动转 UTC 进行匹配)
  utcOffsetHours: number;         // 默认 +8
  // 3. 搜索高亮
  highlightKeyword: string;
  highlightMatchCase?: boolean;   // 高亮区分大小写开关
  highlightIsRegex?: boolean;     // 高亮正则匹配开关
  pinnedHighlights?: PinnedHighlight[]; // 已固定的多高亮规则列表
  // 5. 自动换行开关
  wordWrap: boolean;
  columnFilters: ColumnFilterState;
  configuredFilters: RuntimeFieldFilters;
}

export type DisplayDensity = 'compact' | 'normal' | 'relaxed';
export type ThemeMode = 'dark' | 'light';
export type BorderIntensity = 'light' | 'medium' | 'strong';

export interface ColumnWidths {
  index: number;
  timestamp: number;
  level: number;
  requestId: number;
  operationDesc: number;
  functionName: number;
  threadId: number;
  memoryAddress: number;
  module: number;
  fileName: number;
  lineNumber: number;
}

export interface ColumnVisibility {
  index: boolean;
  timestamp: boolean;
  level: boolean;
  requestId: boolean;
  operationDesc: boolean;
  functionName: boolean;
  threadId: boolean;
  memoryAddress: boolean;
  module: boolean;
  fileName: boolean;
  lineNumber: boolean;
}
