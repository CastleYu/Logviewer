import { StackLanguage, StackTrace } from '../config/stackTypes';
import { StackMarkerKind, StackUiConst } from '../config/uiConstants';
import { StackPrefixRule } from '../components/SourceNavigation';

export interface StackAreaLine {
  id: string;
  raw: string;
  kind: 'traceback' | 'frame' | 'source' | 'more' | 'other';
  marker?: StackMarkerKind;
  reason?: string;
  file?: string;
  line?: number;
  copyLocation?: string;
  fqcn?: string;
}

export interface StackAreaBlock {
  id: string;
  separator?: string;
  headerRaw: string;
  headerMarker: StackMarkerKind.Exc | StackMarkerKind.Cause;
  headerReason: string;
  frameCount: number;
  lines: StackAreaLine[];
}

export type StackDisplayRow =
  | { type: 'line'; line: StackAreaLine }
  | { type: 'fold'; id: string; count: number; indent: string; expanded: boolean; lines: StackAreaLine[] };

function normPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function isUnderRoot(filePath: string, rootPath: string): boolean {
  const f = normPath(filePath);
  const r = normPath(rootPath);
  if (!f || !r) return false;
  if (f.startsWith(`${r}/`) || f === r) return true;
  const repoName = r.split('/').filter(Boolean).pop();
  if (repoName && (f.startsWith(`${repoName}/`) || f.includes(`/${repoName}/`))) return true;
  return false;
}

function matchPrefix(target: string, prefixes: string[]): string | null {
  if (!target || prefixes.length === 0) return null;
  const normTarget = target.replace(/\\/g, '/').toLowerCase();
  for (const raw of prefixes) {
    const clean = raw.trim().replace(/\\/g, '/').toLowerCase();
    if (!clean) continue;
    if (normTarget.startsWith(clean) || normTarget.includes(`/${clean}`)) return raw.trim();
  }
  return null;
}

function classifyFrame(
  file: string | undefined,
  fqcn: string | undefined,
  raw: string,
  repository: string | undefined,
  indexedRoots: string[],
  prefixRule?: StackPrefixRule,
): { marker: StackMarkerKind.App | StackMarkerKind.Lib; reason: string } {
  const pathStr = file || '';
  const symbolStr = fqcn || '';

  // 1. 绑定源码仓库或已建索引目录
  if (repository && pathStr && isUnderRoot(pathStr, repository)) {
    return { marker: StackMarkerKind.App, reason: `业务代码 · 命中绑定仓库 (${repository.split(/[/\\]/).pop() || repository})` };
  }
  for (const root of indexedRoots) {
    if (pathStr && isUnderRoot(pathStr, root)) {
      return { marker: StackMarkerKind.App, reason: `业务代码 · 命中源码索引 (${root.split(/[/\\]/).pop() || root})` };
    }
  }

  // 2. 用户配置业务包/路径前缀
  const appHit = matchPrefix(symbolStr, prefixRule?.app || []) || matchPrefix(pathStr, prefixRule?.app || []);
  if (appHit) {
    return { marker: StackMarkerKind.App, reason: `业务代码 · 命中配置前缀 "${appHit}"` };
  }

  // 3. 用户配置依赖包/路径前缀
  const libHit = matchPrefix(symbolStr, prefixRule?.lib || []) || matchPrefix(pathStr, prefixRule?.lib || []);
  if (libHit) {
    return { marker: StackMarkerKind.Lib, reason: `依赖代码 · 命中配置前缀 "${libHit}"` };
  }

  // 4. 内置依赖路径与包前缀规则
  for (const rule of StackUiConst.BuiltInLibPatterns) {
    if ((pathStr && rule.pattern.test(pathStr)) || (symbolStr && rule.pattern.test(symbolStr)) || rule.pattern.test(raw.trim())) {
      return { marker: StackMarkerKind.Lib, reason: `依赖代码 · ${rule.label}` };
    }
  }

  // 5. 默认兜底业务代码
  return { marker: StackMarkerKind.App, reason: '业务代码 · 未命中依赖规则，默认归类为业务栈帧' };
}

function parsePythonFrameLine(line: string): { file: string; line?: number } | null {
  const match = line.match(/^\s*File\s+"([^"]+)",\s*line\s+(\d+)/);
  if (!match) return null;
  return { file: match[1], line: Number(match[2]) };
}

function parseJavaFrameLine(line: string): { fqcn: string; file?: string; line?: number } | null {
  const match = line.match(/^\s*at\s+([^(]+)\(([^)]*)\)/);
  if (!match) return null;
  const fqcn = match[1].trim();
  const loc = match[2].trim();
  const locMatch = loc.match(/^(.+?):(\d+)$/);
  if (locMatch) {
    return { fqcn, file: locMatch[1], line: Number(locMatch[2]) };
  }
  return { fqcn, file: loc === 'Native Method' || loc === 'Unknown Source' ? undefined : loc };
}

function isPythonExceptionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /^\s/.test(line)) return false;
  if (trimmed.startsWith('Traceback (')) return false;
  if (StackUiConst.PythonSeparators.some((s) => trimmed === s)) return false;
  return /^[A-Za-z_][\w.]*(?::.*)?$/.test(trimmed);
}

function assignFocusFrame(lines: StackAreaLine[], pickLast: boolean): void {
  const indices: number[] = [];
  lines.forEach((item, idx) => {
    if (item.kind === 'frame' && item.marker === StackMarkerKind.App) indices.push(idx);
  });
  if (indices.length === 0) return;
  const focusIdx = pickLast ? indices[indices.length - 1] : indices[0];
  const target = lines[focusIdx];
  target.marker = StackMarkerKind.Focus;
  target.reason = `建议关注帧（最接近抛出点）· ${target.reason || '业务代码'}`;
}

function parsePythonAreas(
  rawLines: string[],
  repository: string | undefined,
  indexedRoots: string[],
  prefixRule?: StackPrefixRule,
): StackAreaBlock[] {
  const rawChunks: { separator?: string; lines: string[] }[] = [];
  let current: { separator?: string; lines: string[] } = { lines: [] };

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (StackUiConst.PythonSeparators.some((s) => trimmed === s)) {
      if (current.lines.length > 0) rawChunks.push(current);
      current = { separator: trimmed, lines: [] };
      continue;
    }
    current.lines.push(raw);
    if (isPythonExceptionLine(raw) && current.lines.some((l) => /^\s*File\s+"/.test(l))) {
      rawChunks.push(current);
      current = { lines: [] };
    }
  }
  if (current.lines.length > 0) rawChunks.push(current);

  const nonEmpty = rawChunks.filter((c) => c.lines.some((l) => l.trim().length > 0));
  return nonEmpty.map((chunk, chunkIdx) => {
    const isFinal = chunkIdx === nonEmpty.length - 1;
    let headerIndex = -1;
    for (let i = chunk.lines.length - 1; i >= 0; i--) {
      if (chunk.lines[i].trim()) {
        if (isPythonExceptionLine(chunk.lines[i])) headerIndex = i;
        break;
      }
    }
    const headerRaw = headerIndex >= 0 ? chunk.lines[headerIndex].trim() : 'Python Traceback';
    const bodyRawLines = headerIndex >= 0 ? chunk.lines.filter((_, idx) => idx !== headerIndex) : chunk.lines;

    const areaLines: StackAreaLine[] = [];
    let frameCount = 0;

    bodyRawLines.forEach((raw, idx) => {
      if (!raw.trim()) return;
      const trimmed = raw.trim();
      if (trimmed.startsWith('Traceback (')) {
        areaLines.push({ id: `${chunkIdx}-tb-${idx}`, raw, kind: 'traceback' });
        return;
      }
      const pyFrame = parsePythonFrameLine(raw);
      if (pyFrame) {
        frameCount++;
        const { marker, reason } = classifyFrame(pyFrame.file, undefined, raw, repository, indexedRoots, prefixRule);
        const copyLocation = pyFrame.line ? `${pyFrame.file}:${pyFrame.line}` : pyFrame.file;
        areaLines.push({
          id: `${chunkIdx}-f-${idx}`,
          raw,
          kind: 'frame',
          marker,
          reason,
          file: pyFrame.file,
          line: pyFrame.line,
          copyLocation,
        });
        return;
      }
      areaLines.push({
        id: `${chunkIdx}-s-${idx}`,
        raw,
        kind: /^\s+/.test(raw) ? 'source' : 'other',
      });
    });

    assignFocusFrame(areaLines, true);

    return {
      id: `py-area-${chunkIdx}`,
      separator: chunk.separator,
      headerRaw,
      headerMarker: isFinal ? StackMarkerKind.Exc : StackMarkerKind.Cause,
      headerReason: isFinal ? '最终抛出异常（调用方直接捕获的顶层异常）' : '前置 / 直接原因异常',
      frameCount,
      lines: areaLines,
    };
  });
}

function parseJavaAreas(
  rawLines: string[],
  repository: string | undefined,
  indexedRoots: string[],
  prefixRule?: StackPrefixRule,
): StackAreaBlock[] {
  const blocks: { headerRaw: string; lines: string[]; kind: StackMarkerKind.Exc | StackMarkerKind.Cause }[] = [];
  let current: { headerRaw: string; lines: string[]; kind: StackMarkerKind.Exc | StackMarkerKind.Cause } | null = null;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const isCause = /^Caused by:\s*/i.test(trimmed) || /^Suppressed:\s*/i.test(trimmed);
    if (!current) {
      current = { headerRaw: raw.trimEnd(), lines: [], kind: StackMarkerKind.Exc };
    } else if (isCause) {
      blocks.push(current);
      current = { headerRaw: raw.trimEnd(), lines: [], kind: StackMarkerKind.Cause };
    } else {
      current.lines.push(raw);
    }
  }
  if (current) blocks.push(current);

  return blocks.map((block, blockIdx) => {
    const areaLines: StackAreaLine[] = [];
    let frameCount = 0;

    block.lines.forEach((raw, idx) => {
      const trimmed = raw.trim();
      const jFrame = parseJavaFrameLine(raw);
      if (jFrame) {
        frameCount++;
        const { marker, reason } = classifyFrame(jFrame.file, jFrame.fqcn, raw, repository, indexedRoots, prefixRule);
        const copyLocation = jFrame.file && jFrame.line ? `${jFrame.file}:${jFrame.line}` : jFrame.fqcn;
        areaLines.push({
          id: `${blockIdx}-jf-${idx}`,
          raw,
          kind: 'frame',
          marker,
          reason,
          file: jFrame.file,
          line: jFrame.line,
          fqcn: jFrame.fqcn,
          copyLocation,
        });
        return;
      }
      if (/^\.\.\.\s*\d+\s+more$/i.test(trimmed) || /^\.\.\.\s*\d+\s+common frames omitted$/i.test(trimmed)) {
        areaLines.push({ id: `${blockIdx}-m-${idx}`, raw, kind: 'more' });
        return;
      }
      areaLines.push({ id: `${blockIdx}-o-${idx}`, raw, kind: 'other' });
    });

    assignFocusFrame(areaLines, false);

    return {
      id: `java-area-${blockIdx}`,
      headerRaw: block.headerRaw,
      headerMarker: block.kind,
      headerReason: block.kind === StackMarkerKind.Exc ? '最终抛出异常（顶层异常）' : 'Caused by / Suppressed 根因异常',
      frameCount,
      lines: areaLines,
    };
  });
}

function buildFallbackAreas(
  stack: StackTrace,
  repository: string | undefined,
  indexedRoots: string[],
  prefixRule?: StackPrefixRule,
): StackAreaBlock[] {
  return stack.exceptions.map((exc, excIdx) => {
    const isJava = stack.language === StackLanguage.Java;
    const isFinal = isJava ? excIdx === 0 : excIdx === stack.exceptions.length - 1;
    const lines: StackAreaLine[] = exc.frames.map((frame, fIdx) => {
      const { marker, reason } = classifyFrame(frame.file, frame.name, frame.raw, repository, indexedRoots, prefixRule);
      return {
        id: `fb-${excIdx}-${fIdx}`,
        raw: frame.raw,
        kind: 'frame',
        marker,
        reason,
        file: frame.file,
        line: frame.line,
        fqcn: frame.name,
        copyLocation: frame.file && frame.line ? `${frame.file}:${frame.line}` : frame.name,
      };
    });
    assignFocusFrame(lines, !isJava);
    return {
      id: `fb-area-${excIdx}`,
      headerRaw: exc.message ? `${exc.type}: ${exc.message}` : exc.type,
      headerMarker: isFinal ? StackMarkerKind.Exc : StackMarkerKind.Cause,
      headerReason: isFinal ? '最终抛出异常' : '关联原因异常',
      frameCount: exc.frames.length,
      lines,
    };
  });
}

/**
 * 将 StackTrace 解析为带分区与五类标记的 v3 展示块。
 */
export function buildStackAreas(
  stack: StackTrace,
  repository: string | undefined,
  indexedRoots: string[],
  prefixRule?: StackPrefixRule,
): StackAreaBlock[] {
  const rawLines = stack.raw ? stack.raw.split(/\r?\n/) : [];
  const hasPython =
    stack.language === StackLanguage.Python ||
    rawLines.some((l) => /^\s*File\s+"[^"]+",\s*line\s+\d+/.test(l) || /^Traceback \(most recent call last\):/.test(l.trim()));
  const hasJava =
    stack.language === StackLanguage.Java ||
    rawLines.some((l) => /^\s*at\s+[^(]+\([^)]*\)/.test(l));

  if (hasPython && rawLines.length > 0) {
    const parsed = parsePythonAreas(rawLines, repository, indexedRoots, prefixRule);
    if (parsed.length > 0) return parsed;
  }
  if (hasJava && rawLines.length > 0) {
    const parsed = parseJavaAreas(rawLines, repository, indexedRoots, prefixRule);
    if (parsed.length > 0) return parsed;
  }
  return buildFallbackAreas(stack, repository, indexedRoots, prefixRule);
}

/**
 * 将连续 >= 2 个依赖代码帧（以及附带的 Python 源码预览行）组织为可折叠分组；默认全部展开，用户点击可收起或再展开。
 */
export function buildFoldedRows(areaId: string, lines: StackAreaLine[], collapsedFoldIds: Set<string>): StackDisplayRow[] {
  // 将 frame 与其紧邻的 Python source 行打成逻辑单元，避免拆散帧与源码预览
  const groups: { isLib: boolean; lines: StackAreaLine[]; indent: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];
    if (item.kind === 'frame') {
      const grouped = [item];
      while (i + 1 < lines.length && lines[i + 1].kind === 'source') {
        i++;
        grouped.push(lines[i]);
      }
      const indentMatch = item.raw.match(/^(\s*)/);
      groups.push({
        isLib: item.marker === StackMarkerKind.Lib,
        lines: grouped,
        indent: indentMatch ? indentMatch[1] : '',
      });
    } else {
      groups.push({ isLib: false, lines: [item], indent: '' });
    }
  }

  const rows: StackDisplayRow[] = [];
  let libRun: { count: number; indent: string; lines: StackAreaLine[]; startIdx: number } | null = null;

  const flushRun = () => {
    if (!libRun) return;
    const foldId = `${areaId}-fold-${libRun.startIdx}`;
    if (libRun.count >= StackUiConst.FoldMinLibFrames) {
      const expanded = !collapsedFoldIds.has(foldId);
      rows.push({
        type: 'fold',
        id: foldId,
        count: libRun.count,
        indent: libRun.indent,
        expanded,
        lines: libRun.lines,
      });
      if (expanded) {
        libRun.lines.forEach((l) => rows.push({ type: 'line', line: l }));
      }
    } else {
      libRun.lines.forEach((l) => rows.push({ type: 'line', line: l }));
    }
    libRun = null;
  };

  groups.forEach((grp, idx) => {
    if (grp.isLib) {
      if (!libRun) {
        libRun = { count: 1, indent: grp.indent, lines: [...grp.lines], startIdx: idx };
      } else {
        libRun.count += 1;
        libRun.lines.push(...grp.lines);
      }
    } else {
      flushRun();
      grp.lines.forEach((l) => rows.push({ type: 'line', line: l }));
    }
  });
  flushRun();
  return rows;
}

/**
 * 从展示用消息文本中剔除已由 InlineStackTrace 独立渲染的堆栈原文，避免同一行出现两份堆栈。
 * 仅用于表格单元格展示，不修改 entry.rawText 与 entry.fields 原始数据。
 */
export function stripStackFromMessage(text: string, stackRaw?: string): string {
  if (!text || !stackRaw) return text;
  const trimEdges = (before: string, after: string) => {
    const head = before.replace(/[\r\n]+$/, '').trimEnd();
    const tail = after.replace(/^[\r\n]+/, '').trimStart();
    if (head && tail) return `${head}\n${tail}`;
    return head || tail;
  };
  const exactIdx = text.indexOf(stackRaw);
  if (exactIdx >= 0) {
    return trimEdges(text.slice(0, exactIdx), text.slice(exactIdx + stackRaw.length));
  }
  const normText = text.replace(/\r\n/g, '\n');
  const normStack = stackRaw.replace(/\r\n/g, '\n').trimEnd();
  if (!normStack) return text;
  const normIdx = normText.indexOf(normStack);
  if (normIdx >= 0) {
    return trimEdges(normText.slice(0, normIdx), normText.slice(normIdx + normStack.length));
  }
  return normText.trim() === normStack.trim() ? '' : text;
}
