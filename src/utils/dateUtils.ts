/**
 * 日期时间与固定 UTC 偏移转换工具。
 *
 * 日志时间戳默认按 UTC 解释；筛选输入则按用户选择的固定时区解释。
 */

function parseParts(value: string, endOfDay: boolean): number[] | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?$/,
  );
  if (!match) return null;

  const hasTime = match[4] !== undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = hasTime ? Number(match[4]) : endOfDay ? 23 : 0;
  const minute = hasTime ? Number(match[5]) : endOfDay ? 59 : 0;
  const second = match[6] !== undefined ? Number(match[6]) : endOfDay ? 59 : 0;
  const millisecond = match[7] !== undefined
    ? Number(match[7].padEnd(3, '0').slice(0, 3))
    : endOfDay ? 999 : 0;

  if (
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) return null;

  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  check.setUTCHours(hour, minute, second, millisecond);
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day || check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second ||
    check.getUTCMilliseconds() !== millisecond
  ) return null;

  return [year, month, day, hour, minute, second, millisecond];
}

function localMs(parts: number[]): number {
  const [year, month, day, hour, minute, second, millisecond] = parts;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, millisecond);
  return date.getTime();
}

function partsToUtc(parts: number[], offsetHours: number): number {
  const [year, month, day, hour, minute, second, millisecond] = parts;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime() - offsetHours * 3_600_000;
}

/** 解析日志时间戳为 Epoch 毫秒；无时区后缀时按 UTC 解释。 */
export function parseLogTimestampToMs(tsStr: string): number | null {
  if (!tsStr?.trim()) return null;

  const normalized = tsStr.trim().replace(',', '.');
  const zoneMatch = normalized.match(/(Z|([+-])(\d{2}):?(\d{2}))$/);
  const body = zoneMatch ? normalized.slice(0, -zoneMatch[1].length) : normalized;
  const parts = parseParts(body.trim(), false);
  if (!parts) return null;

  let offsetHours = 0;
  if (zoneMatch && zoneMatch[1] !== 'Z') {
    const hours = Number(zoneMatch[3]);
    const minutes = Number(zoneMatch[4]);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
    offsetHours = hours + minutes / 60;
    if (zoneMatch[2] === '-') offsetHours *= -1;
  }

  return partsToUtc(parts, offsetHours);
}

const FormatToken = /yyyy|yy|MM|dd|HH|mm|ss|S+|[^yMdHmsS]+/g;
const FormatDigits: Record<string, string> = { yyyy: '(\\d{4})', S: '(\\d{1,9})' };

/** 将 yyyy/MM/dd/HH/mm/ss/S 格式串转为正则与分量索引；其余字符按字面匹配。 */
function compileFormat(format: string): { regex: RegExp; order: string[] } | null {
  const order: string[] = [];
  let source = '';
  for (const token of format.match(FormatToken) || []) {
    if (/^[yMdHmsS]/.test(token)) {
      const kind = token[0];
      order.push(kind);
      source += FormatDigits[token] ?? FormatDigits[kind] ?? '(\\d{2})';
    } else source += token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return order.length ? { regex: new RegExp(`^${source}$`), order } : null;
}

/** 按 formats 解析时间文本，得到 parseParts 同构的分量；不匹配返回 null。 */
function parseByFormats(text: string, formats: string[]): number[] | null {
  for (const format of formats) {
    const compiled = compileFormat(format);
    const match = compiled?.regex.exec(text);
    if (!compiled || !match) continue;
    const parts = [1970, 1, 1, 0, 0, 0, 0];
    compiled.order.forEach((kind, index) => {
      const raw = match[index + 1];
      if (kind === 'y') parts[0] = raw.length === 2 ? 2000 + Number(raw) : Number(raw);
      else if (kind === 'M') parts[1] = Number(raw);
      else if (kind === 'd') parts[2] = Number(raw);
      else if (kind === 'H') parts[3] = Number(raw);
      else if (kind === 'm') parts[4] = Number(raw);
      else if (kind === 's') parts[5] = Number(raw);
      else parts[6] = Number(raw.padEnd(3, '0').slice(0, 3));
    });
    const [y, mo, d, h, mi, s, ms] = parts;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) continue;
    const check = new Date(0);
    check.setUTCFullYear(y, mo - 1, d);
    if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) continue;
    return [y, mo, d, h, mi, s, ms];
  }
  return null;
}

/** 按配置声明解释日志时间；带显式时区的值始终优先使用自身时区；ISO 样式失败后按 formats 解析。 */
export function parseConfiguredDateTime(
  tsStr: string,
  timezone: 'preserve' | 'utc' | 'local' = 'preserve',
  formats: string[] = [],
): number | null {
  if (!tsStr?.trim()) return null;
  const normalized = tsStr.trim().replace(',', '.');
  const explicit = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  let iso: number | null;
  if (explicit || timezone !== 'local') iso = parseLogTimestampToMs(normalized);
  else {
    const parts = parseParts(normalized, false);
    iso = parts ? localMs(parts) : null;
  }
  if (iso !== null) return iso;
  const parts = parseByFormats(tsStr.trim(), formats);
  if (!parts) return null;
  return timezone === 'local' ? localMs(parts) : partsToUtc(parts, 0);
}

/**
 * 将筛选输入解析为 Epoch 毫秒。
 * 开始边界向下补零；结束边界按输入精度补满（日期到当天末、分钟到该分钟末）。
 */
export function parseInputTimeToMs(
  inputStr: string,
  isUtcOffset: boolean,
  offsetHours: number = 8,
  endOfDay: boolean = false,
): number | null {
  if (!inputStr?.trim()) return null;
  const parts = parseParts(inputStr.trim().replace(',', '.'), endOfDay);
  if (!parts) return null;

  const offset = isUtcOffset && Number.isFinite(offsetHours) ? offsetHours : 0;
  if (offset < -12 || offset > 14) return null;
  return partsToUtc(parts, offset);
}

/** 将 UTC 毫秒格式化为 datetime-local 可用的固定时区墙上时间。 */
export function formatMsForInput(timeMs: number, offsetHours: number = 0): string {
  if (!Number.isFinite(timeMs)) return '';
  const date = new Date(timeMs + offsetHours * 3_600_000);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  const millisecond = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}`;
}
