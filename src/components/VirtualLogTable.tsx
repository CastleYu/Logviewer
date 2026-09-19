import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { LogEntry, DisplayDensity, ColumnVisibility, FilterOptions, ColumnWidths, ThemeMode, BorderIntensity, ColumnFilterKey, FilterValue, LogLevel } from '../types';
import { StackCell } from './StackCell';
import { stackSummary, frameCount } from '../utils/stackParser';
import { HighlightedText } from './HighlightedText';
import { SourceMenuItem } from './SourceNavigation';
import { sourceField } from '../utils/sourceUtils';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import { CopyActionPopover, HeaderCopyButton, copyActionToClipboard } from './CopyActionPopover';
import { CopyPlacement, LogFormatConfig, RuntimeCopyAction } from '../config/logFormatTypes';
import { copyActions, copyActionsAt } from '../utils/logCopyUtils';
import { isNumericFilterActive, isTextFilterActive } from '../utils/columnFilterUtils';
import { 
  AlertOctagon, 
  Terminal, 
  Copy, 
  Check, 
  FileText, 
  ChevronUp,
  ChevronDown,
  Filter
} from 'lucide-react';

interface VirtualLogTableProps {
  logs: LogEntry[];
  onOpenStack: (log: LogEntry) => void;
  onAnalyze?: (logs: LogEntry[]) => void;
  format: LogFormatConfig;
  density: DisplayDensity;
  columnVisibility: ColumnVisibility;
  selectedIds: Set<number>;
  onSelectionChange: (newSelectedIds: Set<number>) => void;
  highlightKeyword?: string;
  highlightMatchCase?: boolean;
  highlightIsRegex?: boolean;
  matchCase?: boolean;
  wordWrap?: boolean;
  filter: FilterOptions;
  activeSearchLogId?: number | null;
  searchKeyword?: string;
  searchMatchCase?: boolean;
  searchIsRegex?: boolean;
  // 自定义列宽与主题配置
  columnWidths?: ColumnWidths;
  onColumnWidthsChange?: (widths: ColumnWidths) => void;
  theme: ThemeMode;
  borderIntensity?: BorderIntensity;
  jumpToLine?: { line: number; timestamp: number } | null;
  targetNavLog?: { id: number; timestamp: number } | null;
  onFirstVisibleIndexChange?: (index: number) => void;
  legacyBoldSelection?: boolean;
  legacyHighlightStyle?: boolean;
  onFilterChange: (updated: Partial<FilterOptions>) => void;
  uniqueModules: string[];
  uniqueThreads: string[];
  timeRange: [number, number] | null;
}

interface ContextMenuState {
  field: string;
  x: number;
  y: number;
  log: LogEntry;
}

const defaultWidths: ColumnWidths = {
  index: 48,
  timestamp: 176,
  level: 72,
  requestId: 112,
  operationDesc: 380,
  functionName: 160,
  threadId: 80,
  memoryAddress: 128,
  module: 112,
  fileName: 144,
  lineNumber: 64,
};

const minColumnWidths: Record<keyof ColumnWidths, number> = {
  index: 36,
  timestamp: 110,
  level: 56,
  requestId: 80,
  operationDesc: 120,
  functionName: 80,
  threadId: 60,
  memoryAddress: 80,
  module: 80,
  fileName: 80,
  lineNumber: 48,
};

interface HeaderFilterButtonProps {
  label: string;
  active: boolean;
  isLight: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function HeaderFilterButton({ label, active, isLight, onClick }: HeaderFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`筛选${label}`}
      aria-pressed={active}
      title={`筛选${label}`}
      className={`relative z-10 mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active
          ? isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'
          : isLight ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-700' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <Filter className="w-3 h-3" />
      {active ? <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-indigo-500" /> : null}
    </button>
  );
}

function filterOptions(column: ColumnFilterKey, modules: string[], threads: string[]): string[] {
  if (column === ColumnFilterKey.Level) {
    return [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error, FilterValue.FailedOnly];
  }
  if (column === ColumnFilterKey.Module) return modules;
  if (column === ColumnFilterKey.ThreadId) return threads;
  return [];
}

function isFilterActive(column: ColumnFilterKey, filter: FilterOptions): boolean {
  switch (column) {
    case ColumnFilterKey.Index: return isNumericFilterActive(filter.columnFilters.index);
    case ColumnFilterKey.Timestamp: return Boolean(filter.startTime || filter.endTime);
    case ColumnFilterKey.Level: return filter.selectedLevels.some((value) => value !== FilterValue.All);
    case ColumnFilterKey.Module: return filter.selectedModule !== FilterValue.All;
    case ColumnFilterKey.ThreadId: return filter.selectedThread !== FilterValue.All;
    case ColumnFilterKey.RequestId: return isTextFilterActive(filter.columnFilters.requestId);
    case ColumnFilterKey.OperationDesc: return isTextFilterActive(filter.columnFilters.operationDesc);
    case ColumnFilterKey.FunctionName: return isTextFilterActive(filter.columnFilters.functionName);
    case ColumnFilterKey.MemoryAddress: return isTextFilterActive(filter.columnFilters.memoryAddress);
    case ColumnFilterKey.FileName: return isTextFilterActive(filter.columnFilters.fileName);
  }
}

export const VirtualLogTable: React.FC<VirtualLogTableProps> = ({
  logs,
  onOpenStack,
  onAnalyze,
  format,
  density,
  columnVisibility,
  selectedIds,
  onSelectionChange,
  highlightKeyword = '',
  highlightMatchCase = false,
  highlightIsRegex = false,
  matchCase = false,
  wordWrap = true,
  filter,
  activeSearchLogId,
  searchKeyword,
  searchMatchCase = false,
  searchIsRegex = false,
  columnWidths = defaultWidths,
  onColumnWidthsChange,
  theme,
  borderIntensity = 'medium',
  jumpToLine,
  targetNavLog,
  onFirstVisibleIndexChange,
  legacyBoldSelection = false,
  legacyHighlightStyle = false,
  onFilterChange,
  uniqueModules,
  uniqueThreads,
  timeRange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [lastSelectedLogId, setLastSelectedLogId] = useState<number | null>(null);
  const [highlightedLogId, setHighlightedLogId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastOk, setToastOk] = useState(true);
  const [copyTarget, setCopyTarget] = useState<{ actions: RuntimeCopyAction[]; anchor: DOMRect } | null>(null);
  const [openColumnFilter, setOpenColumnFilter] = useState<ColumnFilterKey | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  const triggerRowHighlight = useCallback((logId: number) => {
    setHighlightedLogId(logId);
    const timer = setTimeout(() => {
      setHighlightedLogId((prev) => (prev === logId ? null : prev));
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  const isLight = theme === 'light';
  const registeredCopyActions = React.useMemo(() => copyActions(format), [format]);
  const selectedLogs = React.useMemo(() => logs.filter((log) => selectedIds.has(log.id)), [logs, selectedIds]);

  const toggleColumnFilter = useCallback((column: ColumnFilterKey, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (openColumnFilter === column) {
      setOpenColumnFilter(null);
      setFilterAnchor(null);
      return;
    }
    setFilterAnchor(event.currentTarget.getBoundingClientRect());
    setOpenColumnFilter(column);
  }, [openColumnFilter]);

  const closeColumnFilter = useCallback(() => {
    setOpenColumnFilter(null);
    setFilterAnchor(null);
  }, []);

  // 右键上下文菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 浮动上浮淡出复制 Toast 数组
  const [floatingToasts, setFloatingToasts] = useState<{ id: number; x: number; y: number; text: string }[]>([]);

  // 列宽调控拖拽状态
  const [resizingCol, setResizingCol] = useState<keyof ColumnWidths | null>(null);
  const [startX, setStartX] = useState<number>(0);
  const [startWidth, setStartWidth] = useState<number>(0);
  const [guideX, setGuideX] = useState<number | null>(null);

  // 真实 DOM 测量高度缓存
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());

  const HEADER_HEIGHT = 28; // 表头固定的高度 h-7 (28px)

  const colWidths: ColumnWidths = React.useMemo(() => {
    return { ...defaultWidths, ...columnWidths };
  }, [columnWidths]);

  // 触发按钮位置浮动 Toast 上浮淡出
  const triggerFloatingToast = useCallback((text: string, e?: React.MouseEvent | { clientX?: number; clientY?: number } | null) => {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (e && 'currentTarget' in e && e.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top - 4;
    } else if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      x = e.clientX;
      y = e.clientY - 8;
    }

    const newToast = {
      id: Date.now() + Math.random(),
      x,
      y,
      text,
    };

    setFloatingToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setFloatingToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 1500);
  }, []);

  // 列宽调控逻辑
  const handleResizeStart = (colKey: keyof ColumnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colKey);
    setStartX(e.clientX);
    setStartWidth(colWidths[colKey] || defaultWidths[colKey]);
    setGuideX(e.clientX);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleResizeDoubleClick = (colKey: keyof ColumnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onColumnWidthsChange) {
      onColumnWidthsChange({
        ...colWidths,
        [colKey]: defaultWidths[colKey],
      });
    }
  };

  useEffect(() => {
    if (!resizingCol) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const delta = e.clientX - startX;
      const minW = minColumnWidths[resizingCol] || 36;
      const newWidth = Math.max(minW, startWidth + delta);
      setGuideX(e.clientX);
      if (onColumnWidthsChange) {
        onColumnWidthsChange({
          ...colWidths,
          [resizingCol]: newWidth,
        });
      }
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      setGuideX(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // 拖拽调整结束后，刷新测量高度缓存以保证精确度
      setMeasuredHeights(new Map());
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol, startX, startWidth, colWidths, onColumnWidthsChange]);

  // 计算除操作描述列以外的所有已开启列的总宽度
  const otherColumnsWidth = React.useMemo(() => {
    let w = 0;
    if (columnVisibility.index) w += colWidths.index;
    if (columnVisibility.timestamp) w += colWidths.timestamp;
    if (columnVisibility.level) w += colWidths.level;
    if (columnVisibility.requestId) w += colWidths.requestId;
    if (columnVisibility.functionName) w += colWidths.functionName;
    if (columnVisibility.threadId) w += colWidths.threadId;
    if (columnVisibility.memoryAddress) w += colWidths.memoryAddress;
    if (columnVisibility.module) w += colWidths.module;
    if (columnVisibility.fileName) w += colWidths.fileName;
    if (columnVisibility.lineNumber) w += colWidths.lineNumber;
    return w;
  }, [columnVisibility, colWidths]);

  // 根据当前容器尺寸精确计算单行可容纳字符数
  const charsPerLine = React.useMemo(() => {
    const opDescWidth = Math.max(colWidths.operationDesc, containerWidth - otherColumnsWidth - 24);
    return Math.max(30, Math.floor(opDescWidth / 7.2));
  }, [containerWidth, otherColumnsWidth, colWidths.operationDesc]);

  // 重置测量缓存 (当影响布局的参数发生改变时，非拖拽中重置)
  useEffect(() => {
    setMeasuredHeights(new Map());
  }, [logs, density, wordWrap, columnVisibility]);

  // 动态计算每一行日志的真实高度与全局偏移量
  const itemHeights = React.useMemo(() => {
    const padYMap: Record<DisplayDensity, number> = {
      compact: 4,   // py-0.5
      normal: 8,    // py-1
      relaxed: 12,  // py-1.5
    };

    const padY = padYMap[density];
    const LINE_HEIGHT = 16;

    if (!wordWrap) {
      return logs.map((entry) => measuredHeights.get(entry.id) ?? (padY + LINE_HEIGHT));
    }

    return logs.map((entry) => {
      const measured = measuredHeights.get(entry.id);
      if (measured !== undefined) return measured;

      const text = entry.success
        ? (entry.stack ? stackSummary(entry.stack) : entry.fields?.operationDesc || entry.rawText)
        : entry.rawText;

      if (!text) return padY + LINE_HEIGHT;

      const lines = text.split('\n');
      let lineCount = 0;

      for (const l of lines) {
        lineCount += Math.max(1, Math.ceil(l.length / charsPerLine));
      }

      return padY + Math.max(1, lineCount) * LINE_HEIGHT;
    });
  }, [logs, density, wordWrap, charsPerLine, measuredHeights]);

  const offsets = React.useMemo(() => {
    const arr = new Float64Array(logs.length + 1);
    arr[0] = 0;
    for (let i = 0; i < logs.length; i++) {
      arr[i + 1] = arr[i] + itemHeights[i];
    }
    return arr;
  }, [logs.length, itemHeights]);

  const totalHeight = HEADER_HEIGHT + (offsets[logs.length] || 0);

  // 视口滚动锚点：在列宽调整或容器尺寸变动时保持当前视口首行精确锁定，避免视图跳跃
  const anchorRef = useRef<{ index: number; offset: number } | null>(null);

  const updateAnchor = useCallback((currentScrollTop: number) => {
    if (logs.length === 0 || offsets.length <= 1) return;
    const target = Math.max(0, currentScrollTop - HEADER_HEIGHT);
    let low = 0;
    let high = logs.length - 1;
    let idx = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (offsets[mid + 1] > target) {
        idx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    const offsetInside = target - (offsets[idx] || 0);
    anchorRef.current = { index: idx, offset: Math.max(0, offsetInside) };
  }, [logs.length, offsets, HEADER_HEIGHT]);

  // 当 offsets 因为列宽调整/容器尺寸改变而重算时，自动维持基准行位置不变
  useLayoutEffect(() => {
    if (!anchorRef.current || !containerRef.current || logs.length === 0) return;
    const { index, offset } = anchorRef.current;
    if (index >= logs.length) return;

    const newTargetScrollTop = Math.max(0, HEADER_HEIGHT + (offsets[index] || 0) + offset);
    if (Math.abs(containerRef.current.scrollTop - newTargetScrollTop) > 1) {
      containerRef.current.scrollTop = newTargetScrollTop;
      setScrollTop(newTargetScrollTop);
    }
  }, [offsets, logs.length, HEADER_HEIGHT]);

  // 监听容器尺寸变化
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setContainerHeight(el.clientHeight);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  const scrollAnimTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 智能定向滚动逻辑：超长距离采用瞬间跳转+尾部落地缓动，避免多秒冗长平滑滚动
  const smartScrollToTargetIndex = useCallback(
    (targetIndex: number) => {
      if (!containerRef.current || targetIndex < 0 || targetIndex >= logs.length) return;

      if (scrollAnimTimerRef.current) {
        clearTimeout(scrollAnimTimerRef.current);
        scrollAnimTimerRef.current = null;
      }

      const container = containerRef.current;
      const currentScrollTop = container.scrollTop;
      const targetOffset = offsets[targetIndex];
      const finalTargetTop = Math.max(0, HEADER_HEIGHT + targetOffset - containerHeight / 2 + 30);

      const distanceInPixels = Math.abs(finalTargetTop - currentScrollTop);

      if (distanceInPixels <= 1200) {
        // 短距离 (1200px以内)：常规原生平滑滚动
        container.scrollTo({
          top: finalTargetTop,
          behavior: 'smooth',
        });
      } else {
        // 长距离 (超过 1200px)：
        // 1. 先瞬间跃至距离目标 550px 处 (约 20-25 行高度)
        const isMovingDown = finalTargetTop > currentScrollTop;
        const tailDistance = 550;
        const preTailTop = isMovingDown
          ? Math.max(0, finalTargetTop - tailDistance)
          : Math.min(container.scrollHeight, finalTargetTop + tailDistance);

        container.scrollTo({
          top: preTailTop,
          behavior: 'auto',
        });

        // 2. 短暂延时 30ms 后使用 smooth 完成最后 550px 落地，产生清晰自然、速度适中的缓降停留视觉效果
        scrollAnimTimerRef.current = setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              top: finalTargetTop,
              behavior: 'smooth',
            });
          }
        }, 30);
      }
    },
    [logs.length, offsets, containerHeight, HEADER_HEIGHT]
  );

  // 自动平滑滚动到当前选中的搜索定位行 (仅在 activeSearchLogId 真实变化时触发)
  const prevActiveSearchLogIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeSearchLogId == null) {
      prevActiveSearchLogIdRef.current = null;
      return;
    }
    if (prevActiveSearchLogIdRef.current === activeSearchLogId) return;
    prevActiveSearchLogIdRef.current = activeSearchLogId;

    const matchIndex = logs.findIndex((l) => l.id === activeSearchLogId);
    if (matchIndex >= 0) {
      // 4. 全局搜索时，切换上/下一个时，选中该搜索到的行
      onSelectionChange(new Set([activeSearchLogId]));
      setLastSelectedLogId(activeSearchLogId);

      smartScrollToTargetIndex(matchIndex);
      triggerRowHighlight(activeSearchLogId);
    }
  }, [activeSearchLogId, logs, onSelectionChange, smartScrollToTargetIndex, triggerRowHighlight]);

  // 响应外部主动导航指令 (如 ERROR 快捷导航等，仅在 targetNavLog 真实变化时触发)
  const prevTargetNavLogRef = useRef<{ id: number; timestamp: number } | null>(null);
  useEffect(() => {
    if (!targetNavLog) {
      prevTargetNavLogRef.current = null;
      return;
    }
    if (prevTargetNavLogRef.current === targetNavLog) return;
    prevTargetNavLogRef.current = targetNavLog;

    const matchIndex = logs.findIndex((l) => l.id === targetNavLog.id);
    if (matchIndex >= 0) {
      smartScrollToTargetIndex(matchIndex);
      triggerRowHighlight(targetNavLog.id);
    }
  }, [targetNavLog, logs, smartScrollToTargetIndex, triggerRowHighlight]);

  // 响应跳转行指令 (仅在 jumpToLine 真实变化时触发)
  const prevJumpToLineRef = useRef<{ line: number; timestamp: number } | null>(null);
  useEffect(() => {
    if (!jumpToLine) {
      prevJumpToLineRef.current = null;
      return;
    }
    if (prevJumpToLineRef.current === jumpToLine) return;
    prevJumpToLineRef.current = jumpToLine;

    const targetVal = jumpToLine.line;
    if (!targetVal || logs.length === 0) return;

    let matchIdx = logs.findIndex((log) => log.stack && log.lineNumber <= targetVal && (log.endLineNumber ?? log.lineNumber) >= targetVal);
    // 1. 优先按 1-based 当前视图序号精准定位
    if (matchIdx >= 0) {
      onOpenStack(logs[matchIdx]);
    } else if (targetVal >= 1 && targetVal <= logs.length) {
      matchIdx = targetVal - 1;
    } else {
      // 2. 超出视图序列时按日志原始行号 entry.lineNumber 查找
      matchIdx = logs.findIndex((l) => l.lineNumber === targetVal);
    }

    if (matchIdx >= 0 && matchIdx < logs.length) {
      const targetEntry = logs[matchIdx];
      onSelectionChange(new Set([targetEntry.id]));
      setLastSelectedLogId(targetEntry.id);

      smartScrollToTargetIndex(matchIdx);
      triggerRowHighlight(targetEntry.id);
      triggerFloatingToast(`已跳转至第 ${targetVal} 行`, null);
    } else {
      triggerFloatingToast(`未找到第 ${targetVal} 行`, null);
    }
  }, [jumpToLine, logs, onSelectionChange, triggerFloatingToast, triggerRowHighlight, smartScrollToTargetIndex]);

  // 选定行时，以选定的 strictly filtered logs 改变为基准触发定位
  const prevLogsRef = useRef(logs);
  useEffect(() => {
    if (logs === prevLogsRef.current) return;
    prevLogsRef.current = logs;

    if (lastSelectedLogId == null) return;
    if (!selectedIds.has(lastSelectedLogId)) return;

    const matchIdx = logs.findIndex((l) => l.id === lastSelectedLogId);
    if (matchIdx >= 0) {
      smartScrollToTargetIndex(matchIdx);
    }
  }, [logs, lastSelectedLogId, selectedIds, smartScrollToTargetIndex]);

  // 批量刷新渲染行的真实 DOM 高度 (采用 requestAnimationFrame 批处理，避免单帧多次 setState 造成布局卡顿与抖动)
  const pendingMeasuresRef = useRef<Map<number, number>>(new Map());
  const measureRafRef = useRef<number | null>(null);

  const flushMeasures = useCallback(() => {
    if (pendingMeasuresRef.current.size === 0) return;
    const updates = new Map(pendingMeasuresRef.current);
    pendingMeasuresRef.current.clear();
    setMeasuredHeights((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, h] of updates) {
        if (typeof h !== 'number') continue;
        const cur = prev.get(id);
        if (cur !== h && Math.abs((cur ?? 0) - h) > 1) {
          next.set(id, h);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (measureRafRef.current) {
        cancelAnimationFrame(measureRafRef.current);
      }
    };
  }, []);

  // 测量渲染行的真实 DOM 高度
  const measureRowRef = React.useCallback(
    (id: number) => (node: HTMLDivElement | null) => {
      if (node) {
        const h = Math.round(node.getBoundingClientRect().height);
        if (h > 0) {
          const current = measuredHeights.get(id);
          if (current !== h && Math.abs((current || 0) - h) > 1) {
            pendingMeasuresRef.current.set(id, h);
            if (!measureRafRef.current) {
              measureRafRef.current = requestAnimationFrame(() => {
                measureRafRef.current = null;
                flushMeasures();
              });
            }
          }
        }
      }
    },
    [measuredHeights, flushMeasures]
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const curTop = e.currentTarget.scrollTop;
    setScrollTop(curTop);
    updateAnchor(curTop);
    if (contextMenu) setContextMenu(null);
    if (openColumnFilter) closeColumnFilter();
    if (copyTarget) setCopyTarget(null);
  };

  const copyText = async (text: string, _key: string, toastTip?: string, e?: React.MouseEvent | null) => {
    let ok = true;
    let msg = toastTip || '已复制到剪贴板';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
      msg = '剪贴板写入失败，请检查浏览器权限后重试';
    }
    setToastOk(ok);
    setToastMessage(msg);
    triggerFloatingToast(msg, e);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const runRegisteredCopy = async (action: RuntimeCopyAction, targetLogs: LogEntry[]) => {
    const feedback = await copyActionToClipboard(action, targetLogs);
    setToastOk(feedback.ok);
    setToastMessage(feedback.message);
    triggerFloatingToast(feedback.message, null);
    setTimeout(() => setToastMessage(null), 2400);
  };

  const copySelectedLogsRaw = useCallback((e?: React.MouseEvent | { clientX?: number; clientY?: number } | null) => {
    if (selectedIds.size === 0) return;
    const selectedLogsList = logs.filter((l) => selectedIds.has(l.id));
    const rawTextJoined = selectedLogsList.map((l) => l.rawText).join('\n');
    navigator.clipboard.writeText(rawTextJoined);
    const msg = `已复制选中的 ${selectedIds.size} 行原始日志`;
    setToastMessage(msg);
    triggerFloatingToast(msg, e);
    setTimeout(() => setToastMessage(null), 2000);
  }, [logs, selectedIds, triggerFloatingToast]);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu) setContextMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          if (selectedIds.size > 0) {
            e.preventDefault();
            copySelectedLogsRaw();
          }
        }
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, selectedIds, copySelectedLogsRaw]);

  const handleContextMenu = (entry: LogEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLastSelectedLogId(entry.id);

    if (!selectedIds.has(entry.id)) {
      onSelectionChange(new Set([entry.id]));
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 200;
    const menuHeight = 240;

    const posX = e.clientX + menuWidth > viewportWidth ? e.clientX - menuWidth : e.clientX;
    const posY = e.clientY + menuHeight > viewportHeight ? e.clientY - menuHeight : e.clientY;

    setContextMenu({
      field: sourceField(e),
      x: posX,
      y: posY,
      log: entry,
    });
  };

  const handleRowMouseDown = (entry: LogEntry, index: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;

    setLastSelectedLogId(entry.id);

    const isShift = e.shiftKey;
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 仅支持Shift或者Ctrl多选；并且使用Shift或者Ctrl多选不选中界面文本，但是拖选允许选中界面文本
    if (isShift || isCtrlOrCmd) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    }

    const newSet = new Set(selectedIds);

    if (isShift && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      for (let i = start; i <= end; i++) {
        if (logs[i]) newSet.add(logs[i].id);
      }
    } else if (isCtrlOrCmd) {
      if (newSet.has(entry.id)) {
        newSet.delete(entry.id);
      } else {
        newSet.add(entry.id);
      }
    } else {
      if (newSet.has(entry.id) && newSet.size === 1) {
        newSet.clear();
      } else {
        newSet.clear();
        newSet.add(entry.id);
      }
    }

    setLastClickedIndex(index);
    onSelectionChange(newSet);
  };

  const { startIndex, endIndex, firstVisibleIndex } = React.useMemo(() => {
    if (logs.length === 0) return { startIndex: 0, endIndex: 0, firstVisibleIndex: 0 };

    const targetStart = Math.max(0, scrollTop - HEADER_HEIGHT);
    const targetEnd = Math.max(0, scrollTop + containerHeight - HEADER_HEIGHT);

    let low = 0;
    let high = logs.length - 1;
    let start = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (offsets[mid + 1] > targetStart) {
        start = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    low = start;
    high = logs.length - 1;
    let end = logs.length;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (offsets[mid] >= targetEnd) {
        end = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const overscan = 10;
    return {
      startIndex: Math.max(0, start - overscan),
      endIndex: Math.min(logs.length, end + overscan),
      firstVisibleIndex: start,
    };
  }, [scrollTop, containerHeight, offsets, logs.length, HEADER_HEIGHT]);

  useEffect(() => {
    onFirstVisibleIndexChange?.(firstVisibleIndex);
  }, [firstVisibleIndex, onFirstVisibleIndexChange]);

  const visibleLogs = logs.slice(startIndex, endIndex);

  // 计算屏幕上下可视边界之外的已选中日志行
  const { selectedAbove, selectedBelow } = React.useMemo(() => {
    if (selectedIds.size === 0 || logs.length === 0) {
      return { selectedAbove: [], selectedBelow: [] };
    }

    const targetStart = Math.max(0, scrollTop - HEADER_HEIGHT);
    const targetEnd = Math.max(0, scrollTop + containerHeight - HEADER_HEIGHT);

    const above: { log: LogEntry; index: number }[] = [];
    const below: { log: LogEntry; index: number }[] = [];

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (selectedIds.has(log.id)) {
        const top = offsets[i] ?? 0;
        const bottom = offsets[i + 1] ?? (top + 24);

        if (bottom <= targetStart) {
          above.push({ log, index: i });
        } else if (top >= targetEnd) {
          below.push({ log, index: i });
        }
      }
    }

    return { selectedAbove: above, selectedBelow: below };
  }, [selectedIds, logs, scrollTop, containerHeight, HEADER_HEIGHT, offsets]);

  // 点击上方气泡：跳转至上方最近（索引最大）的选中行
  const handleScrollToNearestAbove = useCallback(() => {
    if (selectedAbove.length === 0) return;
    const target = selectedAbove[selectedAbove.length - 1];
    smartScrollToTargetIndex(target.index);
    triggerRowHighlight(target.log.id);
    triggerFloatingToast(`已跳转至上方选中的第 ${target.log.lineNumber} 行`, null);
  }, [selectedAbove, smartScrollToTargetIndex, triggerRowHighlight, triggerFloatingToast]);

  // 点击下方气泡：跳转至下方最近（索引最小）的选中行
  const handleScrollToNearestBelow = useCallback(() => {
    if (selectedBelow.length === 0) return;
    const target = selectedBelow[0];
    smartScrollToTargetIndex(target.index);
    triggerRowHighlight(target.log.id);
    triggerFloatingToast(`已跳转至下方选中的第 ${target.log.lineNumber} 行`, null);
  }, [selectedBelow, smartScrollToTargetIndex, triggerRowHighlight, triggerFloatingToast]);

  // 计算右键菜单作用的目标行列表（若右键行已在多选集合内则组合所有选中行，否则作用于右键单行）
  const contextTargetLogs = React.useMemo(() => {
    if (!contextMenu) return [];
    if (selectedIds.has(contextMenu.log.id) && selectedIds.size > 1) {
      const selectedList = logs.filter((l) => selectedIds.has(l.id));
      if (selectedList.length > 0) return selectedList;
    }
    return [contextMenu.log];
  }, [contextMenu, selectedIds, logs]);

  // 对应日志级别的深色底脉冲外发光动画 Class
  const getNavHighlightAnimClass = (entry: LogEntry) => {
    if (!entry.success) return 'animate-nav-target-error';
    const lvl = entry.fields?.level?.toUpperCase();
    if (lvl === 'ERROR' || lvl === 'FATAL' || lvl === 'ERR') {
      return 'animate-nav-target-error';
    }
    if (lvl === 'WARN') {
      return 'animate-nav-target-warn';
    }
    if (lvl === 'INFO') {
      return 'animate-nav-target-info';
    }
    return 'animate-nav-target-default';
  };

  // 边框显隐与显示度控制
  const borderClass = React.useMemo(() => {
    if (isLight) {
      if (borderIntensity === 'light') return 'border-slate-200/50';
      if (borderIntensity === 'strong') return 'border-slate-400';
      return 'border-slate-300';
    } else {
      if (borderIntensity === 'light') return 'border-slate-800/40';
      if (borderIntensity === 'strong') return 'border-slate-600';
      return 'border-slate-800/90';
    }
  }, [isLight, borderIntensity]);

  const borderBottomClass = React.useMemo(() => {
    if (isLight) {
      if (borderIntensity === 'light') return 'border-b border-slate-200/60';
      if (borderIntensity === 'strong') return 'border-b-2 border-slate-400';
      return 'border-b border-slate-300';
    } else {
      if (borderIntensity === 'light') return 'border-b border-slate-800/40';
      if (borderIntensity === 'strong') return 'border-b-2 border-slate-600';
      return 'border-b border-slate-800';
    }
  }, [isLight, borderIntensity]);

  // 日志级别 Badge 样式
  const getLevelStyle = (level?: string) => {
    if (!level) return isLight ? 'text-slate-600 bg-slate-200' : 'text-slate-400 bg-slate-800/40';
    switch (level.toUpperCase()) {
      case 'ERROR':
        return isLight
          ? 'text-rose-700 bg-rose-50 font-semibold border border-rose-200 shadow-2xs'
          : 'text-rose-300 bg-rose-950/60 font-semibold border border-rose-800/60';
      case 'WARN':
        return isLight
          ? 'text-amber-800 bg-amber-50 font-semibold border border-amber-200 shadow-2xs'
          : 'text-amber-300 bg-amber-950/50 font-semibold border border-amber-800/50';
      case 'INFO':
        return isLight
          ? 'text-blue-700 bg-blue-50 font-semibold border border-blue-200 shadow-2xs'
          : 'text-sky-300 bg-sky-950/50 font-semibold border border-sky-800/50';
      case 'DEBUG':
        return isLight
          ? 'text-slate-700 bg-slate-100 font-medium border border-slate-200'
          : 'text-slate-300 bg-slate-800/60 font-medium border border-slate-700/60';
      default:
        return isLight ? 'text-slate-700 bg-slate-200' : 'text-slate-300 bg-slate-800';
    }
  };

  // 行背景与边框样式 (选中时使用 2px 加粗内嵌高亮边框 box-shadow 与统一 4px 左侧强调边，相邻选中行完美重合并不丢失行间分隔线，且完全不改变字符度量或触发额外换行)
  const getRowSelectionStyle = (
    entry: LogEntry,
    isSelected: boolean,
    prevSelected: boolean,
    nextSelected: boolean
  ): { bgClass: string; boxShadow?: string } => {
    const lvl = entry.fields?.level?.toUpperCase();
    const isErrorLevel = !entry.success || lvl === 'ERROR' || lvl === 'FATAL' || lvl === 'ERR';
    const isWarnLevel = lvl === 'WARN';
    const isInfoLevel = lvl === 'INFO';

    if (!isSelected) {
      if (isErrorLevel) {
        return {
          bgClass: isLight
            ? 'bg-rose-100/60 text-rose-950 hover:bg-rose-100/90 border-l-[4px] border-l-rose-500'
            : 'bg-rose-950/60 text-rose-200 hover:bg-rose-950/80 border-l-[4px] border-l-rose-500',
        };
      }
      if (isWarnLevel) {
        return {
          bgClass: isLight
            ? 'bg-amber-50/70 text-amber-950 hover:bg-amber-100/80 border-l-[4px] border-l-amber-500/80'
            : 'bg-amber-950/30 text-amber-200 hover:bg-amber-950/50 border-l-[4px] border-l-amber-500/70',
        };
      }
      if (isInfoLevel) {
        return {
          bgClass: isLight
            ? 'hover:bg-slate-100/80 text-slate-800 border-l-[4px] border-l-transparent'
            : 'hover:bg-slate-800/50 text-slate-200 border-l-[4px] border-l-transparent',
        };
      }
      return {
        bgClass: isLight
          ? 'hover:bg-slate-100/80 text-slate-800 border-l-[4px] border-l-transparent'
          : 'hover:bg-slate-800/50 text-slate-200 border-l-[4px] border-l-transparent',
      };
    }

    // 选中行高亮样式
    let baseClass = '';
    let ringColor = '';
    let innerDividerColor = '';

    if (isErrorLevel) {
      baseClass = isLight
        ? 'bg-rose-200/95 text-rose-950 border-l-[4px] border-l-rose-700 shadow-xs z-10'
        : 'bg-rose-900/85 text-rose-100 border-l-[4px] border-l-rose-400 shadow-xs z-10';
      ringColor = isLight ? 'rgba(225, 29, 72, 0.9)' : 'rgba(244, 63, 94, 0.95)';
      innerDividerColor = isLight ? 'rgba(225, 29, 72, 0.5)' : 'rgba(244, 63, 94, 0.55)';
    } else if (isWarnLevel) {
      baseClass = isLight
        ? 'bg-amber-200/95 text-amber-950 border-l-[4px] border-l-amber-700 shadow-xs z-10'
        : 'bg-amber-900/80 text-amber-100 border-l-[4px] border-l-amber-400 shadow-xs z-10';
      ringColor = isLight ? 'rgba(217, 119, 6, 0.9)' : 'rgba(245, 158, 11, 0.95)';
      innerDividerColor = isLight ? 'rgba(217, 119, 6, 0.5)' : 'rgba(245, 158, 11, 0.55)';
    } else if (isInfoLevel) {
      baseClass = isLight
        ? 'bg-sky-100/95 text-sky-950 border-l-[4px] border-l-sky-600 shadow-xs z-10'
        : 'bg-sky-900/70 text-sky-100 border-l-[4px] border-l-sky-400 shadow-xs z-10';
      ringColor = isLight ? 'rgba(2, 132, 199, 0.9)' : 'rgba(14, 165, 233, 0.95)';
      innerDividerColor = isLight ? 'rgba(2, 132, 199, 0.5)' : 'rgba(14, 165, 233, 0.55)';
    } else {
      baseClass = isLight
        ? 'bg-indigo-100/95 text-indigo-950 border-l-[4px] border-l-indigo-600 shadow-xs z-10'
        : 'bg-indigo-950/80 text-indigo-100 border-l-[4px] border-l-indigo-400 shadow-xs z-10';
      ringColor = isLight ? 'rgba(79, 70, 229, 0.9)' : 'rgba(99, 102, 241, 0.95)';
      innerDividerColor = isLight ? 'rgba(79, 70, 229, 0.5)' : 'rgba(99, 102, 241, 0.55)';
    }

    if (legacyBoldSelection) {
      baseClass += ' font-bold';
    }

    // 解决相邻选中行边框重合与消失问题：
    // - 外边框顶部 (2px): 仅在非连续上一行时绘制 2px
    // - 外边框底部 (2px): 仅在非连续下一行时绘制 2px
    // - 相邻选中行之间 (1px): 当下一行也是选中行时，绘制清晰的 1px 行间分隔线（既不消失，也不重复加粗冲突）
    // - 外边框右侧 (2px): 始终绘制 2px
    // - 左侧由 4px 实心 border-l 提供
    const shadows: string[] = [];
    if (!prevSelected) {
      shadows.push(`inset 0 2px 0 0 ${ringColor}`);
    }
    if (!nextSelected) {
      shadows.push(`inset 0 -2px 0 0 ${ringColor}`);
    } else {
      // 保证相邻选中行之间始终具有清晰的行间分隔线，绝不消失
      shadows.push(`inset 0 -1px 0 0 ${innerDividerColor}`);
    }
    shadows.push(`inset -2px 0 0 0 ${ringColor}`);

    return {
      bgClass: baseClass,
      boxShadow: shadows.join(', '),
    };
  };

  const padYClassMap: Record<DisplayDensity, string> = {
    compact: 'py-0.5',
    normal: 'py-1',
    relaxed: 'py-1.5',
  };

  const textDisplayClass = wordWrap
    ? `whitespace-pre-wrap break-all leading-[16px] ${isLight ? 'text-slate-900' : 'text-slate-100'}`
    : 'truncate';

  return (
    <div className={`flex-1 w-full h-full flex flex-col relative overflow-hidden font-mono-dense text-xs select-text ${
      isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-200'
    }`}>
      {/* Toast 操作成功常驻反馈 */}
      {toastMessage && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-lg shadow-xl backdrop-blur-md flex items-center gap-2 text-xs font-sans animate-in fade-in duration-150 pointer-events-none border ${
          toastOk
            ? isLight ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-emerald-950 border-emerald-500 text-emerald-200'
            : isLight ? 'bg-rose-50 border-rose-400 text-rose-900' : 'bg-rose-950 border-rose-500 text-rose-200'
        }`}>
          {toastOk ? <Check className="w-4 h-4 text-emerald-500" /> : <AlertOctagon className="w-4 h-4 text-rose-500" />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 边界气泡提示 - 上方屏幕可视区域外有选中行 */}
      {selectedAbove.length > 0 && (
        <button
          onClick={handleScrollToNearestAbove}
          className={`absolute top-9 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-medium shadow-md backdrop-blur-md cursor-pointer transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-top-2 duration-150 border ${
            isLight
              ? 'bg-white/95 text-indigo-900 border-indigo-200 shadow-indigo-500/15 hover:bg-indigo-50 hover:border-indigo-300'
              : 'bg-slate-900/95 text-indigo-200 border-indigo-500/40 shadow-black/50 hover:bg-slate-800 hover:border-indigo-400'
          }`}
          title="点击跳转至上方最近的选中行"
        >
          <ChevronUp className="w-3.5 h-3.5 text-indigo-500 animate-bounce" />
          <span>上方有 <strong className="font-bold text-indigo-600 dark:text-indigo-400">{selectedAbove.length}</strong> 行已选中</span>
        </button>
      )}

      {/* 边界气泡提示 - 下方屏幕可视区域外有选中行 */}
      {selectedBelow.length > 0 && (
        <button
          onClick={handleScrollToNearestBelow}
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-medium shadow-md backdrop-blur-md cursor-pointer transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-2 duration-150 border ${
            isLight
              ? 'bg-white/95 text-indigo-900 border-indigo-200 shadow-indigo-500/15 hover:bg-indigo-50 hover:border-indigo-300'
              : 'bg-slate-900/95 text-indigo-200 border-indigo-500/40 shadow-black/50 hover:bg-slate-800 hover:border-indigo-400'
          }`}
          title="点击跳转至下方最近的选中行"
        >
          <ChevronDown className="w-3.5 h-3.5 text-indigo-500 animate-bounce" />
          <span>下方有 <strong className="font-bold text-indigo-600 dark:text-indigo-400">{selectedBelow.length}</strong> 行已选中</span>
        </button>
      )}

      {/* 右键上下文弹出菜单 */}
      {contextMenu && (
        <div
          role="menu" aria-label="日志上下文菜单"
          style={{ top: `${Math.max(8, contextMenu.y)}px`, left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 232))}px`, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          className={`fixed z-50 w-56 rounded-lg shadow-2xl py-1 text-xs font-sans border backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${
            isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`px-3 py-1.5 border-b text-[10px] font-mono truncate flex items-center justify-between ${
            isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
          }`}>
            <span>{contextTargetLogs.length > 1 ? `已选中 ${contextTargetLogs.length} 行` : '日志上下文菜单'}</span>
            <span className="text-slate-400">
              {contextTargetLogs.length > 1
                ? `#${contextTargetLogs[0].lineNumber} ~ #${contextTargetLogs[contextTargetLogs.length - 1].lineNumber}`
                : `#${contextMenu.log.lineNumber}`}
            </span>
          </div>

          <div className="py-0.5">
            <SourceMenuItem log={contextMenu.log} format={format} field={contextMenu.field} light={isLight} onClose={() => setContextMenu(null)} />
            {onAnalyze ? <button type="button" role="menuitem" onClick={() => { onAnalyze(contextTargetLogs); setContextMenu(null); }} className={`w-full px-3 py-2 text-left text-xs ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}>AI 分析选中行</button> : null}
            {/* 原文复制 */}
            <button
              onClick={(e) => {
                const text = contextTargetLogs.map((l) => l.rawText).join('\n');
                const toast = contextTargetLogs.length > 1 ? `已复制选中的 ${contextTargetLogs.length} 行原文` : '已复制原文';
                copyText(text, 'ctx-raw', toast, e);
                setContextMenu(null);
              }}
              className={`w-full text-left px-3 py-1.5 transition-colors flex items-center justify-between cursor-pointer ${
                isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>原文复制</span>
              </div>
              {contextTargetLogs.length > 1 && (
                <span className="text-[10px] opacity-75 font-mono">({contextTargetLogs.length}行)</span>
              )}
            </button>

            {copyActionsAt(registeredCopyActions, CopyPlacement.ContextMenu).map((action) => (
              <button
                key={action.id}
                onClick={async () => {
                  await runRegisteredCopy(action, contextTargetLogs);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 transition-colors flex items-center justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                  isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Copy className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                  <span className="truncate">{action.label}</span>
                </div>
                {contextTargetLogs.length > 1 ? <span className="text-[10px] opacity-75 font-mono">({contextTargetLogs.length}行)</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 主数据表格及虚拟列表 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 w-full overflow-auto relative select-text z-10"
      >
        <div style={{ minHeight: '100%', height: logs.length === 0 ? '100%' : `${totalHeight}px`, position: 'relative' }} className="min-w-max w-full flex flex-col">
          {/* 表头吸顶 (始终展示) */}
          <div className={`sticky top-0 z-20 h-7.5 shrink-0 backdrop-blur-md font-sans font-semibold text-[11px] flex items-center shadow-2xs select-none border-b border-l-[3px] border-l-transparent ${
            isLight ? 'bg-slate-100/95 text-slate-700 border-slate-300/80' : 'bg-slate-900/95 text-slate-300 border-slate-800'
          }`}>
              {/* 序号列 header */}
              {columnVisibility.index && (
                <div 
                  data-source-field="index" style={{ width: `${colWidths.index}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.Index, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>#</span>
                  <HeaderFilterButton label="序号" active={isFilterActive(ColumnFilterKey.Index, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.Index, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('index', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('index', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 时间戳列 header */}
              {columnVisibility.timestamp && (
                <div 
                  data-source-field="timestamp" style={{ width: `${colWidths.timestamp}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.Timestamp, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>时间戳</span>
                  <HeaderFilterButton label="时间戳" active={isFilterActive(ColumnFilterKey.Timestamp, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.Timestamp, event)} />

                  <div
                    onMouseDown={(e) => handleResizeStart('timestamp', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('timestamp', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 级别列 header */}
              {columnVisibility.level && (
                <div 
                  data-source-field="level" style={{ width: `${colWidths.level}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.Level, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>级别</span>
                  <HeaderFilterButton label="级别" active={isFilterActive(ColumnFilterKey.Level, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.Level, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('level', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('level', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 请求ID列 header */}
              {columnVisibility.requestId && (
                <div 
                  data-source-field="requestId" style={{ width: `${colWidths.requestId}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.RequestId, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>请求ID</span>
                  <HeaderFilterButton label="请求ID" active={isFilterActive(ColumnFilterKey.RequestId, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.RequestId, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('requestId', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('requestId', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 操作描述列 header */}
              {columnVisibility.operationDesc && (
                <div 
                  style={{ minWidth: `${colWidths.operationDesc}px` }} 
                  className={`flex-1 shrink-0 pl-2.5 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.OperationDesc, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>操作描述 (Operation Description)</span>
                  <HeaderFilterButton label="操作描述" active={isFilterActive(ColumnFilterKey.OperationDesc, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.OperationDesc, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('operationDesc', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('operationDesc', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 函数名列 header */}
              {columnVisibility.functionName && (
                <div 
                  data-source-field="functionName" style={{ width: `${colWidths.functionName}px` }}
                  className={`shrink-0 pl-2 py-1 border-r flex items-center justify-between relative group ${isFilterActive(ColumnFilterKey.FunctionName, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>函数名</span>
                  <div className="flex items-center gap-1 min-w-0">
                    {copyActionsAt(registeredCopyActions, CopyPlacement.Header, 'functionName').length > 0 ? (
                      <HeaderCopyButton label="函数名" isLight={isLight} onClick={(event) => { event.stopPropagation(); closeColumnFilter(); setCopyTarget({ actions: copyActionsAt(registeredCopyActions, CopyPlacement.Header, 'functionName'), anchor: event.currentTarget.getBoundingClientRect() }); }} />
                    ) : null}
                    <HeaderFilterButton label="函数名" active={isFilterActive(ColumnFilterKey.FunctionName, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.FunctionName, event)} />
                  </div>
                  <div
                    onMouseDown={(e) => handleResizeStart('functionName', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('functionName', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 线程ID列 header */}
              {columnVisibility.threadId && (
                <div 
                  data-source-field="threadId" style={{ width: `${colWidths.threadId}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.ThreadId, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>线程ID</span>
                  <HeaderFilterButton label="线程ID" active={isFilterActive(ColumnFilterKey.ThreadId, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.ThreadId, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('threadId', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('threadId', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 内存地址列 header */}
              {columnVisibility.memoryAddress && (
                <div 
                  data-source-field="memoryAddress" style={{ width: `${colWidths.memoryAddress}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.MemoryAddress, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>内存地址</span>
                  <HeaderFilterButton label="内存地址" active={isFilterActive(ColumnFilterKey.MemoryAddress, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.MemoryAddress, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('memoryAddress', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('memoryAddress', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 模块列 header */}
              {columnVisibility.module && (
                <div 
                  data-source-field="module" style={{ width: `${colWidths.module}px` }}
                  className={`shrink-0 pl-2 py-1 flex items-center justify-between border-r relative group ${isFilterActive(ColumnFilterKey.Module, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>模块</span>
                  <HeaderFilterButton label="模块" active={isFilterActive(ColumnFilterKey.Module, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.Module, event)} />
                  <div
                    onMouseDown={(e) => handleResizeStart('module', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('module', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 文件名列 header */}
              {columnVisibility.fileName && (
                <div 
                  data-source-field="fileName" style={{ width: `${colWidths.fileName}px` }}
                  className={`shrink-0 pl-2 py-1 border-r flex items-center justify-between relative group ${isFilterActive(ColumnFilterKey.FileName, filter!) ? 'bg-indigo-500/5' : ''} ${borderClass}`}
                >
                  <span>文件名</span>
                  <div className="flex items-center gap-1 min-w-0">
                    {copyActionsAt(registeredCopyActions, CopyPlacement.Header, 'fileName').length > 0 ? (
                      <HeaderCopyButton label="文件名" isLight={isLight} onClick={(event) => { event.stopPropagation(); closeColumnFilter(); setCopyTarget({ actions: copyActionsAt(registeredCopyActions, CopyPlacement.Header, 'fileName'), anchor: event.currentTarget.getBoundingClientRect() }); }} />
                    ) : null}
                    <HeaderFilterButton label="文件名" active={isFilterActive(ColumnFilterKey.FileName, filter!)} isLight={isLight} onClick={(event) => toggleColumnFilter(ColumnFilterKey.FileName, event)} />
                  </div>
                  <div
                    onMouseDown={(e) => handleResizeStart('fileName', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('fileName', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}

              {/* 行号列 header */}
              {columnVisibility.lineNumber && (
                <div 
                  data-source-field="lineNumber" style={{ width: `${colWidths.lineNumber}px` }}
                  className="shrink-0 px-2 py-1.5 text-right pr-3 relative group"
                >
                  <span>行号</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('lineNumber', e)}
                    onDoubleClick={(e) => handleResizeDoubleClick('lineNumber', e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600/60 z-20 transition-colors"
                    title="拖拽调整列宽，双击恢复默认"
                  />
                </div>
              )}
            </div>

            {/* 数据为空时的空状态提示 */}
            {logs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[240px]">
                <Terminal className={`w-12 h-12 mb-3 ${isLight ? 'text-slate-400' : 'text-slate-700'}`} />
                <p className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>暂无符合条件的日志数据</p>
                <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>请尝试调整时间区间、恢复默认等级或重新导入日志文件</p>
              </div>
            ) : (
              visibleLogs.map((entry, sliceIndex) => {
              const actualIndex = startIndex + sliceIndex;
              const topPos = HEADER_HEIGHT + offsets[actualIndex];
              const curHeight = itemHeights[actualIndex];
              const isSelected = selectedIds.has(entry.id);
              const prevSelected = isSelected && actualIndex > 0 && selectedIds.has(logs[actualIndex - 1].id);
              const nextSelected = isSelected && actualIndex < logs.length - 1 && selectedIds.has(logs[actualIndex + 1].id);
              const isSearchActive = activeSearchLogId === entry.id;
              const isNavHighlighted = highlightedLogId === entry.id;
              const selStyle = getRowSelectionStyle(entry, isSelected, prevSelected, nextSelected);
              const effectiveBorderBottom = isSelected && nextSelected ? 'border-b border-transparent' : borderBottomClass;

              return (
                <div
                  key={entry.id}
                  ref={measureRowRef(entry.id)}
                  onMouseDown={(e) => handleRowMouseDown(entry, actualIndex, e)}
                  onContextMenu={(e) => handleContextMenu(entry, e)}
                  style={{
                    position: 'absolute',
                    top: `${topPos}px`,
                    minHeight: `${curHeight}px`,
                    left: 0,
                    right: 0,
                    boxShadow: selStyle.boxShadow,
                  }}
                  className={`flex items-stretch transition-colors cursor-pointer group select-text ${padYClassMap[density]} ${effectiveBorderBottom} ${
                    isNavHighlighted ? getNavHighlightAnimClass(entry) : ''
                  } ${selStyle.bgClass}`}
                >
                  {/* 序号列 */}
                  {columnVisibility.index && (
                    <div 
                      data-source-field="index" style={{ width: `${colWidths.index}px` }}
                      className={`shrink-0 px-2 text-center text-slate-400 text-[10px] truncate border-r font-mono flex items-center justify-center ${borderClass}`}
                    >
                      <StackCell log={entry} onOpen={onOpenStack} />
                    </div>
                  )}

                  {/* 解析失败行处理 */}
                  {!entry.success ? (
                    <div className="flex-1 flex items-center gap-2 px-2 text-rose-500 font-mono text-[11px] overflow-hidden select-text">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold text-[10px] shrink-0 border ${
                        isLight ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-950 text-rose-400 border-rose-800/80'
                      }`}>
                        <AlertOctagon className="w-3 h-3 text-rose-500" />
                        解析失败行
                      </span>
                      <span className={`font-mono italic select-text ${textDisplayClass}`} title={entry.rawText}>
                        <HighlightedText
                          text={entry.rawText}
                          highlight={highlightKeyword}
                          matchCase={highlightMatchCase ?? matchCase}
                          isRegex={highlightIsRegex}
                          searchHighlight={searchKeyword}
                          searchMatchCase={searchMatchCase}
                          searchIsRegex={searchIsRegex}
                          pinnedHighlights={filter?.pinnedHighlights}
                          theme={theme}
                          legacyHighlightStyle={legacyHighlightStyle}
                        />
                      </span>
                      {entry.parseErrorReason && (
                        <span className="text-[10px] text-rose-500/80 shrink-0 hidden sm:inline ml-auto font-sans">
                          [{entry.parseErrorReason}]
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* 1. 时间戳 */}
                      {columnVisibility.timestamp && (
                        <div 
                          data-source-field="timestamp" style={{ width: `${colWidths.timestamp}px` }}
                          className={`shrink-0 px-2 font-mono truncate border-r select-text flex items-center ${borderClass}`}
                        >
                          <HighlightedText
                            text={entry.fields?.timestamp || ''}
                            highlight={highlightKeyword}
                            matchCase={highlightMatchCase ?? matchCase}
                            isRegex={highlightIsRegex}
                            searchHighlight={searchKeyword}
                            searchMatchCase={searchMatchCase}
                            searchIsRegex={searchIsRegex}
                            pinnedHighlights={filter?.pinnedHighlights}
                            theme={theme}
                            legacyHighlightStyle={legacyHighlightStyle}
                          />
                        </div>
                      )}

                      {/* 2. 日志级别 */}
                      {columnVisibility.level && (
                        <div 
                          data-source-field="level" style={{ width: `${colWidths.level}px` }}
                          className={`shrink-0 px-1 text-center border-r flex items-center justify-center ${borderClass}`}
                        >
                          <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] tracking-wider ${getLevelStyle(entry.fields?.level)}`}>
                            {entry.fields?.level}
                          </span>
                        </div>
                      )}

                      {/* 3. 请求ID */}
                      {columnVisibility.requestId && (
                        <div 
                          data-source-field="requestId" style={{ width: `${colWidths.requestId}px` }}
                          className={`shrink-0 px-2 font-mono text-blue-500 dark:text-blue-300/90 truncate border-r select-text flex items-center ${borderClass}`} 
                          title={entry.fields?.requestId}
                        >
                          <HighlightedText
                            text={entry.fields?.requestId || ''}
                            highlight={highlightKeyword}
                            matchCase={highlightMatchCase ?? matchCase}
                            isRegex={highlightIsRegex}
                            searchHighlight={searchKeyword}
                            searchMatchCase={searchMatchCase}
                            searchIsRegex={searchIsRegex}
                            pinnedHighlights={filter?.pinnedHighlights}
                            theme={theme}
                            legacyHighlightStyle={legacyHighlightStyle}
                          />
                        </div>
                      )}

                      {/* 4. 操作描述 */}
                      {columnVisibility.operationDesc && (
                        <div
                          data-source-field="operationDesc" style={{ minWidth: `${colWidths.operationDesc}px` }}
                          className={`flex-1 shrink-0 px-2.5 font-mono border-r select-text flex items-center ${borderClass} ${textDisplayClass}`}
                          title={entry.fields?.operationDesc}
                        >
                          {entry.stack ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenStack(entry); }} className="min-h-6 min-w-0 text-left underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label={`查看堆栈：${stackSummary(entry.stack)}`}>
                            <HighlightedText text={`${stackSummary(entry.stack)} · ${frameCount(entry.stack)} 帧`} searchHighlight={searchKeyword} searchMatchCase={searchMatchCase} searchIsRegex={searchIsRegex} theme={theme} />
                          </button> :
                          <HighlightedText
                            text={entry.stack ? `${stackSummary(entry.stack)} · ${frameCount(entry.stack)} 帧` : entry.fields?.operationDesc || ''}
                            highlight={highlightKeyword}
                            matchCase={highlightMatchCase ?? matchCase}
                            isRegex={highlightIsRegex}
                            searchHighlight={searchKeyword}
                            searchMatchCase={searchMatchCase}
                            searchIsRegex={searchIsRegex}
                            pinnedHighlights={filter?.pinnedHighlights}
                            theme={theme}
                            legacyHighlightStyle={legacyHighlightStyle}
                          />
                          }
                        </div>
                      )}

                      {/* 5. 函数名 */}
                      {columnVisibility.functionName && (
                        <div 
                          data-source-field="functionName" style={{ width: `${colWidths.functionName}px` }}
                          className={`shrink-0 px-2 font-mono text-emerald-600 dark:text-emerald-300/90 border-r flex items-center justify-between group/func overflow-hidden ${borderClass}`} 
                          title={entry.fields?.functionName}
                        >
                          <span className="truncate select-text">
                            <HighlightedText
                              text={entry.fields?.functionName || ''}
                              highlight={highlightKeyword}
                              matchCase={highlightMatchCase ?? matchCase}
                              isRegex={highlightIsRegex}
                              searchHighlight={searchKeyword}
                              searchMatchCase={searchMatchCase}
                              searchIsRegex={searchIsRegex}
                              pinnedHighlights={filter?.pinnedHighlights}
                              theme={theme}
                              legacyHighlightStyle={legacyHighlightStyle}
                            />
                          </span>
                          {entry.fields?.functionName && copyActionsAt(registeredCopyActions, CopyPlacement.Cell, 'functionName')[0] && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                runRegisteredCopy(copyActionsAt(registeredCopyActions, CopyPlacement.Cell, 'functionName')[0], [entry]);
                              }}
                              className={`opacity-0 group-hover/func:opacity-100 p-0.5 rounded transition-opacity shrink-0 ml-1 cursor-pointer ${
                                isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-700 text-slate-300'
                              }`}
                              title={copyActionsAt(registeredCopyActions, CopyPlacement.Cell, 'functionName')[0].label}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* 6. 线程ID */}
                      {columnVisibility.threadId && (
                        <div 
                          data-source-field="threadId" style={{ width: `${colWidths.threadId}px` }}
                          className={`shrink-0 px-2 text-center font-mono text-purple-600 dark:text-purple-300/80 truncate border-r select-text flex items-center justify-center ${borderClass}`}
                        >
                          <HighlightedText
                            text={entry.fields?.threadId || ''}
                            highlight={highlightKeyword}
                            matchCase={highlightMatchCase ?? matchCase}
                            isRegex={highlightIsRegex}
                            searchHighlight={searchKeyword}
                            searchMatchCase={searchMatchCase}
                            searchIsRegex={searchIsRegex}
                            pinnedHighlights={filter?.pinnedHighlights}
                            theme={theme}
                            legacyHighlightStyle={legacyHighlightStyle}
                          />
                        </div>
                      )}

                      {/* 7. 内存地址 */}
                      {columnVisibility.memoryAddress && (
                        <div 
                          data-source-field="memoryAddress" style={{ width: `${colWidths.memoryAddress}px` }}
                          className={`shrink-0 px-2 font-mono text-slate-500 dark:text-slate-400 truncate border-r text-[11px] select-text flex items-center ${borderClass}`} 
                          title={entry.fields?.memoryAddress}
                        >
                          <HighlightedText
                            text={entry.fields?.memoryAddress || ''}
                            highlight={highlightKeyword}
                            matchCase={highlightMatchCase ?? matchCase}
                            isRegex={highlightIsRegex}
                            searchHighlight={searchKeyword}
                            searchMatchCase={searchMatchCase}
                            searchIsRegex={searchIsRegex}
                            pinnedHighlights={filter?.pinnedHighlights}
                            theme={theme}
                            legacyHighlightStyle={legacyHighlightStyle}
                          />
                        </div>
                      )}

                      {/* 8. 模块 */}
                      {columnVisibility.module && (
                        <div 
                          data-source-field="module" style={{ width: `${colWidths.module}px` }}
                          className={`shrink-0 px-2 font-mono text-amber-600 dark:text-amber-300/80 truncate border-r select-text flex items-center ${borderClass}`} 
                          title={entry.fields?.module}
                        >
                          <HighlightedText
                            text={entry.fields?.module || ''}
                            highlight={highlightKeyword}
                            matchCase={highlightMatchCase ?? matchCase}
                            isRegex={highlightIsRegex}
                            searchHighlight={searchKeyword}
                            searchMatchCase={searchMatchCase}
                            searchIsRegex={searchIsRegex}
                            pinnedHighlights={filter?.pinnedHighlights}
                            theme={theme}
                            legacyHighlightStyle={legacyHighlightStyle}
                          />
                        </div>
                      )}

                      {/* 9. 文件名 */}
                      {columnVisibility.fileName && (
                        <div 
                          data-source-field="fileName" style={{ width: `${colWidths.fileName}px` }}
                          className={`shrink-0 px-2 font-mono text-slate-700 dark:text-slate-300 border-r text-[11px] flex items-center justify-between group/file overflow-hidden ${borderClass}`} 
                          title={`${entry.fields?.fileName}:${entry.fields?.lineNumber}`}
                        >
                          <span className="truncate select-text">
                            <HighlightedText
                              text={entry.fields?.fileName || ''}
                              highlight={highlightKeyword}
                              matchCase={highlightMatchCase ?? matchCase}
                              isRegex={highlightIsRegex}
                              searchHighlight={searchKeyword}
                              searchMatchCase={searchMatchCase}
                              searchIsRegex={searchIsRegex}
                              pinnedHighlights={filter?.pinnedHighlights}
                              theme={theme}
                              legacyHighlightStyle={legacyHighlightStyle}
                            />
                          </span>
                          {entry.fields?.fileName && copyActionsAt(registeredCopyActions, CopyPlacement.Cell, 'fileName')[0] && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                runRegisteredCopy(copyActionsAt(registeredCopyActions, CopyPlacement.Cell, 'fileName')[0], [entry]);
                              }}
                              className={`opacity-0 group-hover/file:opacity-100 p-0.5 rounded transition-opacity shrink-0 ml-1 cursor-pointer flex items-center gap-0.5 text-[10px] ${
                                isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-700 text-slate-300'
                              }`}
                              title={copyActionsAt(registeredCopyActions, CopyPlacement.Cell, 'fileName')[0].label}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* 10. 行号 */}
                      {columnVisibility.lineNumber && (
                        <div 
                          data-source-field="lineNumber" style={{ width: `${colWidths.lineNumber}px` }}
                          className="shrink-0 px-2 text-right pr-3 font-mono text-slate-400 select-text flex items-center justify-end gap-1"
                        >
                          <span className="select-text">{entry.fields?.lineNumber}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
        )}
        </div>
      </div>

      {/* 列宽调整时的全屏覆盖层与垂直参考线 */}
      {resizingCol && (
        <div className="fixed inset-0 z-[9990] cursor-col-resize select-none" />
      )}
      {resizingCol && guideX !== null && (
        <div
          style={{ left: `${guideX}px` }}
          className="fixed top-0 bottom-0 w-0.5 bg-indigo-500 dark:bg-indigo-400 z-[9995] pointer-events-none shadow-[0_0_10px_rgba(99,102,241,0.8)]"
        />
      )}

      {/* 浮动上浮淡出复制反馈 Toast */}
      {floatingToasts.map((toast) => (
        <div
          key={toast.id}
          style={{ left: `${toast.x}px`, top: `${toast.y}px` }}
          className="fixed -translate-x-1/2 -translate-y-full z-[9999] pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white shadow-xl text-xs font-semibold animate-float-up-fade backdrop-blur-md"
        >
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{toast.text}</span>
        </div>
      ))}

      {openColumnFilter && filterAnchor ? (
        <ColumnFilterPopover
          column={openColumnFilter}
          anchor={filterAnchor}
          filter={filter}
          options={filterOptions(openColumnFilter, uniqueModules, uniqueThreads)}
          timeRange={timeRange}
          theme={theme}
          onFilterChange={onFilterChange}
          onClose={closeColumnFilter}
        />
      ) : null}
      {copyTarget ? (
        <CopyActionPopover
          actions={copyTarget.actions}
          selectedLogs={selectedLogs}
          filteredLogs={logs}
          anchor={copyTarget.anchor}
          theme={theme}
          onResult={(feedback) => { setToastOk(feedback.ok); setToastMessage(feedback.message); setTimeout(() => setToastMessage(null), 2400); }}
          onClose={() => setCopyTarget(null)}
        />
      ) : null}
    </div>
  );
};
