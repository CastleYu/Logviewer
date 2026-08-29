import { LogEntry, LogStats, ParsedLogFields } from '../types';

/**
 * ============================================================================
 * 核心解析算法：多级容错日志解析器 (Multi-Tier Robust Log Parser)
 * 
 * 日志标准格式定义（10 个顶层中括号包含的字段）：
 * [时间戳][日志级别][请求ID][操作描述][函数名][线程ID][内存地址][模块][文件名][行号]
 * 
 * 优化增强：
 * 1. 尝试 1：正向括号深度扫描 (Forward Bracket Depth Match)
 * 2. 尝试 2：双向锚定解析 (Bidirectional Anchoring)
 *    - 当操作描述中包含未闭合的 Python Dict、JSON 格式、`{'auth:******`、嵌套 `[` 或 `]` 时，
 *      传统状态机会因为括号深度不对导致“未闭合的中括号语法错误”。
 *    - 双向锚定策略：左侧提取 3 个头部字段 [Timestamp][Level][RequestID]，
 *      右侧逆向提取 6 个尾部字段 [FunctionName][ThreadID][MemoryAddress][Module][FileName][LineNumber]，
 *      中间所有字符全量作为 [Operation Description]，彻底解决内部括号错位/未闭合问题！
 * 3. 尝试 3：柔性兜底解析 (Flexible Fallback Parser)
 *    - 提取时间戳与日志级别，其余部分保留为 operationDesc，确保任意非空日志行都能成功呈现。
 * ============================================================================
 */

/**
 * 尝试 1：正向括号深度匹配
 */
function parseForwardBracketDepth(line: string): ParsedLogFields | null {
  const len = line.length;
  let i = 0;
  const fields: string[] = [];

  while (i < len) {
    while (i < len && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= len) break;

    if (line[i] === '[') {
      const fieldStartIndex = i + 1;
      let bracketDepth = 1;
      i++;

      while (i < len && bracketDepth > 0) {
        const char = line[i];
        if (char === '[') {
          bracketDepth++;
        } else if (char === ']') {
          bracketDepth--;
        }

        if (bracketDepth === 0) {
          const fieldContent = line.substring(fieldStartIndex, i);
          fields.push(fieldContent);
          i++;
          break;
        }
        i++;
      }

      if (bracketDepth > 0) {
        return null;
      }
    } else {
      i++;
    }
  }

  if (fields.length !== 10) {
    return null;
  }

  let normalizedLevel = fields[1].trim().toUpperCase();
  if (normalizedLevel === 'WARNING') normalizedLevel = 'WARN';
  if (normalizedLevel === 'ERR') normalizedLevel = 'ERROR';
  if (normalizedLevel === 'CRITICAL') normalizedLevel = 'ERROR';

  return {
    timestamp: fields[0].trim(),
    level: normalizedLevel,
    requestId: fields[2].trim(),
    operationDesc: fields[3].trim(),
    functionName: fields[4].trim(),
    threadId: fields[5].trim(),
    memoryAddress: fields[6].trim(),
    module: fields[7].trim(),
    fileName: fields[8].trim(),
    lineNumber: fields[9].trim(),
  };
}

/**
 * 尝试 2：双向锚定解析 (Bidirectional Anchoring)
 * 应对 Payload 中包含未闭合 Python Dict、JSON 或复杂 String 导致传统匹配失败的情况
 */
function parseBidirectional10Fields(line: string): ParsedLogFields | null {
  const len = line.length;
  let idx = 0;

  // 1. 从左提取 Head 3 个字段: [Timestamp][Level][RequestId]
  while (idx < len && (line[idx] === ' ' || line[idx] === '\t')) idx++;
  if (line[idx] !== '[') return null;

  // Field 0: Timestamp
  const f0End = line.indexOf(']', idx);
  if (f0End === -1) return null;
  const timestamp = line.substring(idx + 1, f0End).trim();
  idx = f0End + 1;

  while (idx < len && (line[idx] === ' ' || line[idx] === '\t')) idx++;
  if (line[idx] !== '[') return null;

  // Field 1: Level
  const f1End = line.indexOf(']', idx);
  if (f1End === -1) return null;
  const levelRaw = line.substring(idx + 1, f1End).trim();
  idx = f1End + 1;

  while (idx < len && (line[idx] === ' ' || line[idx] === '\t')) idx++;
  if (line[idx] !== '[') return null;

  // Field 2: RequestID
  const f2End = line.indexOf(']', idx);
  if (f2End === -1) return null;
  const requestId = line.substring(idx + 1, f2End).trim();
  const headEndIndex = f2End + 1;

  // 2. 从右逆向提取 Tail 6 个字段: [FunctionName][ThreadID][MemoryAddress][Module][FileName][LineNumber]
  const tailFields: string[] = [];
  let rightIdx = len - 1;

  while (rightIdx >= 0 && (line[rightIdx] === ' ' || line[rightIdx] === '\t' || line[rightIdx] === '\r')) rightIdx--;

  for (let step = 0; step < 6; step++) {
    if (rightIdx <= headEndIndex || line[rightIdx] !== ']') {
      break;
    }
    const openBracketIdx = line.lastIndexOf('[', rightIdx);
    if (openBracketIdx === -1 || openBracketIdx < headEndIndex) {
      break;
    }
    const content = line.substring(openBracketIdx + 1, rightIdx).trim();
    tailFields.unshift(content);

    rightIdx = openBracketIdx - 1;
    while (rightIdx >= headEndIndex && (line[rightIdx] === ' ' || line[rightIdx] === '\t')) {
      rightIdx--;
    }
  }

  if (tailFields.length !== 6) {
    return null;
  }

  // 3. 中间截取 Field 3 (Operation Desc)
  let middleRaw = line.substring(headEndIndex, rightIdx + 1).trim();

  if (middleRaw.startsWith('[')) {
    middleRaw = middleRaw.substring(1);
  }
  if (middleRaw.endsWith(']')) {
    middleRaw = middleRaw.substring(0, middleRaw.length - 1);
  }
  const operationDesc = middleRaw.trim();

  let normalizedLevel = levelRaw.toUpperCase();
  if (normalizedLevel === 'WARNING') normalizedLevel = 'WARN';
  if (normalizedLevel === 'ERR') normalizedLevel = 'ERROR';
  if (normalizedLevel === 'CRITICAL') normalizedLevel = 'ERROR';

  return {
    timestamp,
    level: normalizedLevel,
    requestId,
    operationDesc,
    functionName: tailFields[0],
    threadId: tailFields[1],
    memoryAddress: tailFields[2],
    module: tailFields[3],
    fileName: tailFields[4],
    lineNumber: tailFields[5],
  };
}

/**
 * 尝试 3：柔性兜底解析 (Flexible Fallback Parser)
 * 处理无法精准匹配 10 字段的结构化/非结构化日志（如异常崩溃堆栈行）
 */
function parseFlexibleLogLine(line: string): ParsedLogFields {
  const timeRegex = /\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\]?/;
  const levelRegex = /\[?(INFO|WARN|WARNING|ERROR|ERR|DEBUG|TRACE|FATAL|CRITICAL)\]?/i;

  let timestamp = '-';
  let level = 'INFO';

  const timeMatch = line.match(timeRegex);
  if (timeMatch) {
    timestamp = timeMatch[1].trim();
  }

  const levelMatch = line.match(levelRegex);
  if (levelMatch) {
    let lvl = levelMatch[1].toUpperCase();
    if (lvl === 'WARNING') lvl = 'WARN';
    if (lvl === 'ERR') lvl = 'ERROR';
    if (lvl === 'CRITICAL') lvl = 'ERROR';
    level = lvl;
  }

  return {
    timestamp,
    level,
    requestId: '-',
    operationDesc: line,
    functionName: '-',
    threadId: '-',
    memoryAddress: '-',
    module: '-',
    fileName: '-',
    lineNumber: '-',
  };
}

export function parseSingleLogLine(lineText: string, index: number): LogEntry {
  const line = lineText.trimEnd();

  // 空行快速忽略处理
  if (!line || line.trim().length === 0) {
    return {
      id: index,
      lineNumber: index + 1,
      success: false,
      rawText: lineText,
      parseErrorReason: '空行数据',
    };
  }

  // 1. 尝试正向深度扫描
  let parsed = parseForwardBracketDepth(line);

  // 2. 尝试双向锚定扫描（解决未闭合/嵌套 Python Dict 等场景）
  if (!parsed) {
    parsed = parseBidirectional10Fields(line);
  }

  // 3. 如果是完全不匹配 10 字段的行（如崩溃堆栈行），使用柔性兜底解析
  if (!parsed) {
    parsed = parseFlexibleLogLine(line);
  }

  return {
    id: index,
    lineNumber: index + 1,
    success: true,
    fields: parsed,
    rawText: lineText,
  };
}

/**
 * 批量解析日志文本块，并计算解析耗时和统计信息
 */
export function parseLogContent(
  fullContent: string,
  fileName: string,
  fileSize: number
): { logs: LogEntry[]; stats: LogStats } {
  const startTime = performance.now();

  // 按行分割文本（兼容 Windows \r\n 与 Unix \n）
  const rawLines = fullContent.split(/\r?\n/);

  // 过滤掉文件末尾多余的纯空行
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  const totalCount = rawLines.length;
  const logs: LogEntry[] = new Array(totalCount);
  let successCount = 0;
  let failedCount = 0;
  const levelCounts: Record<string, number> = {
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    OTHER: 0,
  };

  for (let i = 0; i < totalCount; i++) {
    const entry = parseSingleLogLine(rawLines[i], i);
    logs[i] = entry;

    if (entry.success && entry.fields) {
      successCount++;
      const lvl = entry.fields.level;
      if (levelCounts[lvl] !== undefined) {
        levelCounts[lvl]++;
      } else {
        levelCounts.OTHER = (levelCounts.OTHER || 0) + 1;
      }
    } else {
      failedCount++;
    }
  }

  const endTime = performance.now();
  const parseDurationMs = Math.round((endTime - startTime) * 100) / 100;

  const stats: LogStats = {
    fileName,
    fileSize,
    totalCount,
    successCount,
    failedCount,
    parseDurationMs,
    levelCounts,
  };

  return { logs, stats };
}

/**
 * 格式化文件大小 (B, KB, MB, GB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
