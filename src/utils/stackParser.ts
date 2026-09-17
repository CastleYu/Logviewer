import { StackLanguage, StackPattern, StackTrace } from '../config/stackTypes';
import { parseJava } from './javaStack';
import { parsePython } from './pythonStack';

export function stackStart(line: string, next = ''): StackLanguage | undefined {
  if (StackPattern.python.test(line) || StackPattern.group.test(line)) return StackLanguage.Python;
  if (StackPattern.javaError.test(line) || (StackPattern.javaHead.test(line) && StackPattern.javaFrame.test(next))) return StackLanguage.Java;
  if (StackPattern.javaLink.test(line) || StackPattern.javaFrame.test(line)) return StackLanguage.Java;
  return undefined;
}

export function parseStack(text: string): StackTrace | undefined {
  const lines = text.split(StackPattern.lines);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const language = stackStart(lines[i], lines[i + 1]);
    if (!language) {
      offset += lines[i].length + (text[offset + lines[i].length] === '\r' ? 2 : 1);
      continue;
    }
    const raw = text.slice(offset);
    return language === StackLanguage.Python ? parsePython(raw) : parseJava(raw);
  }
  return undefined;
}

export function stackSummary(stack: StackTrace): string {
  const root = stack.exceptions.find((item) => item.parent === undefined);
  return root?.type ? `${root.type}${root.message ? `: ${root.message}` : ''}` : `${stack.language} 堆栈`;
}

export function frameCount(stack: StackTrace): number {
  return stack.exceptions.reduce((sum, item) => sum + item.frames.length, 0);
}
