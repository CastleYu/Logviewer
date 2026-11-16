import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Bot, Check, ChevronDown, FileText, FlaskConical, FolderOpen, HardDrive, History,
  Layers3, Moon, ScrollText, SlidersHorizontal, Sun, Upload, WrapText, X,
} from 'lucide-react';
import { Menu, Tooltip } from './Tooltip';
import { SourceSettings } from './SourceSettings';
import { SourceOpenerSwitch } from './SourceOpenerSwitch';
import { StackLegendTooltipContent } from './InlineStackTrace';
import { HistoryApi } from '../services/historyApi';
import { HistoryKind, type HistoryLog } from '../config/historyTypes';
import { ConfigError, LogFormatConfig } from '../config/logFormatTypes';
import { FormatDotPalette, HomeConst } from '../config/uiConstants';
import {
  BorderIntensity, ColumnVisibility, DisplayDensity, LogStats, ThemeMode,
} from '../types';
import { formatFileSize } from '../utils/logParser';

interface AppHeaderProps {
  stats: LogStats | null;
  origin?: string;
  isLoading: boolean;
  theme: ThemeMode;
  formats: LogFormatConfig[];
  selectedFormatId: string;
  configErrors: ConfigError[];
  stackEnabled: boolean;
  stackRawMode: boolean;
  sourceFiles: string[];
  hasRemoteServers: boolean;
  isRemoteActive: boolean;
  remoteTooltip: string;
  historyRevision?: string;
  aiOpen: boolean;
  // T13 视图菜单属性
  hasLogs: boolean;
  density: DisplayDensity;
  wordWrap: boolean;
  borderIntensity: BorderIntensity;
  columnVisibility: ColumnVisibility;
  legacyBoldSelection: boolean;
  legacyHighlightStyle: boolean;
  showLegacyViewOptions: boolean;
  onDensityChange: (density: DisplayDensity) => void;
  onWordWrapChange: (wordWrap: boolean) => void;
  onBorderIntensityChange: (intensity: BorderIntensity) => void;
  onColumnVisibilityChange: (cols: ColumnVisibility) => void;
  onLegacyBoldSelectionChange: (val: boolean) => void;
  onLegacyHighlightStyleChange: (val: boolean) => void;
  onResetColumnWidths: () => void;
  onOpenInvestigationViews: () => void;
  onStackRawModeChange: (raw: boolean) => void;
  // 顶栏核心回调
  onOpenLocal: () => void;
  onPickFile: () => void;
  onOpenRemote: () => void;
  onLoadSample: (count: number) => void;
  onClear: () => void;
  onToggleTheme: () => void;
  onFormatChange: (formatId: string) => void;
  onStackChange: (enabled: boolean) => void;
  onOpenAi: () => void;
  onOpenHistory: () => void;
  onOpenHistoryItem: (item: HistoryLog) => void;
}

type HeaderMenuKind = 'format' | 'view' | 'history' | 'open' | null;

const samples = [
  { label: '调试集', count: 1000 },
  { label: '标准集', count: 10000 },
  { label: '压力测试', count: 50000 },
];

const columnLabels: Array<{ key: keyof ColumnVisibility; label: string }> = [
  { key: 'index', label: '序号' },
  { key: 'timestamp', label: '时间戳' },
  { key: 'level', label: '级别' },
  { key: 'requestId', label: '请求ID' },
  { key: 'operationDesc', label: '操作描述' },
  { key: 'functionName', label: '函数名' },
  { key: 'threadId', label: '线程ID' },
  { key: 'memoryAddress', label: '内存地址' },
  { key: 'module', label: '模块' },
  { key: 'fileName', label: '文件名' },
  { key: 'lineNumber', label: '行号' },
];

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return date.toLocaleDateString();
}

/**
 * 应用顶栏（H1–H11 / T13 / M9 v3）：
 * 所有下拉菜单统一通过 Portal 挂载在 body 顶层；“视图”含行密度、列显隐、堆栈解析与 Alt+S 原文切换。
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  stats,
  origin,
  isLoading,
  theme,
  formats,
  selectedFormatId,
  configErrors,
  stackEnabled,
  stackRawMode,
  sourceFiles,
  hasRemoteServers,
  isRemoteActive,
  remoteTooltip,
  historyRevision,
  aiOpen,
  hasLogs,
  density,
  wordWrap,
  borderIntensity,
  columnVisibility,
  legacyBoldSelection,
  legacyHighlightStyle,
  showLegacyViewOptions,
  onDensityChange,
  onWordWrapChange,
  onBorderIntensityChange,
  onColumnVisibilityChange,
  onLegacyBoldSelectionChange,
  onLegacyHighlightStyleChange,
  onResetColumnWidths,
  onOpenInvestigationViews,
  onStackRawModeChange,
  onOpenLocal,
  onPickFile,
  onOpenRemote,
  onLoadSample,
  onClear,
  onToggleTheme,
  onFormatChange,
  onStackChange,
  onOpenAi,
  onOpenHistory,
  onOpenHistoryItem,
}) => {
  const [menuState, setMenuState] = useState<{ kind: HeaderMenuKind; anchor: DOMRect | null }>({ kind: null, anchor: null });
  const [formatCursor, setFormatCursor] = useState(0);
  const [recentHistory, setRecentHistory] = useState<HistoryLog[] | null>(null);

  const formatBtnRef = useRef<HTMLButtonElement>(null);
  const viewBtnRef = useRef<HTMLButtonElement>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);

  const light = theme === 'light';
  const formatIndex = Math.max(0, formats.findIndex((item) => item.id === selectedFormatId));
  const format = formats[formatIndex] || formats[0];

  const fileDetails = stats
    ? [
        `文件：${stats.fileName}`,
        `来源：${origin || '本地文件'}`,
        `解析记录：${stats.totalCount.toLocaleString()} 条`,
        `物理行数：${(stats.physicalLineCount ?? stats.totalCount).toLocaleString()} 行`,
        `解析耗时：${stats.parseDurationMs.toFixed(1)} ms`,
        `解析失败：${stats.failedCount.toLocaleString()} 条`,
      ].join('\n')
    : '';

  const closeMenu = () => setMenuState({ kind: null, anchor: null });

  const toggleMenu = (kind: Exclude<HeaderMenuKind, null>, el: HTMLElement | null) => {
    setMenuState((prev) => {
      if (prev.kind === kind) return { kind: null, anchor: null };
      if (kind === 'format') setFormatCursor(formatIndex);
      return { kind, anchor: el?.getBoundingClientRect() || null };
    });
  };

  useEffect(() => {
    if (menuState.kind !== 'history') return;
    let active = true;
    setRecentHistory(null);
    HistoryApi.list()
      .then((items) => {
        if (!active) return;
        const cleaned = items
          .filter((item) => item.kind !== HistoryKind.Sample)
          .sort((a, b) => b.created.localeCompare(a.created))
          .slice(0, HomeConst.HeaderHistoryLimit);
        setRecentHistory(cleaned);
      })
      .catch(() => {
        if (active) setRecentHistory([]);
      });
    return () => {
      active = false;
    };
  }, [menuState.kind, historyRevision]);

  useEffect(() => {
    if (menuState.kind !== 'format') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFormatCursor((idx) => (idx + 1) % formats.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFormatCursor((idx) => (idx - 1 + formats.length) % formats.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const picked = formats[formatCursor];
        if (picked && !isLoading) {
          onFormatChange(picked.id);
          closeMenu();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuState.kind, formatCursor, formats, isLoading, onFormatChange]);

  const pick = (action: () => void) => () => {
    closeMenu();
    action();
  };

  return (
    <header className="relative z-40 flex shrink-0 flex-col border-b border-line bg-surface text-ink">
      <div className="flex h-12 items-center gap-1.5 px-3">
        {/* 左侧：品牌 + 打开分裂 + 远程 + 历史 + 源码索引 + 自动打开器 */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {/* H1 品牌 */}
          <div className="flex shrink-0 items-center gap-2 pr-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
              <ScrollText className="h-4 w-4" />
            </span>
            <span className="hidden text-[13.5px] font-semibold tracking-tight md:inline">LogViewer</span>
          </div>

          {/* H10 打开分裂按钮 */}
          <div className="flex shrink-0">
            <Tooltip text="选择本地日志文件（也可直接拖入窗口）">
              <button
                type="button"
                onClick={onPickFile}
                disabled={isLoading}
                className="lv-btn lv-btn-primary h-[30px] rounded-r-none px-2.5"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">打开</span>
              </button>
            </Tooltip>
            <Tooltip text="更多打开方式">
              <button
                ref={openBtnRef}
                type="button"
                onClick={() => toggleMenu('open', openBtnRef.current)}
                disabled={isLoading}
                aria-haspopup="menu"
                aria-expanded={menuState.kind === 'open'}
                aria-label="更多打开方式"
                className="lv-btn lv-btn-primary h-[30px] rounded-l-none border-l border-l-white/25 px-1.5"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>

          {/* H8 远程按钮：始终显示图标与“远程”文字 + 绿色状态点 */}
          <Tooltip text={remoteTooltip}>
            <button
              type="button"
              onClick={onOpenRemote}
              className={`lv-btn h-[30px] shrink-0 px-2.5 ${isRemoteActive ? '!border-accent/45 !bg-accent-soft !text-accent-ink' : ''}`}
            >
              <span className="relative inline-flex items-center">
                <HardDrive className="h-3.5 w-3.5 text-accent" />
                {hasRemoteServers || isRemoteActive ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-surface bg-ok" aria-hidden="true" />
                ) : null}
              </span>
              <span>远程</span>
            </button>
          </Tooltip>

          {/* H7 历史记录下拉 */}
          <Tooltip text="最近打开的历史日志">
            <button
              ref={historyBtnRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuState.kind === 'history'}
              aria-label="历史日志"
              onClick={() => toggleMenu('history', historyBtnRef.current)}
              className={`lv-icon-btn h-[30px] w-[30px] shrink-0 ${menuState.kind === 'history' ? '!bg-raised !text-ink' : ''}`}
            >
              <History className="h-4 w-4" />
            </button>
          </Tooltip>

          {/* H4 / H5 源码索引设置与自动打开程序 */}
          <div className="hidden items-center gap-1 lg:flex">
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
            <SourceSettings format={format} light={light} />
            <SourceOpenerSwitch files={sourceFiles} light={light} />
          </div>
        </div>

        <span className="flex-1" />

        {/* 右侧：日志格式 + 视图 + 主题 + 当前文件标签页（含关闭） */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {/* H2 自定义日志格式选择器（Portal 菜单 + 颜色圆点 + 键盘导航） */}
          <Tooltip
            text={
              configErrors.length
                ? `日志格式配置存在 ${configErrors.length} 条告警，点击查看`
                : `当前格式：${format.name}`
            }
          >
            <button
              ref={formatBtnRef}
              type="button"
              disabled={isLoading}
              aria-haspopup="menu"
              aria-expanded={menuState.kind === 'format'}
              aria-label="日志格式"
              onClick={() => toggleMenu('format', formatBtnRef.current)}
              className="lv-btn h-[30px] max-w-[180px] shrink px-2"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: FormatDotPalette.colorAt(formatIndex) }}
                aria-hidden="true"
              />
              <span className="min-w-0 truncate text-[12px] text-ink">{format.name}</span>
              {configErrors.length > 0 ? (
                <span className="rounded bg-warn px-1 text-[10px] font-bold text-white">{configErrors.length}</span>
              ) : null}
              <ChevronDown className="h-3 w-3 shrink-0 text-ink-3" />
            </button>
          </Tooltip>

          {/* T13 + M9 v3 视图按钮（行密度 / 堆栈解析 / Alt+S / 显隐列） */}
          {hasLogs ? (
            <Tooltip text="视图布局、列显示与堆栈解析设置">
              <button
                ref={viewBtnRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuState.kind === 'view'}
                aria-label="视图设置"
                onClick={() => toggleMenu('view', viewBtnRef.current)}
                className={`lv-btn h-[30px] px-2 ${menuState.kind === 'view' ? '!border-accent/40 !bg-accent-soft !text-accent-ink' : ''}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden md:inline">视图</span>
                <ChevronDown className="h-3 w-3 text-ink-3" />
              </button>
            </Tooltip>
          ) : null}

          {/* H9 主题切换 */}
          <Tooltip text={light ? '切换到深色模式' : '切换到浅色模式'}>
            <button
              type="button"
              onClick={onToggleTheme}
              className="lv-icon-btn h-[30px] w-[30px] shrink-0"
              aria-label={light ? '切换到深色模式' : '切换到浅色模式'}
            >
              {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </Tooltip>

          {/* 当前文件标签与关闭 */}
          {stats ? (
            <div className="flex h-[30px] min-w-0 max-w-[min(300px,28vw)] items-center gap-1 rounded-lg border border-line bg-raised pl-2.5 pr-1">
              <Tooltip text={fileDetails} className="flex min-w-0 items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="min-w-8 truncate text-[12px] font-semibold">{stats.fileName}</span>
                <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-ink-3 xl:inline">
                  {formatFileSize(stats.fileSize)}
                </span>
              </Tooltip>
              <Tooltip text="关闭当前日志">
                <button
                  type="button"
                  onClick={onClear}
                  disabled={isLoading}
                  className="lv-icon-btn h-6 w-6 shrink-0"
                  aria-label="关闭当前日志"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
          ) : null}
        </div>
      </div>

      {/* 首页（未加载日志）条件第二行：保留唯一 AI 工作区切换入口 */}
      {!hasLogs ? (
        <div className="flex h-9 items-center justify-end border-t border-line bg-raised/70 px-3">
          <Tooltip text="AI 工作区：结合日志上下文提问与排查">
            <button
              type="button"
              onClick={onOpenAi}
              aria-pressed={aiOpen}
              aria-label="AI 工作区"
              className={`lv-btn h-7 px-2.5 ${
                aiOpen
                  ? '!border-accent !bg-accent-soft !text-accent-ink'
                  : '!border-line-strong !bg-surface !text-ink hover:!bg-sunken'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>AI</span>
            </button>
          </Tooltip>
        </div>
      ) : null}

      {/* H2 Portal 格式菜单 */}
      <Menu
        open={menuState.kind === 'format'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="选择日志格式"
        align="right"
        className="w-64"
      >
        {formats.map((item, idx) => {
          const active = item.id === format.id;
          const highlighted = idx === formatCursor;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onMouseEnter={() => setFormatCursor(idx)}
              onClick={() => {
                onFormatChange(item.id);
                closeMenu();
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                highlighted ? 'bg-raised' : ''
              } ${active ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink'}`}
            >
              <Check className={`h-3.5 w-3.5 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: FormatDotPalette.colorAt(idx) }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
            </button>
          );
        })}
        {configErrors.length > 0 ? (
          <div className="mt-1 border-t border-line px-2 py-1.5 text-[11px] text-warn">
            <div className="mb-1 flex items-center gap-1 font-semibold">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              配置告警（{configErrors.length}）
            </div>
            <ul className="max-h-24 space-y-0.5 overflow-auto text-[10px] text-ink-2">
              {configErrors.map((err, i) => (
                <li key={i} className="break-words font-mono">
                  {err.code}: {err.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Menu>

      {/* T13 + M9 v3 Portal 视图菜单 */}
      <Menu
        open={menuState.kind === 'view'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="视图设置"
        align="right"
        className="w-72 p-2.5 text-xs"
      >
        <p className="mb-1.5 text-[10.5px] font-semibold text-ink-3">行密度</p>
        <div className="grid grid-cols-3 gap-1">
          {([
            ['compact', '紧凑'],
            ['normal', '标准'],
            ['relaxed', '宽敞'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onDensityChange(value)}
              className={`rounded border px-2 py-1 text-center transition-colors ${
                density === value ? 'border-accent bg-accent-soft font-medium text-accent-ink' : 'border-line text-ink-2 hover:bg-raised'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="my-2.5 h-px bg-line" />
        <p className="mb-1 text-[10.5px] font-semibold text-ink-3">堆栈展示</p>
        <Tooltip content={<StackLegendTooltipContent />} text="堆栈标记图例" className="block w-full">
          <label className="flex w-full cursor-pointer items-center justify-between rounded px-1.5 py-1.5 hover:bg-raised">
            <span className="flex items-center gap-1.5 text-ink">
              <Layers3 className="h-3.5 w-3.5 text-accent" />
              解析堆栈
            </span>
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={stackEnabled}
              onChange={(event) => onStackChange(event.target.checked)}
            />
          </label>
        </Tooltip>
        <Tooltip text={stackEnabled ? '在行内结构化视图与原始堆栈文本间切换' : '需先开启“解析堆栈”'} kbd="Alt+S" className="block w-full">
          <label className={`flex w-full items-center justify-between rounded px-1.5 py-1.5 ${stackEnabled ? 'cursor-pointer hover:bg-raised' : 'opacity-45'}`}>
            <span className="flex items-center gap-1.5 text-ink">
              <span>堆栈原文模式</span>
              <kbd className="lv-kbd">Alt+S</kbd>
            </span>
            <input
              type="checkbox"
              disabled={!stackEnabled}
              className="accent-indigo-600"
              checked={stackRawMode}
              onChange={(event) => onStackRawModeChange(event.target.checked)}
            />
          </label>
        </Tooltip>

        <div className="my-2.5 h-px bg-line" />
        <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1.5 hover:bg-raised">
          <span className="flex items-center gap-1.5 text-ink">
            <WrapText className="h-3.5 w-3.5 text-ink-3" />
            自动换行
          </span>
          <input
            type="checkbox"
            className="accent-indigo-600"
            checked={wordWrap}
            onChange={(event) => onWordWrapChange(event.target.checked)}
          />
        </label>

        {showLegacyViewOptions ? (
          <>
            <p className="mb-1.5 mt-2 px-1 text-[10.5px] font-semibold text-ink-3">表格网格线</p>
            <div className="grid grid-cols-3 gap-1">
              {([
                ['light', '弱'],
                ['medium', '中'],
                ['strong', '强'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onBorderIntensityChange(value)}
                  className={`rounded border px-2 py-1 text-center transition-colors ${
                    borderIntensity === value ? 'border-accent bg-accent-soft font-medium text-accent-ink' : 'border-line text-ink-2 hover:bg-raised'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="my-2.5 h-px bg-line" />
            <p className="mb-1 text-[10.5px] font-semibold text-ink-3">数据列</p>
            <div className="grid max-h-40 grid-cols-2 gap-0.5 overflow-auto">
              {columnLabels.map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-ink hover:bg-raised">
                  <span className="truncate">{label}</span>
                  <input
                    type="checkbox"
                    className="accent-indigo-600"
                    checked={columnVisibility[key]}
                    onChange={(event) => onColumnVisibilityChange({ ...columnVisibility, [key]: event.target.checked })}
                  />
                </label>
              ))}
            </div>
            <label className="mt-2 flex cursor-pointer items-center justify-between border-t border-line px-1.5 pt-2 text-ink">
              <span>经典选中加粗</span>
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={legacyBoldSelection}
                onChange={(event) => onLegacyBoldSelectionChange(event.target.checked)}
              />
            </label>
            <label className="mt-1 flex cursor-pointer items-center justify-between px-1.5 text-ink">
              <span>经典高亮边框</span>
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={legacyHighlightStyle}
                onChange={(event) => onLegacyHighlightStyleChange(event.target.checked)}
              />
            </label>
          </>
        ) : null}

        <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
          <button type="button" className="lv-btn w-full" onClick={onResetColumnWidths}>
            重置默认列宽
          </button>
          <button
            type="button"
            className="lv-btn w-full justify-between"
            onClick={() => {
              closeMenu();
              onOpenInvestigationViews();
            }}
          >
            <span>调查视图</span>
            <span className="text-[10px] text-ink-3">保存 / 恢复</span>
          </button>
        </div>
      </Menu>

      {/* H7 Portal 历史下拉菜单 */}
      <Menu
        open={menuState.kind === 'history'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="历史日志"
        align="left"
        className="w-80"
      >
        <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-ink-3">
          <span>最近打开</span>
          {recentHistory && recentHistory.length > 0 ? <span>{recentHistory.length} 条</span> : null}
        </div>
        {recentHistory === null ? (
          <div className="space-y-1.5 p-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-sunken" />
            ))}
          </div>
        ) : recentHistory.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-3">还没有打开过日志</p>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-auto">
            {recentHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onOpenHistoryItem(item);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised"
              >
                {item.kind === HistoryKind.Remote ? (
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-accent" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{item.name}</span>
                  <span className="block truncate font-mono text-[10px] text-ink-3">{item.origin}</span>
                </span>
                <span className="shrink-0 text-right text-[10px] tabular-nums text-ink-3">
                  <span className="block">{relativeTime(item.created)}</span>
                  <span className="block font-mono">{formatFileSize(item.size)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 border-t border-line pt-1">
          <button
            type="button"
            role="menuitem"
            onClick={pick(onOpenHistory)}
            className="lv-menu-item justify-between font-medium text-accent-ink"
          >
            <span>查看全部历史…</span>
            <History className="h-3.5 w-3.5" />
          </button>
        </div>
      </Menu>

      {/* H10 Portal 打开下拉菜单 */}
      <Menu
        open={menuState.kind === 'open'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="更多打开方式"
        align="left"
        className="w-60"
      >
        <button type="button" role="menuitem" className="lv-menu-item" onClick={pick(onPickFile)}>
          <Upload className="h-3.5 w-3.5" />
          选择本地文件…
        </button>
        <button type="button" role="menuitem" className="lv-menu-item" onClick={pick(onOpenLocal)}>
          <FolderOpen className="h-3.5 w-3.5" />
          按本机路径打开…
        </button>
        <button type="button" role="menuitem" className="lv-menu-item" onClick={pick(onOpenRemote)}>
          <HardDrive className="h-3.5 w-3.5" />
          从远程服务器打开…
        </button>
        <div className="my-1 h-px bg-line" />
        <p className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold text-ink-3">示例日志</p>
        {samples.map((item) => (
          <button
            key={item.count}
            type="button"
            role="menuitem"
            className="lv-menu-item"
            onClick={pick(() => onLoadSample(item.count))}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="flex-1">{item.label}</span>
            <span className="font-mono text-[11px] text-ink-3">{item.count.toLocaleString()} 行</span>
          </button>
        ))}
        <div className="my-1 h-px bg-line lg:hidden" />
        <div className="flex items-center gap-1 px-1 pb-0.5 lg:hidden">
          <SourceSettings format={format} light={light} />
          <SourceOpenerSwitch files={sourceFiles} light={light} />
        </div>
      </Menu>
    </header>
  );
};
