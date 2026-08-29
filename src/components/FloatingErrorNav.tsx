import React, { useState, useEffect, useMemo } from 'react';
import { LogEntry, ThemeMode } from '../types';
import { AlertOctagon, ChevronUp, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';

interface FloatingErrorNavProps {
  filteredLogs: LogEntry[];
  selectedIds: Set<number>;
  onSelectLog: (logId: number) => void;
  onNavigateToLog?: (logId: number) => void;
  theme?: ThemeMode;
}

export const FloatingErrorNav: React.FC<FloatingErrorNavProps> = ({
  filteredLogs,
  selectedIds,
  onSelectLog,
  onNavigateToLog,
  theme = 'light',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 筛选出所有 ERROR / FATAL 或解析失败的日志
  const errorLogs = useMemo(() => {
    return filteredLogs.filter(
      (l) => !l.success || l.fields?.level === 'ERROR' || l.fields?.level === 'FATAL' || l.fields?.level === 'ERR'
    );
  }, [filteredLogs]);

  // 当前选中行的 ID（如果选了多行，取最后选中的 ID）
  const currentSelectedId = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const arr = Array.from(selectedIds);
    return arr[arr.length - 1];
  }, [selectedIds]);

  // 计算当前选中的 ERROR 在 errorLogs 中的索引 (-1 表示当前选中的不是 ERROR)
  const currentErrorIndex = useMemo(() => {
    if (currentSelectedId == null || errorLogs.length === 0) return -1;
    return errorLogs.findIndex((l) => l.id === currentSelectedId);
  }, [currentSelectedId, errorLogs]);

  const dispatchNavigation = (targetId: number) => {
    onSelectLog(targetId);
    if (onNavigateToLog) {
      onNavigateToLog(targetId);
    }
  };

  // 跳转到下一个 ERROR
  const handleNextError = () => {
    if (errorLogs.length === 0) return;
    let nextIdx = 0;
    if (currentSelectedId != null) {
      // 找到在 filteredLogs 中排在当前选中行后面的第一个 ERROR
      const currentLogIndex = filteredLogs.findIndex((l) => l.id === currentSelectedId);
      const foundIdx = errorLogs.findIndex(
        (l) => filteredLogs.findIndex((item) => item.id === l.id) > currentLogIndex
      );
      if (foundIdx !== -1) {
        nextIdx = foundIdx;
      } else {
        // 如果后面没有，循环回到第一个 ERROR
        nextIdx = 0;
      }
    }
    dispatchNavigation(errorLogs[nextIdx].id);
  };

  // 跳转到上一个 ERROR
  const handlePrevError = () => {
    if (errorLogs.length === 0) return;
    let prevIdx = errorLogs.length - 1;
    if (currentSelectedId != null) {
      // 找到在 filteredLogs 中排在当前选中行前面的最后一个 ERROR
      const currentLogIndex = filteredLogs.findIndex((l) => l.id === currentSelectedId);
      let foundIdx = -1;
      for (let i = errorLogs.length - 1; i >= 0; i--) {
        const idxInFiltered = filteredLogs.findIndex((item) => item.id === errorLogs[i].id);
        if (idxInFiltered < currentLogIndex) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx !== -1) {
        prevIdx = foundIdx;
      } else {
        // 如果前面没有，循环回到最后一个 ERROR
        prevIdx = errorLogs.length - 1;
      }
    }
    dispatchNavigation(errorLogs[prevIdx].id);
  };

  // 快捷键支持：F2 下一个 ERROR，Shift+F2 上一个 ERROR
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevError();
        } else {
          handleNextError();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [errorLogs, currentSelectedId, filteredLogs]);

  if (filteredLogs.length === 0) return null;

  const isLight = theme === 'light';
  const hasErrors = errorLogs.length > 0;

  return (
    <div className="fixed bottom-6 right-8 z-[9000] flex items-center select-none animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div
        className={`flex items-center gap-2.5 p-2.5 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all ${
          isLight
            ? 'bg-white/95 border-rose-300/80 text-slate-800 shadow-rose-950/15'
            : 'bg-slate-900/95 border-rose-900/80 text-slate-100 shadow-black/90'
        }`}
      >
        {/* 左侧大号图标 badge */}
        <div className="flex items-center gap-2 pl-1 pr-2.5 border-r border-slate-200 dark:border-slate-800">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-transform ${
              hasErrors
                ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/30 ring-2 ring-rose-400/40'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
            }`}
          >
            <AlertOctagon className={`w-5 h-5 ${hasErrors ? 'animate-pulse' : ''}`} />
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-wider text-rose-600 dark:text-rose-400 leading-tight">
              ERROR 快捷导航
            </span>
            <span className="text-xs font-mono font-bold flex items-center gap-1.5 mt-0.5">
              {hasErrors ? (
                <>
                  <span className="text-rose-700 dark:text-rose-300">
                    {currentErrorIndex >= 0 ? `${currentErrorIndex + 1} / ${errorLogs.length}` : `共 ${errorLogs.length} 条`}
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 font-mono hidden sm:inline">
                    F2
                  </span>
                </>
              ) : (
                <span className="text-slate-400 font-normal text-[11px]">无错误日志</span>
              )}
            </span>
          </div>
        </div>

        {/* 右侧大号方向控制图标按钮 */}
        {!isCollapsed && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevError}
              disabled={!hasErrors}
              className={`p-2.5 rounded-xl flex items-center justify-center transition-all cursor-pointer border ${
                hasErrors
                  ? isLight
                    ? 'bg-rose-50 hover:bg-rose-100/90 active:bg-rose-200 text-rose-700 border-rose-200/90 shadow-2xs hover:scale-105'
                    : 'bg-rose-950/60 hover:bg-rose-900/80 active:bg-rose-800 text-rose-200 border-rose-800/80 shadow-2xs hover:scale-105'
                  : 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
              }`}
              title="上一个 ERROR (快捷键: Shift+F2)"
            >
              <ChevronUp className="w-5 h-5 stroke-[2.5]" />
            </button>

            <button
              onClick={handleNextError}
              disabled={!hasErrors}
              className={`p-2.5 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md border ${
                hasErrors
                  ? 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 active:from-rose-700 active:to-rose-600 text-white border-rose-400/50 shadow-rose-600/30 hover:scale-105'
                  : 'opacity-40 cursor-not-allowed border-transparent text-slate-400 bg-slate-200 dark:bg-slate-800'
              }`}
              title="下一个 ERROR (快捷键: F2)"
            >
              <ChevronDown className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* 收起/展开按钮 */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
          title={isCollapsed ? '展开控制按钮' : '收起控制按钮'}
        >
          {isCollapsed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
