import { FrameKind, StackException, StackLanguage, StackPattern, StackRelation, StackStatus, StackText, StackTrace } from '../config/stackTypes';

export function parseJava(text: string): StackTrace {
  const exceptions: StackException[] = [];
  const levels: { indent: number; index: number }[] = [];
  let current: StackException | undefined;
  let status = StackStatus.Complete;
  for (const line of text.split(StackPattern.lines)) {
    if (!line.trim()) continue;
    const frame = line.match(StackPattern.javaFrame);
    if (frame && current) {
      const source = frame[2].match(StackPattern.source);
      const kind = frame[2] === StackText.native ? FrameKind.Native : source ? FrameKind.Source : FrameKind.Unknown;
      current.frames.push({ raw: line, name: frame[1], kind, ...(source ? { file: source[1], line: Number(source[2]) } : {}) });
      continue;
    }
    const more = line.match(StackPattern.more);
    if (more && current) { current.omitted = Number(more[1]); continue; }
    if (StackPattern.circular.test(line)) { status = StackStatus.Partial; continue; }
    const link = line.match(StackPattern.javaLink);
    const head = (link ? link[3] : line).match(StackPattern.javaHead);
    if (head && (!current || link)) {
      const indent = link ? link[1].replace(/\t/g, '    ').length : 0;
      const relation = !link ? StackRelation.Root : link[2] === StackText.suppressed ? StackRelation.Suppressed : StackRelation.Cause;
      while (levels.length && (relation === StackRelation.Suppressed ? levels.at(-1)!.indent >= indent : levels.at(-1)!.indent > indent)) levels.pop();
      const parent = link ? levels.at(-1)?.index : undefined;
      if (link && parent === undefined) status = StackStatus.Partial;
      current = { type: head[1], message: head[2] || '', relation, parent, frames: [] };
      exceptions.push(current);
      if (relation === StackRelation.Cause && levels.at(-1)?.indent === indent) levels.pop();
      levels.push({ indent, index: exceptions.length - 1 });
    } else {
      status = StackStatus.Partial;
    }
  }
  if (!exceptions.length || exceptions.some((item) => !item.frames.length && item.omitted === undefined)) status = StackStatus.Partial;
  return { language: StackLanguage.Java, status, raw: text, exceptions };
}
