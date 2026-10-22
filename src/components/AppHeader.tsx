import React, { useEffect, useRef, useState } from 'react';
import { Braces, ChevronDown, FileText, FlaskConical, FolderOpen, HardDrive, Layers3, Moon, ScrollText, Sun, Upload, X } from 'lucide-react';
import { SourceSettings } from './SourceSettings';
import { SourceOpenerSwitch } from './SourceOpenerSwitch';
import { LogStats, ThemeMode } from '../types';
import { ConfigError, LogFormatConfig } from '../config/logFormatTypes';
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
  sourceFiles: string[];
  onOpenLocal: () => void;
  onPickFile: () => void;
  onOpenRemote: () => void;
  onLoadSample: (count: number) => void;
  onClear: () => void;
  onToggleTheme: () => void;
  onFormatChange: (formatId: string) => void;
  onStackChange: (enabled: boolean) => void;
}

const samples = [
  { label: '调试集', count: 1000 },
  { label: '标准集', count: 10000 },
  { label: '压力测试', count: 50000 },
];

/** 单行应用顶栏：品牌 · 当前文件 · 格式与堆栈 · 打开入口 · 工具。统计数字移到底部状态栏。 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  stats, origin, isLoading, theme, formats, selectedFormatId, configErrors, stackEnabled, sourceFiles,
  onOpenLocal, onPickFile, onOpenRemote, onLoadSample, onClear, onToggleTheme, onFormatChange, onStackChange,
}) => {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const light = theme === 'light';
  const format = formats.find((item) => item.id === selectedFormatId) || formats[0];

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [menu]);

  const pick = (action: () => void) => () => { setMenu(false); action(); };

  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-ink">
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-sm"><ScrollText className="h-4 w-4" /></span>
        <span className="hidden text-[13.5px] font-semibold tracking-tight md:inline">LogViewer</span>
      </div>

      {stats ? (
        <div className="flex min-w-0 max-w-[min(420px,38vw)] items-center gap-2 rounded-lg border border-line bg-raised py-1 pl-2.5 pr-1" title={origin || stats.fileName}>
          <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="min-w-12 truncate text-[12.5px] font-semibold">{stats.fileName}</span>
          <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 sm:inline">{formatFileSize(stats.fileSize)}</span>
          <button type="button" onClick={onClear} disabled={isLoading} className="lv-icon-btn h-6 w-6 shrink-0" aria-label="关闭当前日志" title="关闭当前日志"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      <label className="flex min-w-0 shrink items-center gap-1.5 rounded-lg border border-line bg-surface px-2 hover:border-line-strong" title={configErrors.length ? configErrors.map((error) => `${error.code}: ${error.message}`).join('\n') : '日志格式'}>
        <Braces className={`h-3.5 w-3.5 shrink-0 ${configErrors.length ? 'text-warn' : 'text-ink-3'}`} />
        <select value={selectedFormatId} onChange={(event) => onFormatChange(event.target.value)} disabled={isLoading} aria-label="日志格式"
          className="h-7 min-w-0 max-w-[200px] cursor-pointer truncate bg-transparent text-[12px] text-ink-2 outline-none disabled:cursor-not-allowed">
          {formats.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {configErrors.length ? <span className="rounded bg-warn px-1 text-[10px] font-bold text-white">{configErrors.length}</span> : null}
      </label>

      <button type="button" aria-pressed={stackEnabled} disabled={isLoading} onClick={() => onStackChange(!stackEnabled)}
        className={`lv-btn h-[30px] shrink-0 px-2.5 ${stackEnabled ? '!border-accent/40 !bg-accent-soft !text-accent-ink' : ''}`} title="把异常堆栈合并为一条记录">
        <Layers3 className="h-3.5 w-3.5" /><span className="hidden lg:inline">解析堆栈</span>
      </button>

      <span className="flex-1" />

      <div className="flex shrink-0 items-center gap-1">
        <div className="hidden items-center gap-1 xl:flex">
          <SourceSettings format={format} light={light} />
          <SourceOpenerSwitch files={sourceFiles} light={light} />
        </div>
        <span className="mx-1 hidden h-5 w-px bg-line xl:block" />
        <button type="button" onClick={onOpenRemote} className="lv-btn h-[30px]" title="远程工作台：浏览服务器目录、执行命令、打开日志">
          <HardDrive className="h-3.5 w-3.5 text-accent" /><span className="hidden sm:inline">远程</span>
        </button>
        <div ref={menuRef} className="relative">
          <div className="flex">
            <button type="button" onClick={onPickFile} disabled={isLoading} className="lv-btn lv-btn-primary h-[30px] rounded-r-none" title="选择本地日志文件（也可直接拖入窗口）">
              <Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">打开</span>
            </button>
            <button type="button" onClick={() => setMenu((value) => !value)} disabled={isLoading} aria-haspopup="menu" aria-expanded={menu} aria-label="更多打开方式"
              className="lv-btn lv-btn-primary h-[30px] rounded-l-none border-l border-l-white/25 px-1.5">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          {menu ? (
            <div role="menu" className="lv-menu absolute right-0 top-full mt-1.5 w-60">
              <button type="button" role="menuitem" className="lv-menu-item" onClick={pick(onPickFile)}><Upload className="h-3.5 w-3.5" />选择本地文件…</button>
              <button type="button" role="menuitem" className="lv-menu-item" onClick={pick(onOpenLocal)}><FolderOpen className="h-3.5 w-3.5" />按本机路径打开…</button>
              <button type="button" role="menuitem" className="lv-menu-item" onClick={pick(onOpenRemote)}><HardDrive className="h-3.5 w-3.5" />从远程服务器打开…</button>
              <div className="my-1 h-px bg-line" />
              <p className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold text-ink-3">示例日志</p>
              {samples.map((item) => (
                <button key={item.count} type="button" role="menuitem" className="lv-menu-item" onClick={pick(() => onLoadSample(item.count))}>
                  <FlaskConical className="h-3.5 w-3.5" /><span className="flex-1">{item.label}</span><span className="font-mono text-[11px] text-ink-3">{item.count.toLocaleString()} 行</span>
                </button>
              ))}
              <div className="my-1 h-px bg-line xl:hidden" />
              <div className="flex items-center gap-1 px-1 pb-0.5 xl:hidden">
                <SourceSettings format={format} light={light} />
                <SourceOpenerSwitch files={sourceFiles} light={light} />
              </div>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onToggleTheme} className="lv-icon-btn h-[30px] w-[30px]" aria-label={light ? '切换到深色模式' : '切换到浅色模式'} title={light ? '深色模式' : '浅色模式'}>
          {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
};
