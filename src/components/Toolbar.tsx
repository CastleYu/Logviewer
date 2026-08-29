import React, { useState, useRef, useEffect } from 'react';
import { FilterOptions, DisplayDensity, ColumnVisibility, LogStats, ThemeMode, BorderIntensity, PinnedHighlight } from '../types';
import { HIGHLIGHT_COLOR_PRESETS } from '../utils/highlightColors';
import { 
  Search, 
  X, 
  Eye, 
  Download, 
  Copy, 
  SlidersHorizontal,
  Check,
  Highlighter,
  WrapText,
  Layers,
  Filter,
  ChevronUp,
  ChevronDown,
  Grid,
  Hash,
  Pin
} from 'lucide-react';

interface ToolbarProps {
  filter: FilterOptions;
  onFilterChange: (updated: Partial<FilterOptions>) => void;
  density: DisplayDensity;
  onDensityChange: (density: DisplayDensity) => void;
  columnVisibility: ColumnVisibility;
  onColumnVisibilityChange: (cols: ColumnVisibility) => void;
  stats: LogStats | null;
  filteredCount: number;
  uniqueModules: string[];
  uniqueThreads: string[];
  selectedCount: number;
  onCopySelected: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onCopyFilteredRaw: () => void;
  // 全文搜索定位导航
  totalMatches: number;
  currentMatchIndex: number;
  onTriggerSearch: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  // 主题与边框控制
  theme?: ThemeMode;
  borderIntensity?: BorderIntensity;
  onBorderIntensityChange?: (intensity: BorderIntensity) => void;
  onResetColumnWidths?: () => void;
  onJumpToLine?: (lineNumber: number) => void;
  // 向后兼容样式配置 (默认关闭)
  legacyBoldSelection?: boolean;
  onLegacyBoldSelectionChange?: (val: boolean) => void;
  legacyHighlightStyle?: boolean;
  onLegacyHighlightStyleChange?: (val: boolean) => void;
}

const searchableColumns = [
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

export const Toolbar: React.FC<ToolbarProps> = ({
  filter,
  onFilterChange,
  density,
  onDensityChange,
  columnVisibility,
  onColumnVisibilityChange,
  stats,
  filteredCount,
  uniqueModules,
  uniqueThreads,
  selectedCount,
  onCopySelected,
  onSelectAll,
  onClearSelection,
  onExportJSON,
  onExportCSV,
  onCopyFilteredRaw,
  totalMatches,
  currentMatchIndex,
  onTriggerSearch,
  onNextMatch,
  onPrevMatch,
  theme = 'dark',
  borderIntensity = 'medium',
  onBorderIntensityChange,
  onResetColumnWidths,
  onJumpToLine,
  legacyBoldSelection = false,
  onLegacyBoldSelectionChange,
  legacyHighlightStyle = false,
  onLegacyHighlightStyleChange,
}) => {
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showSearchColsMenu, setShowSearchColsMenu] = useState(false);
  const [showPinnedMenu, setShowPinnedMenu] = useState(false);
  const [editingColorPinId, setEditingColorPinId] = useState<string | null>(null);
  const [jumpInput, setJumpInput] = useState('');
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [floatingToasts, setFloatingToasts] = useState<{ id: number; x: number; y: number; text: string }[]>([]);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false);
        setShowExportMenu(false);
        setShowRangeMenu(false);
        setShowStyleMenu(false);
        setShowSearchColsMenu(false);
        setShowPinnedMenu(false);
        setEditingColorPinId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pinnedHighlights = filter.pinnedHighlights || [];

  const handlePinCurrentHighlight = () => {
    const kw = filter.highlightKeyword.trim();
    if (!kw) return;

    // 检查是否已经存在
    if (pinnedHighlights.some((p) => p.keyword === kw)) {
      triggerFloatingToast(`已存在高亮: "${kw}"`);
      return;
    }

    // 轮询分配下一个调色盘颜色
    const colorIds = HIGHLIGHT_COLOR_PRESETS.map((p) => p.id);
    const nextColor = colorIds[pinnedHighlights.length % colorIds.length];

    const newPin: PinnedHighlight = {
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
      keyword: kw,
      color: nextColor,
      matchCase: filter.highlightMatchCase,
      isRegex: filter.highlightIsRegex,
    };

    onFilterChange({
      pinnedHighlights: [...pinnedHighlights, newPin],
      highlightKeyword: '', // 清空当前高亮输入框
    });
    triggerFloatingToast(`已固定高亮: "${kw}"`);
  };

  const handleRemovePinned = (id: string) => {
    onFilterChange({
      pinnedHighlights: pinnedHighlights.filter((p) => p.id !== id),
    });
  };

  const handleUpdatePinColor = (id: string, colorId: string) => {
    onFilterChange({
      pinnedHighlights: pinnedHighlights.map((p) => (p.id === id ? { ...p, color: colorId } : p)),
    });
    setEditingColorPinId(null);
  };

  const handleClearAllPinned = () => {
    onFilterChange({ pinnedHighlights: [] });
  };

  // 快捷键 Ctrl+G / Cmd+G 聚焦跳转行输入框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        jumpInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleColumnsMenu = () => {
    setShowColumnsMenu((prev) => {
      if (!prev) {
        setShowExportMenu(false);
        setShowRangeMenu(false);
        setShowStyleMenu(false);
        setShowSearchColsMenu(false);
      }
      return !prev;
    });
  };

  const handleToggleExportMenu = () => {
    setShowExportMenu((prev) => {
      if (!prev) {
        setShowColumnsMenu(false);
        setShowRangeMenu(false);
        setShowStyleMenu(false);
        setShowSearchColsMenu(false);
      }
      return !prev;
    });
  };

  const handleToggleRangeMenu = () => {
    setShowRangeMenu((prev) => {
      if (!prev) {
        setShowColumnsMenu(false);
        setShowExportMenu(false);
        setShowStyleMenu(false);
        setShowSearchColsMenu(false);
      }
      return !prev;
    });
  };

  const handleToggleStyleMenu = () => {
    setShowStyleMenu((prev) => {
      if (!prev) {
        setShowColumnsMenu(false);
        setShowExportMenu(false);
        setShowRangeMenu(false);
        setShowSearchColsMenu(false);
      }
      return !prev;
    });
  };

  const handleToggleSearchColsMenu = () => {
    setShowSearchColsMenu((prev) => {
      if (!prev) {
        setShowColumnsMenu(false);
        setShowExportMenu(false);
        setShowRangeMenu(false);
        setShowStyleMenu(false);
      }
      return !prev;
    });
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpInput.trim()) {
      setJumpError('请输入行号');
      return;
    }
    const val = parseInt(jumpInput.trim(), 10);
    if (isNaN(val) || val < 1) {
      setJumpError('请输入有效的正整数行号');
      return;
    }
    if (onJumpToLine) {
      onJumpToLine(val);
      setJumpError(null);
    }
  };

  const isLight = theme === 'light';

  const triggerFloatingToast = (text: string, e?: React.MouseEvent) => {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (e && e.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top - 4;
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
  };

  // 校验数量置灰限制
  const isModuleDisabled = uniqueModules.length > 20;
  const isThreadDisabled = uniqueThreads.length > 100;

  const levelOptions = [
    { label: '全部', value: 'ALL', count: stats?.totalCount },
    { label: 'DEBUG', value: 'DEBUG', count: stats?.levelCounts.DEBUG },
    { label: 'INFO', value: 'INFO', count: stats?.levelCounts.INFO },
    { label: 'WARN', value: 'WARN', count: stats?.levelCounts.WARN },
    { label: 'ERROR', value: 'ERROR', count: stats?.levelCounts.ERROR },
    { label: '解析失败', value: 'FAILED_ONLY', count: stats?.failedCount },
  ];

  const selectedLevels = filter.selectedLevels || [];
  const isAllSelected = selectedLevels.length === 0 || selectedLevels.includes('ALL');

  const handleLevelToggle = (val: string) => {
    if (val === 'ALL') {
      onFilterChange({ selectedLevels: [], level: 'ALL' });
      return;
    }

    let current = [...selectedLevels].filter((l) => l !== 'ALL');
    if (current.includes(val)) {
      current = current.filter((l) => l !== val);
    } else {
      current.push(val);
    }

    if (current.length === 0) {
      onFilterChange({ selectedLevels: [], level: 'ALL' });
    } else {
      onFilterChange({
        selectedLevels: current,
        level: current.length === 1 ? current[0] : 'ALL',
      });
    }
  };

  // 搜索列多选控制
  const currentSearchCols = filter.searchColumns && filter.searchColumns.length > 0
    ? filter.searchColumns
    : (filter.searchColumn ? [filter.searchColumn] : ['ALL']);

  const handleToggleSearchColumn = (colKey: string) => {
    if (colKey === 'ALL') {
      onFilterChange({ searchColumns: ['ALL'], searchColumn: 'ALL' });
      return;
    }
    let updated = currentSearchCols.filter((k) => k !== 'ALL');
    if (updated.includes(colKey)) {
      updated = updated.filter((k) => k !== colKey);
    } else {
      updated.push(colKey);
    }
    if (updated.length === 0) {
      updated = ['ALL'];
    }
    onFilterChange({
      searchColumns: updated,
      searchColumn: updated.length === 1 ? updated[0] : 'ALL',
    });
  };

  const getSearchColsBtnLabel = () => {
    if (currentSearchCols.includes('ALL') || currentSearchCols.length === 0) {
      return '全部列';
    }
    if (currentSearchCols.length === 1) {
      const matched = searchableColumns.find((c) => c.key === currentSearchCols[0]);
      return matched ? matched.label : currentSearchCols[0];
    }
    return `已选 ${currentSearchCols.length} 列`;
  };

  const handleCopy = (e: React.MouseEvent) => {
    onCopyFilteredRaw();
    setCopiedNotification(true);
    triggerFloatingToast('已复制日志', e);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const handleCopySelectedClick = (e: React.MouseEvent) => {
    onCopySelected();
    triggerFloatingToast(`已复制 ${selectedCount} 行日志`, e);
  };

  const columnLabels: { key: keyof ColumnVisibility; label: string }[] = [
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

  return (
    <div ref={toolbarRef} className={`px-3 py-1.5 shrink-0 flex flex-col gap-1.5 text-xs border-b ${
      isLight ? 'bg-white/95 border-slate-200/80 text-slate-800' : 'bg-slate-950/95 border-slate-800/80 text-slate-200'
    } backdrop-blur-md relative z-50`}>
      {/* 
        【第二行：选择行】
        左侧：级别选择组件
        中间：已选行数显示
        右侧：配置项 (自动换行、样式设置、列设置、导出、复制日志)
      */}
      <div className="flex items-center justify-between gap-2 relative">
        {/* 左侧：级别选择组件 */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
          <span className={`text-[11px] font-semibold mr-0.5 flex items-center gap-1 shrink-0 ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            级别:
          </span>
          {levelOptions.map((opt) => {
            const isActive = opt.value === 'ALL'
              ? isAllSelected
              : selectedLevels.includes(opt.value);

            let activeStyle = 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-xs';
            if (opt.value === 'DEBUG') activeStyle = isLight ? 'bg-slate-700 text-white border-slate-600 font-semibold shadow-xs' : 'bg-slate-700 text-slate-100 border-slate-600 font-semibold shadow-xs';
            if (opt.value === 'INFO') activeStyle = 'bg-sky-600 text-white border-sky-500 font-semibold shadow-xs';
            if (opt.value === 'WARN') activeStyle = 'bg-amber-600 text-white border-amber-500 font-semibold shadow-xs';
            if (opt.value === 'ERROR') activeStyle = 'bg-rose-600 text-white border-rose-500 font-semibold shadow-xs';
            if (opt.value === 'FAILED_ONLY') activeStyle = 'bg-red-700 text-white border-red-600 font-semibold shadow-xs';

            return (
              <button
                key={opt.value}
                onClick={() => handleLevelToggle(opt.value)}
                className={`px-2 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1 shrink-0 cursor-pointer border ${
                  isActive
                    ? activeStyle
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-300/80'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                <span>{opt.label}</span>
                {opt.count !== undefined && opt.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive
                      ? 'bg-black/20 text-white'
                      : isLight ? 'bg-slate-200/80 text-slate-600' : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}>
                    {opt.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 中间：已选行数显示组件 */}
        <div className="flex-1 flex justify-center items-center pointer-events-auto min-w-[120px]">
          {selectedCount > 0 ? (
            <div className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-md shadow-2xs font-mono text-xs ${
              isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-indigo-950/80 border-indigo-500/40 text-indigo-200'
            }`}>
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-semibold">已选 {selectedCount} 行</span>
              <button
                onClick={handleCopySelectedClick}
                className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-medium transition-all cursor-pointer ml-0.5"
                title="复制选中的多行原始日志"
              >
                复制
              </button>
              <button
                onClick={onClearSelection}
                className={`p-0.5 rounded cursor-pointer ${
                  isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-indigo-100' : 'text-slate-400 hover:text-slate-100 hover:bg-indigo-900'
                }`}
                title="取消选择"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className={`flex items-center gap-1 py-1 text-[11px] font-mono opacity-40 ${
              isLight ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <Layers className="w-3.5 h-3.5" />
              <span>未选择行</span>
            </div>
          )}
        </div>

        {/* 右侧：配置项 (自动换行、样式设置、列设置、导出、复制日志) */}
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {/* 自动换行开关 */}
          <button
            onClick={() => onFilterChange({ wordWrap: !filter.wordWrap })}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-all cursor-pointer ${
              filter.wordWrap
                ? isLight
                  ? 'bg-indigo-50 text-indigo-900 border-indigo-300 font-semibold'
                  : 'bg-indigo-600/25 text-indigo-200 border-indigo-500/40 font-semibold'
                : isLight
                  ? 'bg-slate-100 text-slate-600 border-slate-300/80 hover:bg-slate-200'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="切换自动换行或单行截断"
          >
            <WrapText className="w-3.5 h-3.5 text-indigo-500" />
            <span>{filter.wordWrap ? '换行: 开' : '换行: 关'}</span>
          </button>

          {/* 样式设置 (整合边框和间距) */}
          <div className="relative">
            <button
              onClick={handleToggleStyleMenu}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-all ${
                showStyleMenu
                  ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-xs'
                  : isLight 
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80' 
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
              title="表格边框强度与行间距密度设置"
            >
              <Grid className="w-3.5 h-3.5 text-indigo-500" />
              <span>样式设置</span>
            </button>

            {showStyleMenu && (
              <div className={`absolute right-0 top-full mt-1.5 w-60 border rounded-lg shadow-2xl p-3 z-[100] ${
                isLight ? 'bg-white/95 border-slate-200 text-slate-800 backdrop-blur-md' : 'bg-slate-900/95 border-slate-800 text-slate-200 backdrop-blur-md'
              }`}>
                {/* 选项 1: 显示密度 (行间距) */}
                <div className="mb-3">
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    <SlidersHorizontal className="w-3 h-3 text-indigo-500" />
                    表格行高密度
                  </div>
                  <div className={`grid grid-cols-3 gap-1 rounded-md border p-1 ${
                    isLight ? 'bg-slate-100/80 border-slate-300/80' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <button
                      onClick={() => onDensityChange('compact')}
                      className={`py-1 text-[11px] rounded transition-all cursor-pointer font-medium ${
                        density === 'compact'
                          ? isLight ? 'bg-white text-indigo-700 font-semibold shadow-2xs' : 'bg-slate-800 text-indigo-400 font-semibold'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      紧凑 (20px)
                    </button>
                    <button
                      onClick={() => onDensityChange('normal')}
                      className={`py-1 text-[11px] rounded transition-all cursor-pointer font-medium ${
                        density === 'normal'
                          ? isLight ? 'bg-white text-indigo-700 font-semibold shadow-2xs' : 'bg-slate-800 text-indigo-400 font-semibold'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      标准 (24px)
                    </button>
                    <button
                      onClick={() => onDensityChange('relaxed')}
                      className={`py-1 text-[11px] rounded transition-all cursor-pointer font-medium ${
                        density === 'relaxed'
                          ? isLight ? 'bg-white text-indigo-700 font-semibold shadow-2xs' : 'bg-slate-800 text-indigo-400 font-semibold'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      宽敞 (28px)
                    </button>
                  </div>
                </div>

                {/* 选项 2: 表格边框线度 */}
                {onBorderIntensityChange && (
                  <div className="mb-2">
                    <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${
                      isLight ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      <Grid className="w-3 h-3 text-indigo-500" />
                      表格网格分割线
                    </div>
                    <div className={`grid grid-cols-3 gap-1 rounded-md border p-1 ${
                      isLight ? 'bg-slate-100/80 border-slate-300/80' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <button
                        onClick={() => onBorderIntensityChange('light')}
                        className={`py-1 text-[11px] rounded transition-all cursor-pointer font-medium ${
                          borderIntensity === 'light'
                            ? isLight ? 'bg-white text-indigo-700 font-bold shadow-2xs' : 'bg-slate-800 text-indigo-400 font-bold'
                            : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        弱 (浅线)
                      </button>
                      <button
                        onClick={() => onBorderIntensityChange('medium')}
                        className={`py-1 text-[11px] rounded transition-all cursor-pointer font-medium ${
                          borderIntensity === 'medium'
                            ? isLight ? 'bg-white text-indigo-700 font-bold shadow-2xs' : 'bg-slate-800 text-indigo-400 font-bold'
                            : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        中 (标准)
                      </button>
                      <button
                        onClick={() => onBorderIntensityChange('strong')}
                        className={`py-1 text-[11px] rounded transition-all cursor-pointer font-medium ${
                          borderIntensity === 'strong'
                            ? isLight ? 'bg-white text-indigo-700 font-bold shadow-2xs' : 'bg-slate-800 text-indigo-400 font-bold'
                            : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        强 (高对比)
                      </button>
                    </div>
                  </div>
                )}

                {/* 选项 3: 兼容性与经典视觉样式 (默认全部关闭以保证物理零跳动) */}
                <div className="mb-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center justify-between ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    <span>向后兼容 (经典样式)</span>
                    <span className={`text-[9px] font-normal px-1 py-0.2 rounded font-mono ${
                      isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'
                    }`}>
                      默认关闭
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {/* 开关 1: 经典选中文字加粗 */}
                    {onLegacyBoldSelectionChange && (
                      <label className={`flex items-start justify-between gap-2 p-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-300'
                      }`}>
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="font-semibold text-[11px] flex items-center gap-1">
                            <span>选中行文字加粗</span>
                            {legacyBoldSelection && (
                              <span className="text-[9px] text-amber-500 font-mono font-bold">(开启)</span>
                            )}
                          </div>
                          <div className={`text-[10px] leading-tight mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            选中行文字加粗 (默认关: 保持恒定字符度量零换行)
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={legacyBoldSelection}
                          onChange={(e) => onLegacyBoldSelectionChange(e.target.checked)}
                          className="accent-indigo-600 rounded cursor-pointer mt-0.5 shrink-0"
                        />
                      </label>
                    )}

                    {/* 开关 2: 经典高亮徽章样式 */}
                    {onLegacyHighlightStyleChange && (
                      <label className={`flex items-start justify-between gap-2 p-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-300'
                      }`}>
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="font-semibold text-[11px] flex items-center gap-1">
                            <span>经典高亮徽章边框</span>
                            {legacyHighlightStyle && (
                              <span className="text-[9px] text-amber-500 font-mono font-bold">(开启)</span>
                            )}
                          </div>
                          <div className={`text-[10px] leading-tight mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            高亮使用原版半粗体+边框气泡 (默认关: 纯色零排版膨胀)
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={legacyHighlightStyle}
                          onChange={(e) => onLegacyHighlightStyleChange(e.target.checked)}
                          className="accent-indigo-600 rounded cursor-pointer mt-0.5 shrink-0"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* 重置列宽辅助按钮 */}
                {onResetColumnWidths && (
                  <button
                    onClick={() => {
                      onResetColumnWidths();
                      setShowStyleMenu(false);
                    }}
                    className={`w-full mt-2 text-center py-1 text-[11px] font-medium rounded-md border transition-all cursor-pointer ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    }`}
                  >
                    重置默认列宽
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 列显隐 */}
          <div className="relative">
            <button
              onClick={handleToggleColumnsMenu}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-all ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80' 
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span>列设置</span>
            </button>

            {showColumnsMenu && (
              <div className={`absolute right-0 top-full mt-1.5 w-52 border rounded-lg shadow-2xl p-2 z-[100] ${
                isLight ? 'bg-white/95 border-slate-200 text-slate-800 backdrop-blur-md' : 'bg-slate-900/95 border-slate-800 text-slate-200 backdrop-blur-md'
              }`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 px-1 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  数据列显示开关
                </div>
                <div className="space-y-1">
                  {columnLabels.map(({ key, label }) => (
                    <label key={key} className={`flex items-center justify-between text-xs px-2 py-1 rounded-md cursor-pointer transition-colors ${
                      isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                    }`}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={columnVisibility[key]}
                        onChange={(e) =>
                          onColumnVisibilityChange({
                            ...columnVisibility,
                            [key]: e.target.checked,
                          })
                        }
                        className="accent-indigo-600 rounded cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 导出 */}
          <div className="relative">
            <button
              onClick={handleToggleExportMenu}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-all ${
                isLight 
                  ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                  : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>导出</span>
            </button>

            {showExportMenu && (
              <div className={`absolute right-0 top-full mt-1.5 w-48 border rounded-lg shadow-2xl p-1.5 z-[100] ${
                isLight ? 'bg-white/95 border-slate-200 text-slate-800 backdrop-blur-md' : 'bg-slate-900/95 border-slate-800 text-slate-200 backdrop-blur-md'
              }`}>
                <button
                  onClick={() => {
                    onExportJSON();
                    setShowExportMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors ${
                    isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span>导出结构化 JSON</span>
                  <span className="text-[10px] font-mono text-slate-400">.json</span>
                </button>
                <button
                  onClick={() => {
                    onExportCSV();
                    setShowExportMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors ${
                    isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span>导出表格 CSV</span>
                  <span className="text-[10px] font-mono text-slate-400">.csv</span>
                </button>
              </div>
            )}
          </div>

          {/* 复制日志按钮 */}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-all ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
            title="复制当前过滤结果的原始日志"
          >
            {copiedNotification ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-indigo-500" />
            )}
            <span>{copiedNotification ? '已复制' : '复制日志'}</span>
          </button>
        </div>
      </div>

      {/* 
        【第三行：搜索行】
        左侧依次为：模块下拉列表、线程下拉列表、区间筛选
        中间为：搜索高亮
        右侧为：全局搜索 (含多列选择/正规/大小写/定位导航) 和 跳转行
      */}
      <div className={`flex flex-wrap items-center justify-between gap-2 pt-1 border-t relative ${
        isLight ? 'border-slate-200/80 text-slate-700' : 'border-slate-800/80 text-slate-300'
      }`}>
        {/* 左侧：模块下拉列表 + 线程下拉列表 + 区间筛选 (统一输入/选择框组件高度 h-[30px]) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 1. 模块下拉 */}
          <select
            disabled={isModuleDisabled}
            value={isModuleDisabled ? 'ALL' : filter.selectedModule}
            onChange={(e) => onFilterChange({ selectedModule: e.target.value })}
            className={`h-[30px] rounded-md px-2 text-xs font-mono outline-none transition-all border ${
              isLight
                ? isModuleDisabled
                  ? 'opacity-50 cursor-not-allowed text-slate-400 bg-slate-100 border-slate-200'
                  : 'bg-slate-50 text-slate-800 border-slate-300/80 cursor-pointer hover:border-slate-400 focus:border-indigo-500'
                : isModuleDisabled
                  ? 'opacity-50 cursor-not-allowed text-slate-500 bg-slate-950/40 border-slate-900'
                  : 'bg-slate-900 text-slate-300 border-slate-800 cursor-pointer hover:border-slate-700 focus:border-indigo-500'
            }`}
            title={isModuleDisabled ? '模块筛选数量大于20，已被自动禁用' : '模块筛选'}
          >
            <option value="ALL">
              {isModuleDisabled ? '所有模块 (>20已禁用)' : `所有模块 (${uniqueModules.length})`}
            </option>
            {!isModuleDisabled && uniqueModules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* 2. 线程下拉 */}
          <select
            disabled={isThreadDisabled}
            value={isThreadDisabled ? 'ALL' : filter.selectedThread}
            onChange={(e) => onFilterChange({ selectedThread: e.target.value })}
            className={`h-[30px] rounded-md px-2 text-xs font-mono outline-none transition-all border ${
              isLight
                ? isThreadDisabled
                  ? 'opacity-50 cursor-not-allowed text-slate-400 bg-slate-100 border-slate-200'
                  : 'bg-slate-50 text-slate-800 border-slate-300/80 cursor-pointer hover:border-slate-400 focus:border-indigo-500'
                : isThreadDisabled
                  ? 'opacity-50 cursor-not-allowed text-slate-500 bg-slate-950/40 border-slate-900'
                  : 'bg-slate-900 text-slate-300 border-slate-800 cursor-pointer hover:border-slate-700 focus:border-indigo-500'
            }`}
            title={isThreadDisabled ? '线程筛选数量大于100，已被自动禁用' : '线程筛选'}
          >
            <option value="ALL">
              {isThreadDisabled ? '所有线程 (>100已禁用)' : `所有线程 (${uniqueThreads.length})`}
            </option>
            {!isThreadDisabled && uniqueThreads.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* 3. 区间筛选 */}
          <div className="relative">
            <button
              onClick={handleToggleRangeMenu}
              className={`h-[30px] flex items-center gap-1 px-2 rounded-md text-xs font-mono transition-all cursor-pointer border ${
                filter.rangeKeyword
                  ? isLight 
                    ? 'bg-amber-100 text-amber-950 border-amber-400 font-semibold shadow-sm'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/80 font-semibold shadow-sm'
                  : isLight
                    ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
              title="点击展开区间筛选设置"
            >
              <Filter className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>区间筛选</span>
              {filter.rangeKeyword && (
                <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded max-w-[80px] truncate ${
                  isLight ? 'bg-amber-200 text-amber-900' : 'bg-amber-900/80 text-amber-200'
                }`}>
                  {filter.rangeKeyword}
                </span>
              )}
            </button>

            {showRangeMenu && (
              <div className={`absolute left-0 top-full mt-1.5 w-72 border rounded-lg shadow-2xl p-3 z-[100] ${
                isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-amber-500" />
                    区间行数筛选
                  </span>
                  <button
                    onClick={() => setShowRangeMenu(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className={`text-[11px] mb-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  输入关键字，日志将仅保留该词<strong className="text-amber-600 dark:text-amber-200">首个出现行</strong>至<strong className="text-amber-600 dark:text-amber-200">末尾出现行</strong>之间的所有记录。
                </p>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={filter.rangeKeyword}
                    onChange={(e) => onFilterChange({ rangeKeyword: e.target.value })}
                    placeholder="首出现行 ~ 末出现行关键字..."
                    className={`w-full border focus:border-amber-500 rounded px-2.5 py-1 text-xs font-mono outline-none pr-7 ${
                      isLight ? 'bg-slate-50 border-slate-300 text-amber-900' : 'bg-slate-950 border-slate-700 text-amber-200'
                    }`}
                    autoFocus
                  />
                  {filter.rangeKeyword && (
                    <button
                      onClick={() => onFilterChange({ rangeKeyword: '' })}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {filter.rangeKeyword && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => onFilterChange({ rangeKeyword: '' })}
                      className="text-[11px] text-rose-500 hover:text-rose-600 cursor-pointer underline"
                    >
                      清空区间条件
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 中间：搜索高亮组件 (支持多固定高亮与调色盘) */}
        <div className="flex-1 flex justify-center items-center">
          <div className={`h-[30px] relative flex items-center rounded-md px-2 border ${
            isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-slate-800'
          }`}>
            <Highlighter className="w-3.5 h-3.5 text-purple-500 shrink-0 mr-1.5" />
            <input
              type="text"
              value={filter.highlightKeyword}
              onChange={(e) => onFilterChange({ highlightKeyword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePinCurrentHighlight();
                }
              }}
              placeholder="搜索高亮..."
              className={`w-24 sm:w-32 bg-transparent border-none text-xs font-mono outline-none pr-1 ${
                isLight ? 'text-purple-950 placeholder:text-slate-400' : 'text-purple-200 placeholder:text-slate-500'
              }`}
            />
            {filter.highlightKeyword && (
              <button
                onClick={() => onFilterChange({ highlightKeyword: '' })}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-0.5 mr-1"
                title="清空临时高亮"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <div className={`flex items-center gap-0.5 border-l pl-1.5 ${isLight ? 'border-slate-300' : 'border-slate-800'}`}>
              <button
                onClick={() => onFilterChange({ highlightIsRegex: !filter.highlightIsRegex })}
                className={`px-1.5 py-0.2 text-[10px] font-mono rounded border cursor-pointer transition-all ${
                  filter.highlightIsRegex
                    ? 'bg-purple-600/30 text-purple-700 dark:text-purple-200 border-purple-500 font-bold'
                    : isLight ? 'text-slate-400 border-transparent hover:text-slate-700' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
                title="高亮使用正则表达式"
              >
                .*
              </button>
              <button
                onClick={() => onFilterChange({ highlightMatchCase: !filter.highlightMatchCase })}
                className={`px-1.5 py-0.2 text-[10px] font-mono rounded border cursor-pointer transition-all ${
                  filter.highlightMatchCase
                    ? 'bg-purple-600/30 text-purple-700 dark:text-purple-200 border-purple-500 font-bold'
                    : isLight ? 'text-slate-400 border-transparent hover:text-slate-700' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
                title="高亮区分大小写"
              >
                Aa
              </button>

              {/* 固定高亮按钮 (Pin) */}
              <button
                onClick={handlePinCurrentHighlight}
                disabled={!filter.highlightKeyword.trim()}
                className={`px-1.5 py-0.5 ml-1 text-[10px] font-semibold rounded flex items-center gap-1 transition-all cursor-pointer ${
                  filter.highlightKeyword.trim()
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-2xs'
                    : 'opacity-40 cursor-not-allowed text-slate-400'
                }`}
                title="固定当前高亮 (支持多关键字并配置颜色)"
              >
                <Pin className="w-3 h-3" />
                <span>固定</span>
              </button>
            </div>
          </div>

          {/* 固定高亮浮动列表入口按钮 */}
          <div className="relative ml-2">
            <button
              onClick={() => setShowPinnedMenu((prev) => !prev)}
              className={`h-[30px] flex items-center gap-1 px-2 rounded-md text-xs font-mono transition-all border cursor-pointer ${
                pinnedHighlights.length > 0
                  ? isLight
                    ? 'bg-purple-100 text-purple-950 border-purple-300 font-semibold'
                    : 'bg-purple-950/80 text-purple-200 border-purple-500/80 font-semibold'
                  : isLight
                    ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
              title="查看与管理已固定的高亮规则列表"
            >
              <Pin className="w-3.5 h-3.5 text-purple-500" />
              <span>固定高亮</span>
              {pinnedHighlights.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-purple-600 text-white font-bold ml-0.5">
                  {pinnedHighlights.length}
                </span>
              )}
            </button>

            {/* 固定高亮浮动列表组件 (Requirement 3.2 & 3.3) */}
            {showPinnedMenu && (
              <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-80 border rounded-lg shadow-2xl p-3 z-[100] ${
                isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-300 flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5 text-purple-500" />
                    已固定高亮规则 ({pinnedHighlights.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {pinnedHighlights.length > 0 && (
                      <button
                        onClick={handleClearAllPinned}
                        className="text-[10px] text-rose-500 hover:text-rose-600 cursor-pointer underline"
                      >
                        清空全部
                      </button>
                    )}
                    <button
                      onClick={() => setShowPinnedMenu(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {pinnedHighlights.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400 font-mono">
                    暂无固定高亮，在输入框输入高亮词后点击【固定】保存
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {pinnedHighlights.map((pin) => {
                      const activePreset = HIGHLIGHT_COLOR_PRESETS.find((p) => p.id === pin.color) || HIGHLIGHT_COLOR_PRESETS[0];

                      return (
                        <div
                          key={pin.id}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs font-mono transition-all relative ${
                            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          {/* 左侧：颜色调色盘选择按钮与关键字 */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {/* 颜色选择小圆点 / 调色盘触发器 */}
                            <div className="relative">
                              <button
                                onClick={() => setEditingColorPinId(editingColorPinId === pin.id ? null : pin.id)}
                                className={`w-4 h-4 rounded-full ${activePreset.bgDot} border border-white/60 shadow-2xs hover:scale-110 transition-transform cursor-pointer shrink-0`}
                                title={`当前颜色: ${activePreset.name} (点击切换调色盘)`}
                              />

                              {/* 调色盘浮动组件 (Palette Popover) */}
                              {editingColorPinId === pin.id && (
                                <div className={`absolute left-0 top-full mt-1 p-2 rounded-lg shadow-xl border z-[120] flex items-center gap-1.5 ${
                                  isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                                }`}>
                                  {HIGHLIGHT_COLOR_PRESETS.map((preset) => (
                                    <button
                                      key={preset.id}
                                      onClick={() => handleUpdatePinColor(pin.id, preset.id)}
                                      className={`w-5 h-5 rounded-full ${preset.bgDot} hover:scale-110 transition-transform cursor-pointer border ${
                                        pin.color === preset.id ? 'ring-2 ring-indigo-500 border-white' : 'border-transparent'
                                      }`}
                                      title={preset.name}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>

                            <span className="font-semibold truncate max-w-[140px]" title={pin.keyword}>
                              {pin.keyword}
                            </span>
                          </div>

                          {/* 右侧：属性标识 + 删除按钮 */}
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {pin.isRegex && (
                              <span className="text-[9px] px-1 bg-purple-500/20 text-purple-400 rounded">.*</span>
                            )}
                            {pin.matchCase && (
                              <span className="text-[9px] px-1 bg-purple-500/20 text-purple-400 rounded">Aa</span>
                            )}
                            <button
                              onClick={() => handleRemovePinned(pin.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer transition-colors"
                              title="移除固定高亮"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：全局搜索 (含多列选择) 和 跳转行 */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* 全局搜索组件 (统一高度 h-[30px]) */}
          <div className={`h-[30px] relative flex items-center rounded-md px-2 shadow-2xs border transition-all ${
            isLight ? 'bg-slate-50 border-slate-300 focus-within:border-indigo-500' : 'bg-slate-900 border-slate-800 focus-within:border-indigo-500/80'
          }`}>
            <Search className="w-3.5 h-3.5 text-indigo-500 shrink-0 mr-1.5" />

            {/* 多选列 下拉浮动菜单按钮 */}
            <div className="relative mr-1.5 shrink-0">
              <button
                onClick={handleToggleSearchColsMenu}
                className={`flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded border transition-all cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-800 border-slate-300 hover:border-slate-400'
                    : 'bg-slate-950 text-slate-200 border-slate-700 hover:border-slate-600'
                }`}
                title="选择全文搜索限定的目标列 (多选)"
              >
                <span>{getSearchColsBtnLabel()}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* 多选列 浮动菜单 */}
              {showSearchColsMenu && (
                <div className={`absolute right-0 top-full mt-1.5 w-48 border rounded-lg shadow-2xl p-2 z-[100] ${
                  isLight ? 'bg-white/95 border-slate-200 text-slate-800 backdrop-blur-md' : 'bg-slate-900/95 border-slate-800 text-slate-200 backdrop-blur-md'
                }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1 ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    搜索匹配目标列 (可多选)
                  </div>
                  <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
                    {searchableColumns.map((col) => {
                      const isChecked = col.key === 'ALL'
                        ? currentSearchCols.includes('ALL')
                        : currentSearchCols.includes(col.key);

                      return (
                        <label
                          key={col.key}
                          className={`flex items-center justify-between text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                            isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span>{col.label}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSearchColumn(col.key)}
                            className="accent-indigo-600 rounded cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <input
              type="text"
              value={filter.searchKeyword}
              onChange={(e) => onFilterChange({ searchKeyword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onTriggerSearch();
                }
              }}
              placeholder="搜索关键字..."
              className={`w-24 sm:w-32 bg-transparent border-none text-xs font-mono outline-none pr-1 ${
                isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-indigo-100 placeholder:text-slate-500'
              }`}
            />
            
            {filter.searchKeyword && (
              <button
                onClick={() => onFilterChange({ searchKeyword: '' })}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-0.5 mr-1"
                title="清空搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className={`flex items-center gap-0.5 border-l pl-1.5 ${isLight ? 'border-slate-300' : 'border-slate-800'}`}>
              <button
                onClick={() => onFilterChange({ isRegex: !filter.isRegex })}
                className={`px-1.5 py-0.2 text-[10px] font-mono rounded border cursor-pointer transition-all ${
                  filter.isRegex
                    ? 'bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border-indigo-500 font-bold'
                    : isLight ? 'text-slate-400 border-transparent hover:text-slate-700' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
                title="搜索使用正则表达式"
              >
                .*
              </button>
              <button
                onClick={() => onFilterChange({ matchCase: !filter.matchCase })}
                className={`px-1.5 py-0.2 text-[10px] font-mono rounded border cursor-pointer transition-all ${
                  filter.matchCase
                    ? 'bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border-indigo-500 font-bold'
                    : isLight ? 'text-slate-400 border-transparent hover:text-slate-700' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
                title="搜索区分大小写"
              >
                Aa
              </button>
            </div>

            {/* 搜索触发按钮 */}
            <button
              onClick={onTriggerSearch}
              className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded text-[10px] font-semibold cursor-pointer transition-all ml-1.5 shrink-0 shadow-2xs"
              title="按Enter或点击触发搜索定位"
            >
              搜索
            </button>

            {/* 上一条/下一条 定位导航 & 匹配数 */}
            <div className={`flex items-center gap-0.5 border-l pl-1.5 ml-1.5 text-[10px] font-mono shrink-0 ${
              isLight ? 'border-slate-300 text-slate-600' : 'border-slate-800 text-slate-400'
            }`}>
              <button
                onClick={onPrevMatch}
                disabled={totalMatches === 0}
                className="p-0.5 text-slate-400 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="上一条匹配结果"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[36px] text-center font-semibold text-indigo-600 dark:text-indigo-300 px-0.5">
                {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : '0/0'}
              </span>
              <button
                onClick={onNextMatch}
                disabled={totalMatches === 0}
                className="p-0.5 text-slate-400 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="下一条匹配结果"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 跳转行组件 (统一输入框容器高度 h-[30px]) */}
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
            <div className={`h-[30px] flex items-center rounded-md px-2 border shadow-2xs transition-all ${
              isLight ? 'bg-slate-50 border-slate-300 focus-within:border-indigo-500' : 'bg-slate-900 border-slate-800 focus-within:border-indigo-500/80'
            }`}>
              <Hash className="w-3.5 h-3.5 text-indigo-500 shrink-0 mr-1.5" />
              <input
                ref={jumpInputRef}
                type="number"
                min={1}
                value={jumpInput}
                onChange={(e) => {
                  setJumpInput(e.target.value);
                  setJumpError(null);
                }}
                placeholder={`跳转行 (1-${filteredCount})`}
                className={`w-24 sm:w-28 bg-transparent border-none text-xs font-mono outline-none pr-1 ${
                  isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-indigo-100 placeholder:text-slate-500'
                }`}
              />
              <button
                type="submit"
                className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-[10px] font-semibold rounded cursor-pointer transition-colors shrink-0 shadow-2xs"
                title="跳转到指定目标行"
              >
                跳转
              </button>
            </div>
          </form>
          {jumpError && (
            <span className="text-[11px] text-rose-500 font-mono">{jumpError}</span>
          )}
        </div>
      </div>

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
    </div>
  );
};
