import { FrameKind, StackException, StackLanguage, StackPattern, StackRelation, StackStatus, StackTrace } from '../config/stackTypes';

export function parsePython(text: string): StackTrace {
  const exceptions: StackException[] = [];
  let current: StackException | undefined;
  let relation = StackRelation.Root;
  let status = StackStatus.Complete;
  for (const line of text.split(StackPattern.lines)) {
    if (StackPattern.group.test(line)) {
      status = StackStatus.Partial;
      continue;
    }
    if (StackPattern.cause.test(line) || StackPattern.context.test(line)) {
      relation = StackPattern.cause.test(line) ? StackRelation.Cause : StackRelation.Context;
      current = undefined;
      continue;
    }
    if (StackPattern.python.test(line)) {
      if (current && !current.type) status = StackStatus.Partial;
      current = { type: '', message: '', relation: StackRelation.Root, frames: [] };
      if (exceptions.length && relation !== StackRelation.Root) {
        // Python prints the earlier exception first. It belongs to the new exception.
        exceptions[exceptions.length - 1].parent = exceptions.length;
        exceptions[exceptions.length - 1].relation = relation;
      }
      exceptions.push(current);
      relation = StackRelation.Root;
      continue;
    }
    if (!line.trim()) continue;
    if (!current) { status = StackStatus.Partial; continue; }
    const frame = line.match(StackPattern.pyFrame);
    if (frame) {
      current.frames.push({ raw: line, file: frame[1], line: Number(frame[2]), name: frame[3] || '', kind: FrameKind.Source });
      continue;
    }
    if (StackPattern.indent.test(line) && !current.type && current.frames.length) {
      const last = current.frames[current.frames.length - 1];
      (last.source ??= []).push(line);
      continue;
    }
    const error = line.match(StackPattern.pyError);
    if (!current.type && error) {
      current.type = error[1];
      current.message = error[2] || '';
    } else {
      // Notes / custom formatting remain lossless in raw; do not claim full structure.
      status = StackStatus.Partial;
    }
  }
  if (!exceptions.length || exceptions.some((item) => !item.type) || relation !== StackRelation.Root) status = StackStatus.Partial;
  return { language: StackLanguage.Python, status, raw: text, exceptions };
}
