/**
 * 日期时间与 UTC 转换工具库
 */

/**
 * 解析日志文本中的时间戳字符串为 Epoch 毫秒数 (ms)
 * 兼容格式：
 * - "2026-07-30 17:34:00,123" (逗号分隔毫秒)
 * - "2026-07-30 17:34:00.123"
 * - "2026-07-30T17:34:00.123Z"
 * - "2026-07-30T17:34:00"
 */
export function parseLogTimestampToMs(tsStr: string): number | null {
  if (!tsStr) return null;
  
  // 替换逗号毫秒为点毫秒 "2026-07-30 17:34:00,123" -> "2026-07-30 17:34:00.123"
  let normalized = tsStr.trim().replace(',', '.');
  
  // 如果中间是空格，替换为 T 方便 Date 解析 "2026-07-30 17:34:00.123" -> "2026-07-30T17:34:00.123"
  if (normalized.includes(' ') && !normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T');
  }

  // 尝试统一补齐标准 ISO，如果结尾没有时区标识，追加 Z (视为 UTC 基础)
  if (!normalized.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(normalized)) {
    normalized += 'Z';
  }

  const date = new Date(normalized);
  const timeMs = date.getTime();
  return isNaN(timeMs) ? null : timeMs;
}

/**
 * 解析用户在输入框/时间选择器中输入的当地时间，并根据 UTC 偏移量转化为精确匹配毫秒数
 * @param inputStr 形如 "2026-07-30T17:34:00.123" 或 "2026-07-30 17:34:00.123"
 * @param isUtcOffset 是否启用 UTC 转换 (配置启用后，假设输入的为当前时区如 GMT+8，自动减去 offsetHours 转换为 UTC 匹配)
 * @param offsetHours 时区小时差，默认 8 (GMT+8)
 */
export function parseInputTimeToMs(
  inputStr: string,
  isUtcOffset: boolean,
  offsetHours: number = 8
): number | null {
  if (!inputStr || !inputStr.trim()) return null;

  let str = inputStr.trim().replace(',', '.');
  if (str.includes(' ') && !str.includes('T')) {
    str = str.replace(' ', 'T');
  }

  // 解析数字
  // 支持格式: 2026-07-30T17:34:00.123
  const regex = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?)?$/;
  const match = str.match(regex);

  if (!match) {
    // 退化尝试标准的 Date.parse
    const d = new Date(str);
    const ms = d.getTime();
    if (isNaN(ms)) return null;
    if (isUtcOffset) {
      return ms - offsetHours * 3600 * 1000;
    }
    return ms;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hour = match[4] ? parseInt(match[4], 10) : 0;
  const minute = match[5] ? parseInt(match[5], 10) : 0;
  const second = match[6] ? parseInt(match[6], 10) : 0;
  let ms = match[7] ? parseInt(match[7].padEnd(3, '0'), 10) : 0;

  // 使用 Date.UTC 创建基准时间
  let utcTimestamp = Date.UTC(year, month, day, hour, minute, second, ms);

  // 如果启用了 UTC 自动转换（用户输入的为 GMT+8 当地时间，对应真正的 UTC 时间要减去 8 小时）
  if (isUtcOffset) {
    utcTimestamp -= offsetHours * 3600 * 1000;
  }

  return utcTimestamp;
}
