import React from 'react';
import { SourceSettings } from './SourceSettings';
import { LogStats, ThemeMode } from '../types';
import { ConfigError, LogFormatConfig } from '../config/logFormatTypes';
import { formatFileSize } from '../utils/logParser';
import { 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Layers, 
  Upload, 
  Sparkles, 
  Trash2, 
  Cpu,
  FolderOpen,
  Sun,
  Moon,
  Braces,
  Server
} from 'lucide-react';

interface HeaderDashboardProps {
  stats: LogStats | null;
  onSelectFile: () => void;
  onSelectRemote: () => void;
  onOpenBrowse?: () => void;
  onLoadSample: (count: number) => void;
  onClear: () => void;
  isLoading: boolean;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  formats: LogFormatConfig[];
  selectedFormatId: string;
  configErrors: ConfigError[];
  onFormatChange: (formatId: string) => void;
  stackEnabled: boolean;
  onStackChange: (enabled: boolean) => void;
}

export const HeaderDashboard: React.FC<HeaderDashboardProps> = ({
  stats,
  onSelectFile,
  onSelectRemote,
  onOpenBrowse,
  onLoadSample,
  onClear,
  isLoading,
  theme = 'dark',
  onToggleTheme,
  formats,
  selectedFormatId,
  configErrors,
  onFormatChange,
  stackEnabled,
  onStackChange,
}) => {
  const isLight = theme === 'light';

  return (
    <header className={`shrink-0 border-b ${isLight ? 'bg-white/90 border-slate-200/80' : 'bg-slate-950/90 border-slate-800/80'} backdrop-blur-md transition-colors relative z-40`}>
      {/* 紧凑版顶栏：整合 Logo、文件按钮与核心统计指标为单行/极窄结构 */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 gap-2">
        <SourceSettings format={formats.find((item) => item.id === selectedFormatId) || formats[0]} light={isLight} />
        {/* 左侧：Logo & 文件简讯 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center justify-center w-6 h-6 rounded-md border transition-all ${
              isLight 
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200/80' 
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
            }`}>
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <h1 className={`text-xs font-bold tracking-tight flex items-center gap-1.5 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              <span className="text-indigo-600 dark:text-indigo-400">LogViewer</span>
              <span className="font-semibold text-slate-400 dark:text-slate-500">Pro</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border hidden sm:inline ${
                isLight 
                  ? 'bg-slate-100 text-slate-600 border-slate-200' 
                  : 'bg-slate-900 text-indigo-300/80 border-indigo-500/20'
              }`}>
                v2.0
              </span>
            </h1>
          </div>

          <label className={`h-6 flex items-center gap-1 rounded-md border px-1.5 ${
            isLight ? 'bg-slate-50 border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
          }`} title={configErrors.length > 0 ? configErrors.map((error) => `${error.code}: ${error.message}`).join('\n') : '选择日志格式'}>
            <Braces className={`w-3.5 h-3.5 shrink-0 ${configErrors.length > 0 ? 'text-amber-500' : 'text-indigo-500'}`} />
            <span className="sr-only">日志格式</span>
            <select
              value={selectedFormatId}
              onChange={(event) => onFormatChange(event.target.value)}
              disabled={isLoading}
              className="max-w-[220px] bg-transparent border-none outline-none text-[10px] font-mono cursor-pointer disabled:cursor-not-allowed"
              aria-label="日志格式"
            >
              {formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}
            </select>
            {configErrors.length > 0 ? <span className="min-w-4 h-4 px-1 flex items-center justify-center rounded bg-amber-500 text-white text-[9px] font-bold">{configErrors.length}</span> : null}
          </label>

          {stats && (
            <div className={`hidden lg:flex items-center gap-2.5 text-[11px] font-mono border-l pl-3 ${
              isLight ? 'text-slate-600 border-slate-200' : 'text-slate-400 border-slate-800/80'
            }`}>
              <span className={`flex items-center gap-1.5 truncate max-w-[180px] font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`} title={stats.fileName}>
                <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                {stats.fileName}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}>
                {formatFileSize(stats.fileSize)}
              </span>
            </div>
          )}
        </div>

        {/* 中间：超紧凑内联 Log 核心统计面板 */}
        {stats && (
          <div className={`flex items-center gap-3 sm:gap-4 text-xs font-mono py-1 px-3 rounded-lg border transition-all ${
            isLight 
              ? 'bg-slate-50/80 border-slate-200/90 shadow-2xs text-slate-700' 
              : 'bg-slate-900/60 border-slate-800/90 text-slate-300 shadow-2xs'
          }`}>
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] text-slate-400">记录:</span>
              <strong className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{stats.totalCount.toLocaleString()}</strong><span className="text-[11px] text-slate-500">/ {(stats.physicalLineCount ?? stats.totalCount).toLocaleString()} 行</span>
            </div>

            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-[11px] opacity-80">成功:</span>
              <strong className="font-semibold">{stats.successCount.toLocaleString()}</strong>
            </div>

            <div className={`flex items-center gap-1.5 ${
              stats.failedCount > 0 
                ? 'text-rose-600 dark:text-rose-400' 
                : isLight ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <XCircle className={`w-3.5 h-3.5 ${stats.failedCount > 0 ? 'animate-pulse text-rose-500' : ''}`} />
              <span className="text-[11px] opacity-80">失败:</span>
              <strong className={`font-semibold ${stats.failedCount > 0 ? 'underline decoration-rose-500/50' : ''}`}>
                {stats.failedCount.toLocaleString()}
              </strong>
            </div>

            <div className={`hidden md:flex items-center gap-1.5 text-[11px] ${
              isLight ? 'text-amber-800' : 'text-amber-300/90'
            }`}>
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-slate-400">耗时:</span>
              <strong className="font-semibold">{stats.parseDurationMs}ms</strong>
            </div>
          </div>
        )}

        {/* 右侧：紧凑控制按钮组 */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* 主题切换按钮 */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-300/80'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-slate-800'
              }`}
              title={isLight ? '切换到深色模式' : '切换到浅色模式'}
            >
              {isLight ? <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-300" />}
              <span className="hidden sm:inline">{isLight ? '浅色' : '深色'}</span>
            </button>
          )}

          <label className="flex min-h-8 items-center gap-1.5 text-xs"><input type="checkbox" checked={stackEnabled} disabled={isLoading} onChange={(event) => onStackChange(event.target.checked)} className="accent-indigo-500" />解析堆栈</label>
          <button
            onClick={onSelectFile}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
            title="选择本地日志文件"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>打开文件</span>
          </button>

          <button
            onClick={onSelectRemote}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
              isLight
                ? 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-900 hover:bg-indigo-950/60 text-indigo-300 border-indigo-900/70'
            }`}
            title={isLoading ? '当前文件加载完成后才能打开其他文件' : '打开 SFTP 远程日志文件'}
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">远程文件</span>
          </button>

          {onOpenBrowse ? (
            <button
              onClick={onOpenBrowse}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
                isLight
                  ? 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-slate-900 hover:bg-indigo-950/60 text-indigo-300 border-indigo-900/70'
              }`}
              title="打开远程目录浏览窗口"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">远程浏览</span>
            </button>
          ) : null}

          <div className="relative group">
            <button
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80' 
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>示例日志</span>
            </button>
            <div className={`absolute right-0 top-full mt-1.5 w-44 border rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50 p-1.5 ${
              isLight ? 'bg-white/95 border-slate-200 text-slate-800 backdrop-blur-md' : 'bg-slate-900/95 border-slate-800 text-slate-200 backdrop-blur-md'
            }`}>
              <button
                onClick={() => onLoadSample(1000)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex justify-between items-center transition-colors ${
                  isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="font-medium">调试集</span>
                <span className="text-slate-400 font-mono text-[10px] bg-slate-800/20 dark:bg-slate-800 px-1.5 py-0.5 rounded">1,000 行</span>
              </button>
              <button
                onClick={() => onLoadSample(10000)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex justify-between items-center transition-colors ${
                  isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="font-medium">标准集</span>
                <span className="text-slate-400 font-mono text-[10px] bg-slate-800/20 dark:bg-slate-800 px-1.5 py-0.5 rounded">10,000 行</span>
              </button>
              <button
                onClick={() => onLoadSample(50000)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex justify-between items-center transition-colors ${
                  isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="font-medium">压力测试</span>
                <span className="text-slate-400 font-mono text-[10px] bg-slate-800/20 dark:bg-slate-800 px-1.5 py-0.5 rounded">50,000 行</span>
              </button>
            </div>
          </div>

          {stats && (
            <button
              onClick={onClear}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-rose-100/80 text-rose-700 border-slate-300/80'
                  : 'bg-slate-900 hover:bg-rose-950/40 text-rose-300 hover:border-rose-800/50 border-slate-800'
              }`}
              title="清除当前日志"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
