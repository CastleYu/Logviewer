import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, FolderOpen, Layers } from 'lucide-react';
import { StackTrace } from '../config/stackTypes';
import { StackMarkerKind, StackUiConst, TooltipConst } from '../config/uiConstants';
import { PinnedHighlight, ThemeMode } from '../types';
import { SourceApi } from '../services/sourceApi';
import { buildFoldedRows, buildStackAreas, StackAreaBlock, StackAreaLine, StackDisplayRow } from '../utils/stackClassify';
import { HighlightedText } from './HighlightedText';
import { useSource } from './SourceNavigation';
import { Tooltip } from './Tooltip';

/** 会话级折叠记忆（避免虚拟滚动复用行导致用户手动展开/折叠丢失；所有分区与依赖分组均默认展开） */
const sessionCollapsedAreas = new Set<string>();
const sessionCollapsedFolds = new Set<string>();

/** 堆栈行与依赖分组折叠行共享网格模板与首行垂直居中对齐 */
const STACK_ROW_GRID_CLS = 'grid w-full grid-cols-[44px_16px_minmax(0,1fr)] items-start min-h-[20px] leading-[20px] px-1';

export interface InlineStackTraceProps {
  logKey: string;
  stack: StackTrace;
  formatId: string;
  repository?: string;
  rawMode: boolean;
  wordWrap?: boolean;
  theme?: ThemeMode;
  highlight?: string;
  matchCase?: boolean;
  isRegex?: boolean;
  pinnedHighlights?: PinnedHighlight[];
  searchHighlight?: string;
  searchMatchCase?: boolean;
  searchIsRegex?: boolean;
  legacyHighlightStyle?: boolean;
  onToggleLayout?: () => void;
}

function StackMarkerIcon({ kind }: { kind?: StackMarkerKind }) {
  if (kind === StackMarkerKind.Exc) {
    return <span className="inline-block h-2 w-2 rounded-full bg-danger" aria-hidden="true" />;
  }
  if (kind === StackMarkerKind.Cause) {
    return <span className="inline-block h-2 w-2 rounded-full border-[1.5px] border-warn" aria-hidden="true" />;
  }
  if (kind === StackMarkerKind.Focus) {
    return <span className="inline-block h-3 w-[3px] rounded-full bg-danger" aria-hidden="true" />;
  }
  if (kind === StackMarkerKind.App) {
    return <span className="inline-block h-2 w-2 rounded-[2px] bg-accent" aria-hidden="true" />;
  }
  if (kind === StackMarkerKind.Lib) {
    return <span className="inline-block h-2 w-2 rounded-[2px] border border-ink-3" aria-hidden="true" />;
  }
  return null;
}

/** 图例提示内容，挂载在视图菜单堆栈解析开关的 Tooltip 中 */
export function StackLegendTooltipContent() {
  return (
    <div className="space-y-1.5 py-0.5">
      <div className="text-[11px] font-semibold text-ink">堆栈标记说明</div>
      <ul className="space-y-1">
        {StackUiConst.LegendItems.map((item) => (
          <li key={item.kind} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center">
              <StackMarkerIcon kind={item.kind} />
            </span>
            <span className="min-w-0">
              <strong className="font-medium text-ink">{item.label}</strong>
              <span className="ml-1 text-ink-3">{item.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 行内堆栈展示组件（M9 v3）：分区边框卡片、整行标题可点、默认全部展开、左侧快捷操作、依赖折叠与原文切换。
 */
export const InlineStackTrace: React.FC<InlineStackTraceProps> = ({
  logKey,
  stack,
  formatId,
  repository,
  rawMode,
  wordWrap = true,
  theme = 'dark',
  highlight,
  matchCase,
  isRegex,
  pinnedHighlights,
  searchHighlight,
  searchMatchCase,
  searchIsRegex,
  legacyHighlightStyle,
  onToggleLayout,
}) => {
  const source = useSource();
  const [, setVersion] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rawCopied, setRawCopied] = useState(false);

  const prefixRule = source.prefixes[formatId];
  const areas = useMemo(
    () => buildStackAreas(stack, repository, source.roots, prefixRule),
    [stack, repository, source.roots, prefixRule],
  );

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), TooltipConst.CopyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  useEffect(() => {
    if (!rawCopied) return;
    const timer = window.setTimeout(() => setRawCopied(false), TooltipConst.CopyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [rawCopied]);

  const bumpLayout = () => {
    setVersion((v) => v + 1);
    onToggleLayout?.();
  };

  const toggleArea = (areaKey: string) => {
    if (sessionCollapsedAreas.has(areaKey)) sessionCollapsedAreas.delete(areaKey);
    else sessionCollapsedAreas.add(areaKey);
    bumpLayout();
  };

  const toggleFold = (foldKey: string) => {
    if (sessionCollapsedFolds.has(foldKey)) sessionCollapsedFolds.delete(foldKey);
    else sessionCollapsedFolds.add(foldKey);
    bumpLayout();
  };

  const copyText = async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) setCopiedId(id);
      else setRawCopied(true);
    } catch {
      source.notify('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const openFrameSource = async (line: StackAreaLine, triggerEl: HTMLElement) => {
    if (!line.file) return;
    const targetLine = line.line && line.line > 0 ? line.line : 1;
    try {
      const matches = await SourceApi.lookup(line.file);
      if (!matches.length) {
        source.notify(`未在源码索引中找到 ${line.file}，请检查索引目录设置`);
        return;
      }
      if (matches.length === 1) {
        const result = await SourceApi.open({ file: line.file, line: targetLine }, matches[0].path, source.overrideId || undefined);
        source.notify(result.message || `已打开 ${matches[0].path}:${targetLine}`);
        return;
      }
      const rect = triggerEl.getBoundingClientRect();
      source.choose({
        target: { file: line.file, line: targetLine },
        matches,
        x: rect.left,
        y: rect.bottom + 4,
        light: theme === 'light',
      });
    } catch (cause) {
      source.notify((cause as Error).message || '打开源码失败');
    }
  };

  const renderHighlighted = (text: string, extraClass = '') => (
    <HighlightedText
      text={text}
      highlight={highlight}
      matchCase={matchCase}
      isRegex={isRegex}
      pinnedHighlights={pinnedHighlights}
      searchHighlight={searchHighlight}
      searchMatchCase={searchMatchCase}
      searchIsRegex={searchIsRegex}
      theme={theme}
      legacyHighlightStyle={legacyHighlightStyle}
      className={extraClass}
    />
  );

  if (rawMode) {
    return (
      <div
        className="group/raw relative mt-1.5 rounded-[6px] border border-line bg-sunken px-2.5 py-1.5 font-mono text-[12px] leading-[1.45] text-ink-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-ink-3 select-none">
          <span>堆栈原文（Alt+S 切回解析视图）</span>
          <Tooltip text="复制完整堆栈原文">
            <button
              type="button"
              aria-label="复制完整堆栈原文"
              onClick={() => void copyText(stack.raw)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-2 hover:bg-raised hover:text-ink"
            >
              {rawCopied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
              <span>{rawCopied ? '已复制' : '复制原文'}</span>
            </button>
          </Tooltip>
        </div>
        <pre className={wordWrap ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto whitespace-pre'}>
          {renderHighlighted(stack.raw)}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="mt-1.5 flex flex-col gap-1.5 font-mono text-[12px]"
      onClick={(event) => event.stopPropagation()}
    >
      {areas.map((area: StackAreaBlock) => {
        const areaKey = `${logKey}:${area.id}`;
        const expanded = !sessionCollapsedAreas.has(areaKey);
        const isFinal = area.headerMarker === StackMarkerKind.Exc;
        const borderClass = isFinal ? 'border-danger/35' : 'border-warn/35';
        const headerClass = isFinal
          ? 'bg-danger-soft/55 hover:bg-danger-soft/85 text-danger'
          : 'bg-warn-soft/55 hover:bg-warn-soft/85 text-warn';
        const rows: StackDisplayRow[] = expanded ? buildFoldedRows(areaKey, area.lines, sessionCollapsedFolds) : [];

        return (
          <React.Fragment key={area.id}>
            {area.separator ? (
              <div className="px-0.5 text-[11px] italic leading-4 text-ink-3 select-none">{area.separator}</div>
            ) : null}
            <section className={`overflow-hidden rounded-[6px] border ${borderClass} bg-surface`}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleArea(areaKey)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left transition-colors ${headerClass}`}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                />
                <Tooltip text={area.headerReason}>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <StackMarkerIcon kind={area.headerMarker} />
                  </span>
                </Tooltip>
                <span className={`min-w-0 flex-1 font-medium ${wordWrap ? 'whitespace-pre-wrap break-all' : 'truncate'}`}>
                  {renderHighlighted(area.headerRaw)}
                </span>
                <Tooltip text={`该异常包含 ${area.frameCount} 个栈帧`}>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-surface/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-2">
                    <Layers className="h-3 w-3 text-ink-3" />
                    {area.frameCount}
                  </span>
                </Tooltip>
              </button>

              {expanded && rows.length > 0 ? (
                <div className="border-t border-line/60 py-1">
                  {rows.map((row, rowIdx) => {
                    if (row.type === 'fold') {
                      const foldLabel = row.expanded
                        ? `收起 ${row.count} 个依赖帧`
                        : `展开 ${row.count} 个依赖帧`;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          aria-expanded={row.expanded}
                          aria-label={foldLabel}
                          onClick={() => toggleFold(row.id)}
                          className={`${STACK_ROW_GRID_CLS} text-left text-slate-600 transition-colors hover:bg-raised/80 hover:text-ink-2 dark:text-slate-400`}
                        >
                          <span className="h-5" aria-hidden="true" />
                          <span className="flex h-5 w-4 items-center justify-center">
                            <span className="flex h-4 w-4 items-center justify-center">
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${row.expanded ? 'rotate-90' : ''}`}
                                aria-hidden="true"
                              />
                            </span>
                          </span>
                          <span className="h-5" aria-hidden="true" />
                        </button>
                      );
                    }

                    const line = row.line;
                    const isFrame = line.kind === 'frame';
                    let parentFrame: StackAreaLine | undefined;
                    if (line.kind === 'source') {
                      for (let j = rowIdx - 1; j >= 0; j--) {
                        const prev = rows[j];
                        if (prev.type !== 'line') break;
                        if (prev.line.kind === 'frame') {
                          parentFrame = prev.line;
                          break;
                        }
                        if (prev.line.kind !== 'source') break;
                      }
                    }
                    const isFocusFrame = line.marker === StackMarkerKind.Focus;
                    const isFocusSource = line.kind === 'source' && parentFrame?.marker === StackMarkerKind.Focus;
                    const isFocusEmphasis = isFocusFrame || isFocusSource;
                    const isLib = line.marker === StackMarkerKind.Lib || (line.kind === 'source' && parentFrame?.marker === StackMarkerKind.Lib);
                    const canOpen = isFrame && !isLib && Boolean(line.file);
                    const isCopied = copiedId === line.id;
                    const rowBg = isFocusEmphasis ? 'bg-danger-soft/50 hover:bg-danger-soft/75' : 'hover:bg-raised/70';
                    const textTone = isFocusEmphasis
                      ? 'font-medium text-ink'
                      : isLib
                        ? 'text-slate-600 dark:text-slate-400'
                        : line.kind === 'traceback' || line.kind === 'more' || line.kind === 'source'
                          ? 'text-ink-3'
                          : 'text-ink';

                    return (
                      <div
                        key={line.id}
                        className={`group/row ${STACK_ROW_GRID_CLS} ${rowBg}`}
                      >
                        <div
                          className={`flex h-5 items-center justify-end gap-0.5 pr-1 transition-opacity ${
                            isFocusFrame ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
                          }`}
                        >
                          {isFrame && line.copyLocation ? (
                            <Tooltip text={isCopied ? '已复制定位' : `复制 ${line.copyLocation}`}>
                              <button
                                type="button"
                                aria-label={`复制 ${line.copyLocation}`}
                                onClick={() => void copyText(line.copyLocation!, line.id)}
                                className="flex h-[18px] w-[18px] items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink"
                              >
                                {isCopied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </Tooltip>
                          ) : null}
                          {isFrame ? (
                            <Tooltip
                              text={
                                isLib
                                  ? '依赖代码帧不支持直接打开源码'
                                  : !line.file
                                    ? '该栈帧无源文件路径信息'
                                    : `在编辑器中打开 ${line.file}${line.line ? `:${line.line}` : ''}`
                              }
                            >
                              <button
                                type="button"
                                disabled={!canOpen}
                                aria-label={`打开源码 ${line.file || ''}`}
                                onClick={(event) => void openFrameSource(line, event.currentTarget)}
                                className="flex h-[18px] w-[18px] items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-accent-ink disabled:pointer-events-none disabled:opacity-30"
                              >
                                <FolderOpen className="h-3 w-3" />
                              </button>
                            </Tooltip>
                          ) : null}
                        </div>

                        <div className="flex h-5 w-4 items-center justify-center">
                          {line.marker ? (
                            <Tooltip text={line.reason || ''}>
                              <span className="flex h-4 w-4 items-center justify-center">
                                <StackMarkerIcon kind={line.marker} />
                              </span>
                            </Tooltip>
                          ) : null}
                        </div>

                        <div className={`min-w-0 pr-2 ${textTone} ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'}`}>
                          {renderHighlighted(line.raw)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          </React.Fragment>
        );
      })}
    </div>
  );
};
