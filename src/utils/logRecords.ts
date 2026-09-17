import { LogRecord, RecordMode, StackLanguage, StackPattern } from '../config/stackTypes';
import { parseStack, stackStart } from './stackParser';

function nextChain(lines: string[], start: number, isHead: (line: string) => boolean): number {
  for (let i = start; i < lines.length; i++) {
    if (isHead(lines[i]) || StackPattern.python.test(lines[i]) || stackStart(lines[i], lines[i + 1]) === StackLanguage.Java) break;
    if (StackPattern.cause.test(lines[i]) || StackPattern.context.test(lines[i])) return i;
  }
  return -1;
}

export function splitRecords(text: string, mode: `${RecordMode}`, isHead: (line: string) => boolean, message?: (line: string) => string, single?: (line: string) => boolean): LogRecord[] {
  const lines = text.split(StackPattern.lines);
  if (lines.at(-1) === '') lines.pop();
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + (text[offset + line.length] === '\r' ? 2 : 1);
  }
  const records: LogRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const start = i;
    let first = i;
    const active = mode === RecordMode.Stack && !single?.(lines[i]);
    const header = active && isHead(lines[i]);
    const body = header && message ? message(lines[i]) : lines[i];
    let language = active ? stackStart(body, lines[i + 1]) : undefined;
    if (!language && header && i + 1 < lines.length && !isHead(lines[i + 1])) {
      language = stackStart(lines[i + 1], lines[i + 2]);
      if (language) first = ++i;
    }
    if (language) {
      let ended = false;
      let noteEnd = -1;
      let group = StackPattern.group.test(lines[first]);
      for (let next = i + 1; next < lines.length; next++) {
        const line = lines[next];
        if (isHead(line)) break;
        if (language === StackLanguage.Python && ended && noteEnd < next) noteEnd = nextChain(lines, next, isHead);
        if (!line.trim()) {
          if (next < noteEnd) { i = next; continue; }
          // Chain separators may contain blanks; don't consume unrelated trailing blanks.
          let probe = next + 1;
          while (probe < lines.length && !lines[probe].trim()) probe++;
          if (probe < lines.length && (StackPattern.cause.test(lines[probe]) || StackPattern.context.test(lines[probe]) || (!ended && StackPattern.python.test(lines[probe])))) { i = next; continue; }
          break;
        }
        if (language === StackLanguage.Java) {
          if (!StackPattern.javaFrame.test(line) && !StackPattern.javaLink.test(line) && !StackPattern.more.test(line) && !StackPattern.circular.test(line)) break;
        } else {
          if (StackPattern.cause.test(line) || StackPattern.context.test(line)) ended = false;
          else if (StackPattern.python.test(line)) { if (ended) break; }
          else if (group && /^[\s|+]/.test(line)) { /* group retained as partial */ }
          else if (ended) {
            // Notes have no delimiter. Only attach ambiguous text when a following
            // chain marker proves it belongs to this traceback.
            if (noteEnd < next) break;
          }
          else if (StackPattern.pyFrame.test(line) || /^\s+\S/.test(line)) { /* frame / source */ }
          else if (StackPattern.pyError.test(line)) ended = true;
          else break;
          group ||= StackPattern.group.test(line);
        }
        i = next;
      }
    }
    const raw = text.slice(offsets[start], offsets[i] + lines[i].length);
    const stackText = language ? (first === start && header ? body + raw.slice(lines[start].length) : text.slice(offsets[first], offsets[i] + lines[i].length)) : '';
    records.push({ head: lines[start], raw, start: start + 1, end: i + 1, stack: stackText ? parseStack(stackText) : undefined });
  }
  return records;
}
