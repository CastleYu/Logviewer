import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, Check, ChevronDown, ChevronUp, Copy, Download, Eye, EyeOff, Highlighter, Search, X,
} from 'lucide-react';
import { CopyScope, MenuLayerConst, OrdinalJump, TooltipConst, UiShortcutKey } from '../config/uiConstants';
import { FilterOptions, LogEntry, PinnedHighlight } from '../types';
import { HIGHLIGHT_COLOR_PRESETS } from '../utils/highlightColors';
import { Menu, Tooltip } from './Tooltip';

export interface ToolbarProps {
  filter: FilterOptions;
  onFilterChange: (updated: Partial<FilterOptions>) => void;
  filteredCount: number;
  totalCount: number;
  selectedCount: number;
  totalMatches: number;
  currentMatchIndex: number;
  searchActive: boolean;
  onTriggerSearch: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onJumpToMatch?: (ordinal: number) => void;
  onCopyScope: (scope: CopyScope, format: 'raw' | 'json') => Promise<number> | number;
  onExportScope: (scope: CopyScope, format: 'json' | 'csv') => void;
  searchableFields?: Array<{ key: string; label: string }>;
  logs: LogEntry[];
  aiOpen: boolean;
  onOpenAi: () => void;
}

type ToolbarMenuKind = 'searchColumns' | 'highlights' | 'export' | null;

const searchBuiltinColumns = [
  { key: 'ALL', label: '全部列 / 原始文本' },
  { key: 'operationDesc', label: '操作描述' },
  { key: 'requestId', label: '请求ID' },
  { key: 'level', label: '日志级别' },
  { key: 'module', label: '模块' },
  { key: 'functionName', label: '函数名' },
  { key: 'threadId', label: '线程ID' },
  { key: 'fileName', label: '文件名' },
  { key: 'lineNumber', label: '行号' },
  { key: 'memoryAddress', label: '内存地址' },
  { key: 'timestamp', label: '时间戳' },
];

/**
 * 精简调查工具栏（T1–T14）：单一搜索+分组上下条定位、独立高亮列表、右侧统一复制/导出。
 */
export const Toolbar: React.FC<ToolbarProps> = ({
  filter,
  onFilterChange,
  filteredCount,
  totalCount,
  selectedCount,
  totalMatches,
  currentMatchIndex,
  searchActive,
  onTriggerSearch,
  onNextMatch,
  onPrevMatch,
  onJumpToMatch,
  onCopyScope,
  onExportScope,
  searchableFields,
  logs,
  aiOpen,
  onOpenAi,
}) => {
  const [menuState, setMenuState] = useState<{ kind: ToolbarMenuKind; anchor: DOMRect | null }>({ kind: null, anchor: null });
  const [colorPinId, setColorPinId] = useState<string | null>(null);
  const [copiedBanner, setCopiedBanner] = useState<number | null>(null);
  const [copyScope, setCopyScope] = useState<CopyScope>(CopyScope.Filtered);
  const [editingJump, setEditingJump] = useState(false);
  const [jumpDraft, setJumpDraft] = useState('');
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [jumpErrorPos, setJumpErrorPos] = useState<{ left: number; top: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchControlRef = useRef<HTMLDivElement>(null);
  const counterBtnRef = useRef<HTMLButtonElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const searchColBtnRef = useRef<HTMLButtonElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  const pins = filter.pinnedHighlights || [];
  const searchColumns = searchableFields
    ? [{ key: 'ALL', label: '全部列 / 原始文本' }, ...searchableFields]
    : searchBuiltinColumns;
  const selectedColumns = filter.searchColumns?.length ? filter.searchColumns : [filter.searchColumn || 'ALL'];
  const searchColumnLabel = selectedColumns.includes('ALL')
    ? '全部列'
    : selectedColumns.length === 1
      ? searchColumns.find((item) => item.key === selectedColumns[0])?.label || selectedColumns[0]
      : `${selectedColumns.length} 列`;

  const trimmedKeyword = filter.searchKeyword.trim();
  const invalidSearchRegex =
    filter.isRegex && trimmedKeyword
      ? (() => {
          try {
            new RegExp(trimmedKeyword);
            return false;
          } catch {
            return true;
          }
        })()
      : false;

  const isDuplicatePin = Boolean(
    trimmedKeyword &&
      pins.some(
        (pin) =>
          pin.keyword === trimmedKeyword &&
          Boolean(pin.isRegex) === Boolean(filter.isRegex) &&
          Boolean(pin.matchCase) === Boolean(filter.matchCase),
      ),
  );
  const canPinHighlight = Boolean(trimmedKeyword && !invalidSearchRegex && !isDuplicatePin);

  const pinDisabledReason = !trimmedKeyword
    ? '先在搜索框输入关键词，再固定高亮'
    : invalidSearchRegex
      ? '正则表达式无效，请修正后再固定高亮'
      : isDuplicatePin
        ? '相同关键词与匹配规则已在高亮列表中'
        : '将当前关键词加入永久高亮标注';

  const closeMenu = () => {
    setMenuState({ kind: null, anchor: null });
    setColorPinId(null);
  };

  const toggleMenu = (kind: Exclude<ToolbarMenuKind, null>, el: HTMLElement | null) => {
    if (kind === 'export') {
      setCopyScope(selectedCount > 0 ? CopyScope.Selected : CopyScope.Filtered);
    }
    setMenuState((prev) =>
      prev.kind === kind ? { kind: null, anchor: null } : { kind, anchor: el?.getBoundingClientRect() || null },
    );
    setColorPinId(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && logs.length > 0) {
        event.preventDefault();
        closeMenu();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logs.length]);

  useEffect(() => {
    if (copiedBanner === null) return;
    const timer = window.setTimeout(() => setCopiedBanner(null), TooltipConst.ExportCopyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [copiedBanner]);

  const toggleSearchColumn = (key: string) => {
    if (key === 'ALL') {
      onFilterChange({ searchColumns: ['ALL'], searchColumn: 'ALL' });
      return;
    }
    let next = selectedColumns.filter((item) => item !== 'ALL');
    next = next.includes(key) ? next.filter((item) => item !== key) : [...next, key];
    if (!next.length) next = ['ALL'];
    onFilterChange({ searchColumns: next, searchColumn: next.length === 1 ? next[0] : 'ALL' });
  };

  const pinHighlight = () => {
    if (!canPinHighlight) return;
    const preset = HIGHLIGHT_COLOR_PRESETS[pins.length % HIGHLIGHT_COLOR_PRESETS.length];
    const nextPin: PinnedHighlight = {
      id: `${Date.now()}-${Math.random()}`,
      keyword: trimmedKeyword,
      color: preset.id,
      matchCase: filter.matchCase,
      isRegex: filter.isRegex,
      hidden: false,
    };
    onFilterChange({ pinnedHighlights: [...pins, nextPin] });
  };

  const handleCopyAction = async (format: 'raw' | 'json') => {
    const count = await Promise.resolve(onCopyScope(copyScope, format));
    closeMenu();
    if (count > 0) setCopiedBanner(count);
  };

  const scopeCount = (scope: CopyScope): number =>
    scope === CopyScope.Selected ? selectedCount : scope === CopyScope.Filtered ? filteredCount : totalCount;

  const activeScopeCount = scopeCount(copyScope);
  const defaultScope = selectedCount > 0 ? CopyScope.Selected : CopyScope.Filtered;
  const defaultScopeCount = scopeCount(defaultScope);
  const defaultScopeLabel = defaultScope === CopyScope.Selected ? '选中' : '筛选结果';

  const activeOrdinal = totalMatches > 0 ? Math.min(currentMatchIndex + 1, totalMatches) : 0;
  const matchCounterText = totalMatches > 0
    ? `${activeOrdinal}/${totalMatches}`
    : '0/0';
  const searchMiddleAriaLabel = !searchActive
    ? '搜索'
    : totalMatches === 0
      ? '没有匹配结果 0/0，点击重新搜索'
      : `当前匹配 ${matchCounterText}，点击按序号跳转`;
  const navDisabled = !trimmedKeyword || invalidSearchRegex;
  const isNoMatchActive = searchActive && totalMatches === 0;
  const canEditCounter = searchActive && totalMatches > 0 && !navDisabled;
  const ordinalInputWidth = `${Math.min(Math.max(String(totalMatches).length + 1.5, 3.2), 6.5)}ch`;

  useEffect(() => {
    if (!searchActive || totalMatches === 0 || navDisabled) {
      setEditingJump(false);
      setJumpError(null);
    } else {
      setJumpError(null);
    }
  }, [searchActive, totalMatches, navDisabled]);

  useEffect(() => {
    if (!editingJump) return;
    const input = jumpInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editingJump]);

  useLayoutEffect(() => {
    if (!editingJump || !jumpError || !searchControlRef.current) {
      setJumpErrorPos(null);
      return;
    }
    const rect = searchControlRef.current.getBoundingClientRect();
    const pad = MenuLayerConst.ViewportMarginPx;
    setJumpErrorPos({
      left: Math.max(pad, Math.min(rect.left, window.innerWidth - 220)),
      top: rect.bottom + MenuLayerConst.GapPx,
    });
  }, [editingJump, jumpError, jumpDraft, totalMatches]);

  const openJumpInput = () => {
    if (!canEditCounter) return;
    setJumpDraft(String(activeOrdinal));
    setJumpError(null);
    setEditingJump(true);
  };

  const cancelJumpInput = (restoreFocus = false) => {
    setEditingJump(false);
    setJumpError(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => counterBtnRef.current?.focus());
    }
  };

  const commitJumpInput = () => {
    const parsed = OrdinalJump.parse(jumpDraft, totalMatches);
    if (!parsed.ok) {
      setJumpError(parsed.error);
      jumpInputRef.current?.focus();
      return;
    }
    setJumpError(null);
    setEditingJump(false);
    onJumpToMatch?.(parsed.ordinal);
    window.requestAnimationFrame(() => counterBtnRef.current?.focus());
  };

  const searchNavBaseCls =
    'flex h-full items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:pointer-events-none disabled:bg-raised/70 disabled:text-ink-3';
  const searchNavBtnCls =
    `${searchNavBaseCls} text-accent-ink hover:bg-accent/15 focus-visible:ring-accent dark:hover:bg-accent/25`;
  const highlightSegBtnCls =
    'inline-flex h-full items-center text-[#0f6b43] transition-colors hover:bg-ok/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ok dark:text-[#7ee3b6] dark:hover:bg-ok/20';

  return (
    <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs text-ink-2" aria-label="日志调查栏">
      {/* 搜索输入 + 搜索控制 + 高亮分裂按钮 连续组合 */}
      <div
        className={`relative flex h-8 min-w-[280px] flex-1 basis-full items-stretch overflow-hidden rounded-md border bg-raised shadow-xs transition-colors focus-within:border-accent sm:max-w-[740px] sm:basis-auto ${
          invalidSearchRegex ? 'border-danger' : 'border-line-strong'
        }`}
      >
        {/* 搜索输入段 */}
        <div className="flex h-full min-w-[130px] flex-1 items-center bg-surface px-1.5">
          {/* 列范围选择 */}
          <Tooltip text="搜索匹配目标列（不改变当前筛选结果）">
            <button
              ref={searchColBtnRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuState.kind === 'searchColumns'}
              onClick={() => toggleMenu('searchColumns', searchColBtnRef.current)}
              className="mr-1 flex h-6 max-w-28 shrink-0 items-center gap-1 rounded bg-raised px-1.5 text-[11px] font-medium text-ink transition-colors hover:bg-sunken"
            >
              <span className="truncate">{searchColumnLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-ink-2" />
            </button>
          </Tooltip>

          <span className="mr-1.5 h-4 w-px shrink-0 bg-line-strong" aria-hidden="true" />

          <input
            ref={searchInputRef}
            id="log-investigation-search"
            aria-label="在当前筛选结果中搜索"
            value={filter.searchKeyword}
            onChange={(event) => onFilterChange({ searchKeyword: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === UiShortcutKey.Enter) {
                event.preventDefault();
                if (navDisabled) return;
                if (event.shiftKey) onPrevMatch();
                else if (!searchActive) onTriggerSearch();
                else onNextMatch();
              }
            }}
            placeholder="在当前筛选结果中搜索…"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-3"
          />

          {filter.searchKeyword ? (
            <Tooltip text="清空搜索词">
              <button
                type="button"
                className="lv-icon-btn h-6 w-6 shrink-0 text-ink-2"
                onClick={() => onFilterChange({ searchKeyword: '' })}
                aria-label="清空当前搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          ) : null}

          <Tooltip text="正则表达式匹配">
            <button
              type="button"
              aria-pressed={filter.isRegex}
              onClick={() => onFilterChange({ isRegex: !filter.isRegex })}
              className={`ml-0.5 rounded border px-1 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                filter.isRegex
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-transparent text-ink-2 hover:bg-raised hover:text-ink'
              }`}
            >
              .*
            </button>
          </Tooltip>

          <Tooltip text="区分大小写">
            <button
              type="button"
              aria-pressed={filter.matchCase}
              onClick={() => onFilterChange({ matchCase: !filter.matchCase })}
              className={`ml-0.5 rounded border px-1 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                filter.matchCase
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-transparent text-ink-2 hover:bg-raised hover:text-ink'
              }`}
            >
              Aa
            </button>
          </Tooltip>
        </div>

        {/* [ ▲ | 🔍 搜索 / (n/M) | ▼ ] 钴蓝主题搜索控制段（撑满分组高度） */}
        <div
          ref={searchControlRef}
          className="inline-flex h-full shrink-0 items-stretch border-l border-line-strong bg-accent-soft text-accent-ink"
        >
          <Tooltip text="上一条匹配（从当前视口向上查找）" kbd="Shift+Enter" className="inline-flex h-full">
            <button
              type="button"
              disabled={navDisabled}
              onClick={() => {
                if (editingJump) cancelJumpInput();
                onPrevMatch();
              }}
              aria-label="上一条匹配"
              className={`${searchNavBtnCls} w-6 border-r border-accent/20 dark:border-accent/25`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </Tooltip>

          {editingJump && canEditCounter ? (
            <div className="flex h-full items-center gap-1 bg-accent-soft px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-accent-ink/80" aria-hidden="true" />
              <input
                ref={jumpInputRef}
                type="text"
                inputMode="numeric"
                value={jumpDraft}
                style={{ width: ordinalInputWidth }}
                onChange={(event) => {
                  setJumpDraft(event.target.value);
                  if (jumpError) setJumpError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === UiShortcutKey.Enter) {
                    event.preventDefault();
                    event.stopPropagation();
                    commitJumpInput();
                  } else if (event.key === UiShortcutKey.Escape) {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelJumpInput(true);
                  }
                }}
                onBlur={(event) => {
                  if (!searchControlRef.current?.contains(event.relatedTarget as Node | null)) {
                    cancelJumpInput();
                  }
                }}
                aria-label="跳转到第几条匹配（按 Enter 确认）"
                aria-invalid={Boolean(jumpError)}
                className={`h-[22px] min-w-[2.25rem] rounded border bg-surface px-1 text-center font-mono text-[11px] font-semibold tabular-nums text-ink outline-none transition-colors ${
                  jumpError
                    ? 'border-danger ring-2 ring-danger/25'
                    : 'border-accent/65 focus:border-accent focus:ring-2 focus:ring-accent/20'
                }`}
              />
              <span className="font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap text-accent-ink/80">
                /{totalMatches}
              </span>
            </div>
          ) : (
            <Tooltip
              text={
                !searchActive
                  ? '从当前可见首行向下搜索（Enter）'
                  : totalMatches === 0
                    ? '当前筛选结果中没有匹配项'
                    : `当前第 ${activeOrdinal} 条（共 ${totalMatches} 条），点击输入序号跳转`
              }
              className="inline-flex h-full"
            >
              <button
                ref={counterBtnRef}
                type="button"
                disabled={navDisabled}
                aria-label={searchMiddleAriaLabel}
                onClick={() => (!searchActive || totalMatches === 0 ? onTriggerSearch() : openJumpInput())}
                className={
                  isNoMatchActive
                    ? `${searchNavBaseCls} min-w-[60px] gap-1 px-2 bg-danger-soft/85 text-danger hover:bg-danger/15 focus-visible:ring-danger dark:hover:bg-danger/20`
                    : `${searchNavBtnCls} ${!searchActive ? 'gap-1.5 px-2.5' : 'min-w-[60px] gap-1 px-2'}`
                }
              >
                <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {searchActive ? (
                  <span className="font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap">
                    {matchCounterText}
                  </span>
                ) : (
                  <span className="font-sans text-[12px] font-medium whitespace-nowrap">搜索</span>
                )}
              </button>
            </Tooltip>
          )}

          <Tooltip text="下一条匹配（从当前视口向下查找）" kbd="Enter" className="inline-flex h-full">
            <button
              type="button"
              disabled={navDisabled}
              onClick={() => {
                if (editingJump) cancelJumpInput();
                if (!searchActive) onTriggerSearch();
                else onNextMatch();
              }}
              aria-label="下一条匹配"
              className={`${searchNavBtnCls} w-6 border-l border-accent/20 dark:border-accent/25`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>

        {/* [ 🖍 高亮 | ▾ ] 翡翠绿主题高亮分裂段（撑满分组高度） */}
        <div className="inline-flex h-full shrink-0 items-stretch border-l border-line-strong bg-ok-soft text-[#0f6b43] dark:text-[#7ee3b6]">
          <Tooltip text={pinDisabledReason} className="inline-flex h-full">
            <button
              type="button"
              disabled={!canPinHighlight}
              onClick={pinHighlight}
              className={`group ${highlightSegBtnCls} gap-1.5 px-2.5 text-[12px] font-medium whitespace-nowrap disabled:pointer-events-none disabled:bg-raised/70 disabled:text-ink-3`}
            >
              <Highlighter className="h-3.5 w-3.5 shrink-0" />
              <span>高亮</span>
              {pins.length > 0 ? (
                <span className="rounded bg-ok/15 px-1 font-mono text-[10px] font-semibold tabular-nums text-[#0f6b43] group-disabled:bg-sunken group-disabled:text-ink-3 dark:bg-ok/25 dark:text-[#96ecc6]">
                  {pins.length}
                </span>
              ) : null}
            </button>
          </Tooltip>
          <Tooltip text="管理永久高亮列表" className="inline-flex h-full">
            <button
              ref={highlightBtnRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuState.kind === 'highlights'}
              aria-label="高亮列表"
              onClick={() => toggleMenu('highlights', highlightBtnRef.current)}
              className={`${highlightSegBtnCls} justify-center border-l border-ok/25 px-1.5 dark:border-ok/30`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {invalidSearchRegex ? (
        <span role="alert" className="text-[11px] font-medium text-danger">
          正则语法错误
        </span>
      ) : null}

      <span className="flex-1" />

      <div className="flex shrink-0 items-center gap-1.5">
        {/* T14 统一复制 / 导出 ▾ */}
        <Tooltip
          text={
            copiedBanner !== null
              ? `已复制到剪贴板（${copiedBanner.toLocaleString()} 条）`
              : `复制或导出日志（默认作用范围：${defaultScopeLabel} ${defaultScopeCount.toLocaleString()} 条）`
          }
        >
          <button
            ref={exportBtnRef}
            type="button"
            disabled={totalCount === 0}
            aria-haspopup="menu"
            aria-expanded={menuState.kind === 'export'}
            onClick={() => toggleMenu('export', exportBtnRef.current)}
            className={`lv-btn h-8 shrink-0 px-2.5 ${
              copiedBanner !== null
                ? '!border-ok/40 !bg-ok-soft !text-ok'
                : '!border-line-strong !bg-raised !text-ink hover:!bg-sunken'
            }`}
          >
            {copiedBanner !== null ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedBanner !== null ? `已复制 ${copiedBanner.toLocaleString()} 条` : '复制 / 导出'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-2" />
          </button>
        </Tooltip>

        {/* AI 工作区切换（已打开日志时位于调查工具栏右侧） */}
        <Tooltip text="AI 工作区：结合日志上下文提问与排查">
          <button
            type="button"
            onClick={onOpenAi}
            aria-pressed={aiOpen}
            aria-label="AI 工作区"
            className={`lv-btn h-8 shrink-0 px-2.5 ${
              aiOpen
                ? '!border-accent !bg-accent-soft !text-accent-ink'
                : '!border-line-strong !bg-raised !text-ink hover:!bg-sunken'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span>AI</span>
          </button>
        </Tooltip>
      </div>

      {/* Portal: 搜索目标列菜单 */}
      <Menu
        open={menuState.kind === 'searchColumns'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="选择搜索列"
        className="w-56"
      >
        <p className="px-2 py-1 text-[10px] font-semibold text-ink-3">搜索范围 · 不改变当前列表</p>
        {searchColumns.map((column) => (
          <label
            key={column.key}
            className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs text-ink hover:bg-raised"
          >
            <span className="truncate">{column.label}</span>
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={selectedColumns.includes(column.key)}
              onChange={() => toggleSearchColumn(column.key)}
            />
          </label>
        ))}
      </Menu>

      {/* Portal: 永久高亮列表菜单 */}
      <Menu
        open={menuState.kind === 'highlights'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="高亮规则列表"
        className="w-80 p-2"
      >
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-ink-2">永久高亮 · {pins.length}</span>
          {pins.length > 0 ? (
            <button
              type="button"
              className="text-[11px] text-ink-3 hover:text-danger"
              onClick={() => {
                onFilterChange({ pinnedHighlights: [] });
                setColorPinId(null);
              }}
            >
              清除全部
            </button>
          ) : null}
        </div>
        {pins.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-ink-3">
            尚无高亮规则。在搜索框输入关键词后点击“高亮”固定。
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-auto">
            {pins.map((pin) => {
              const preset = HIGHLIGHT_COLOR_PRESETS.find((item) => item.id === pin.color) || HIGHLIGHT_COLOR_PRESETS[0];
              const isHidden = Boolean(pin.hidden);
              return (
                <div key={pin.id} className="rounded px-1.5 py-1 hover:bg-raised">
                  <div className="flex min-h-7 items-center gap-1.5">
                    <Tooltip text="更换颜色">
                      <button
                        type="button"
                        className={`h-3.5 w-3.5 shrink-0 rounded-full ${preset.bgDot} ${isHidden ? 'opacity-40' : ''}`}
                        onClick={() => setColorPinId(colorPinId === pin.id ? null : pin.id)}
                        aria-label={`调整高亮 ${pin.keyword} 颜色`}
                      />
                    </Tooltip>
                    <Tooltip text="点击回填到搜索框" className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => {
                          onFilterChange({
                            searchKeyword: pin.keyword,
                            isRegex: Boolean(pin.isRegex),
                            matchCase: Boolean(pin.matchCase),
                          });
                          closeMenu();
                          searchInputRef.current?.focus();
                        }}
                        className={`w-full truncate text-left font-mono text-xs ${
                          isHidden ? 'text-ink-3 line-through' : 'text-ink hover:text-accent-ink'
                        }`}
                      >
                        {pin.keyword}
                      </button>
                    </Tooltip>
                    {pin.isRegex ? (
                      <span className="rounded bg-sunken px-1 font-mono text-[9px] text-ink-3">.*</span>
                    ) : null}
                    {pin.matchCase ? (
                      <span className="rounded bg-sunken px-1 font-mono text-[9px] text-ink-3">Aa</span>
                    ) : null}
                    <Tooltip text={isHidden ? '显示此高亮' : '暂时隐藏'}>
                      <button
                        type="button"
                        aria-label={isHidden ? `显示高亮 ${pin.keyword}` : `隐藏高亮 ${pin.keyword}`}
                        onClick={() =>
                          onFilterChange({
                            pinnedHighlights: pins.map((item) =>
                              item.id === pin.id ? { ...item, hidden: !item.hidden } : item,
                            ),
                          })
                        }
                        className="lv-icon-btn h-6 w-6 shrink-0"
                      >
                        {isHidden ? <EyeOff className="h-3.5 w-3.5 text-ink-3" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </Tooltip>
                    <Tooltip text="移除此高亮">
                      <button
                        type="button"
                        className="lv-icon-btn h-6 w-6 shrink-0"
                        onClick={() =>
                          onFilterChange({ pinnedHighlights: pins.filter((item) => item.id !== pin.id) })
                        }
                        aria-label={`移除高亮 ${pin.keyword}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                  {colorPinId === pin.id ? (
                    <div className="mt-1.5 flex items-center gap-1.5 pl-5">
                      {HIGHLIGHT_COLOR_PRESETS.map((color) => (
                        <React.Fragment key={color.id}>
                          <Tooltip text={color.name}>
                            <button
                              type="button"
                              aria-label={`使用${color.name}`}
                              className={`h-4 w-4 rounded-full ${color.bgDot} ${
                                pin.color === color.id ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''
                              }`}
                              onClick={() => {
                                onFilterChange({
                                  pinnedHighlights: pins.map((item) =>
                                    item.id === pin.id ? { ...item, color: color.id } : item,
                                  ),
                                });
                                setColorPinId(null);
                              }}
                            />
                          </Tooltip>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Menu>

      {/* Portal: 统一复制 / 导出菜单（T14） */}
      <Menu
        open={menuState.kind === 'export'}
        anchor={menuState.anchor}
        onClose={closeMenu}
        label="复制与导出"
        align="right"
        className="w-64 p-2"
      >
        <p className="mb-1.5 px-1 text-[10.5px] font-semibold text-ink-3">作用范围</p>
        <div className="lv-seg mb-2 w-full">
          <button
            type="button"
            disabled={selectedCount === 0}
            aria-pressed={copyScope === CopyScope.Selected}
            onClick={() => setCopyScope(CopyScope.Selected)}
            className="flex-1 text-[11px] disabled:opacity-40"
          >
            选中 ({selectedCount})
          </button>
          <button
            type="button"
            aria-pressed={copyScope === CopyScope.Filtered}
            onClick={() => setCopyScope(CopyScope.Filtered)}
            className="flex-1 text-[11px]"
          >
            筛选 ({filteredCount.toLocaleString()})
          </button>
          {filteredCount < totalCount ? (
            <button
              type="button"
              aria-pressed={copyScope === CopyScope.All}
              onClick={() => setCopyScope(CopyScope.All)}
              className="flex-1 text-[11px]"
            >
              全部 ({totalCount.toLocaleString()})
            </button>
          ) : null}
        </div>

        <p className="mb-1.5 px-1 text-[11px] text-ink-3">
          将操作 <strong className="font-mono text-ink">{activeScopeCount.toLocaleString()}</strong> 条日志
        </p>

        <Tooltip text={`复制当前范围内的 ${activeScopeCount.toLocaleString()} 条原始日志文本`} className="block w-full">
          <button
            type="button"
            role="menuitem"
            disabled={activeScopeCount === 0}
            onClick={() => void handleCopyAction('raw')}
            className="lv-menu-item w-full disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="flex-1">复制原文</span>
            <span className="font-mono text-[10px] text-ink-3">{activeScopeCount.toLocaleString()} 条</span>
          </button>
        </Tooltip>

        <Tooltip text={`将范围内的 ${activeScopeCount.toLocaleString()} 条日志以 JSON 复制到剪贴板`} className="block w-full">
          <button
            type="button"
            role="menuitem"
            disabled={activeScopeCount === 0}
            onClick={() => void handleCopyAction('json')}
            className="lv-menu-item w-full disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="flex-1">复制 JSON</span>
            <span className="font-mono text-[10px] text-ink-3">{activeScopeCount.toLocaleString()} 条</span>
          </button>
        </Tooltip>

        <div className="my-1 h-px bg-line" />

        <Tooltip text={`导出当前范围内的 ${activeScopeCount.toLocaleString()} 条日志为 .csv 文件`} className="block w-full">
          <button
            type="button"
            role="menuitem"
            disabled={activeScopeCount === 0}
            onClick={() => {
              onExportScope(copyScope, 'csv');
              closeMenu();
            }}
            className="lv-menu-item w-full disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="flex-1">导出 CSV</span>
            <span className="font-mono text-[10px] text-ink-3">.csv</span>
          </button>
        </Tooltip>

        <Tooltip text={`导出当前范围内的 ${activeScopeCount.toLocaleString()} 条日志为 .json 文件`} className="block w-full">
          <button
            type="button"
            role="menuitem"
            disabled={activeScopeCount === 0}
            onClick={() => {
              onExportScope(copyScope, 'json');
              closeMenu();
            }}
            className="lv-menu-item w-full disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="flex-1">导出 JSON</span>
            <span className="font-mono text-[10px] text-ink-3">.json</span>
          </button>
        </Tooltip>
      </Menu>

      {editingJump && jumpError && jumpErrorPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="alert"
              style={{ left: jumpErrorPos.left, top: jumpErrorPos.top, zIndex: MenuLayerConst.ZIndex }}
              className="pointer-events-none fixed whitespace-nowrap rounded-md border border-danger/60 bg-surface px-2 py-1 text-[11px] font-medium text-danger shadow-[var(--shadow-pop)]"
            >
              {jumpError}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
