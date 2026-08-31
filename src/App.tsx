import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LogEntry, LogStats, FilterOptions, DisplayDensity, ColumnVisibility, ThemeMode, BorderIntensity, ColumnWidths } from './types';
import { parseLogContent } from './utils/logParser';
import { generateSampleLogsText } from './utils/sampleData';
import { parseLogTimestampToMs, parseInputTimeToMs } from './utils/dateUtils';
import { createColumnFilters, matchColumnFilters } from './utils/columnFilterUtils';
import { createBuiltinLogFormat } from './config/defaultLogFormat';
import { BuiltinFormatId, ConfigError, LogFormatConfig } from './config/logFormatTypes';
import { loadLogViewerConfig } from './utils/logConfigLoader';
import { parseConfiguredLogContent } from './utils/configurableLogParser';
import { clearConfiguredFilter, configuredFilterSummaries, createConfiguredFilters, matchConfiguredFilters } from './utils/configuredFilterUtils';
import { HeaderDashboard } from './components/HeaderDashboard';
import { Toolbar } from './components/Toolbar';
import { VirtualLogTable } from './components/VirtualLogTable';
import { DropZone } from './components/DropZone';
import { FloatingErrorNav } from './components/FloatingErrorNav';
import { ConfigurableLogTable } from './components/ConfigurableLogTable';
import { FileLoadBar } from './components/FileLoadBar';
import { RemoteFileDialog } from './components/RemoteFileDialog';
import { DownloadStatus, FileLoadState, LoadPhase, LoadSourceKind, LoadState, SftpProfileView } from './config/fileLoadTypes';
import { RemoteFileApi } from './services/remoteFileApi';
import { Upload } from 'lucide-react';

const defaultColumnWidths: ColumnWidths = {
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

interface LoadedSource {
  content: string;
  fileName: string;
  fileSize: number;
}

function createFilterOptions(format: LogFormatConfig): FilterOptions {
  return {
    level: 'ALL',
    selectedLevels: [],
    searchKeyword: '',
    searchColumn: 'ALL',
    searchColumns: ['ALL'],
    isRegex: false,
    matchCase: false,
    selectedModule: 'ALL',
    selectedThread: 'ALL',
    rangeKeyword: '',
    startTime: '',
    endTime: '',
    isUtcOffset: false,
    utcOffsetHours: 8,
    highlightKeyword: '',
    highlightMatchCase: false,
    highlightIsRegex: false,
    wordWrap: true,
    columnFilters: createColumnFilters(),
    configuredFilters: createConfiguredFilters(format),
  };
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function csvCell(value: unknown): string {
  return `"${fieldText(value).replace(/"/g, '""')}"`;
}

export default function App() {
  const [formats, setFormats] = useState<LogFormatConfig[]>(() => [createBuiltinLogFormat()]);
  const [selectedFormatId, setSelectedFormatId] = useState<string>(BuiltinFormatId.LegacyStandard);
  const [configErrors, setConfigErrors] = useState<ConfigError[]>([]);
  const [source, setSource] = useState<LoadedSource | null>(null);
  const sourceRef = useRef<LoadedSource | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fileLoad, setFileLoad] = useState<FileLoadState>(() => LoadState.idle());
  const fileLoadRef = useRef<FileLoadState>(LoadState.idle());
  const loadSequenceRef = useRef(0);
  const parseSequenceRef = useRef(0);
  const cancelledLoadIdsRef = useRef<Set<number>>(new Set());
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [sftpProfiles, setSftpProfiles] = useState<SftpProfileView[]>([]);
  const isBusy = LoadState.busy(fileLoad) || isLoading;

  const publishLoad = useCallback((next: FileLoadState) => {
    fileLoadRef.current = next;
    setFileLoad(next);
  }, []);

  const beginLoad = useCallback((phase: LoadPhase, sourceKind: LoadSourceKind, fileName: string, totalBytes: number = 0): number | null => {
    if (LoadState.busy(fileLoadRef.current)) return null;
    const next: FileLoadState = {
      id: ++loadSequenceRef.current,
      phase,
      source: sourceKind,
      fileName,
      loadedBytes: 0,
      totalBytes,
    };
    publishLoad(next);
    return next.id;
  }, [publishLoad]);

  const updateLoad = useCallback((id: number, patch: Partial<FileLoadState>) => {
    if (fileLoadRef.current.id !== id) return;
    publishLoad({ ...fileLoadRef.current, ...patch, id });
  }, [publishLoad]);

  const finishLoad = useCallback((id: number) => {
    if (fileLoadRef.current.id !== id) return;
    publishLoad(LoadState.idle());
  }, [publishLoad]);

  const failLoad = useCallback((id: number, message: string) => {
    if (fileLoadRef.current.id !== id) return;
    publishLoad({ ...fileLoadRef.current, phase: LoadPhase.Error, message });
  }, [publishLoad]);

  useEffect(() => {
    RemoteFileApi.profiles()
      .then(setSftpProfiles)
      .catch(() => setSftpProfiles([{ id: 'default', name: '默认 SFTP 服务器', root: '/', ready: false }]));
  }, []);

  // 主题模式 (dark / light) 默认使用浅色 (light)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('LOGVIEWER_THEME');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });
  const handleToggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_THEME', theme);
    } catch {}
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // 表格边框显示度 (light / medium / strong)
  const [borderIntensity, setBorderIntensity] = useState<BorderIntensity>(() => {
    try {
      const saved = localStorage.getItem('LOGVIEWER_BORDER_INTENSITY');
      if (saved === 'light' || saved === 'medium' || saved === 'strong') return saved;
    } catch {}
    return 'medium';
  });

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_BORDER_INTENSITY', borderIntensity);
    } catch {}
  }, [borderIntensity]);

  const [jumpToLine, setJumpToLine] = useState<{ line: number; timestamp: number } | null>(null);

  const handleJumpToLine = useCallback((lineNum: number) => {
    setJumpToLine({ line: lineNum, timestamp: Date.now() });
  }, []);

  const [targetNavLog, setTargetNavLog] = useState<{ id: number; timestamp: number } | null>(null);

  const handleNavigateToLog = useCallback((logId: number) => {
    setSelectedIds(new Set([logId]));
    setTargetNavLog({ id: logId, timestamp: Date.now() });
  }, []);

  // 自定义列宽 (持久化存储)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    try {
      const saved = localStorage.getItem('LOGVIEWER_COLUMN_WIDTHS');
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultColumnWidths;
  });

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_COLUMN_WIDTHS', JSON.stringify(columnWidths));
    } catch {}
  }, [columnWidths]);

  const handleResetColumnWidths = () => {
    setColumnWidths(defaultColumnWidths);
    try {
      localStorage.setItem('LOGVIEWER_COLUMN_WIDTHS', JSON.stringify(defaultColumnWidths));
    } catch {}
  };

  // 1. 过滤条件状态
  const [filter, setFilter] = useState<FilterOptions>(() => createFilterOptions(createBuiltinLogFormat()));

  const selectedFormat = useMemo(
    () => formats.find((format) => format.id === selectedFormatId) || formats[0],
    [formats, selectedFormatId],
  );

  // 2. 显示密度 (compact: 20px / normal: 24px / relaxed: 28px) (持久化存储)
  const [density, setDensity] = useState<DisplayDensity>(() => {
    try {
      const saved = localStorage.getItem('LOGVIEWER_DENSITY');
      if (saved === 'compact' || saved === 'normal' || saved === 'relaxed') return saved;
    } catch {}
    return 'normal';
  });

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_DENSITY', density);
    } catch {}
  }, [density]);

  // 3. 列显示/隐藏选择器 (默认隐藏 线程ID 和 内存地址，支持持久化)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    try {
      const saved = localStorage.getItem('LOGVIEWER_COLUMN_VISIBILITY');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      index: true,
      timestamp: true,
      level: true,
      requestId: true,
      operationDesc: true,
      functionName: true,
      threadId: false,      // 默认隐藏线程ID
      memoryAddress: false, // 默认隐藏内存地址
      module: true,
      fileName: true,
      lineNumber: true,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_COLUMN_VISIBILITY', JSON.stringify(columnVisibility));
    } catch {}
  }, [columnVisibility]);

  // 4. 向后兼容样式配置 (默认关闭: 物理零跳动; 开启后支持旧版加粗与徽章高亮)
  const [legacyBoldSelection, setLegacyBoldSelection] = useState<boolean>(() => {
    try {
      return localStorage.getItem('LOGVIEWER_LEGACY_BOLD_SELECTION') === 'true';
    } catch {}
    return false;
  });

  const [legacyHighlightStyle, setLegacyHighlightStyle] = useState<boolean>(() => {
    try {
      return localStorage.getItem('LOGVIEWER_LEGACY_HIGHLIGHT_STYLE') === 'true';
    } catch {}
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_LEGACY_BOLD_SELECTION', String(legacyBoldSelection));
    } catch {}
  }, [legacyBoldSelection]);

  useEffect(() => {
    try {
      localStorage.setItem('LOGVIEWER_LEGACY_HIGHLIGHT_STYLE', String(legacyHighlightStyle));
    } catch {}
  }, [legacyHighlightStyle]);

  const parseSource = useCallback((loaded: LoadedSource, format: LogFormatConfig, delay: number = 10, loadId?: number) => {
    const parseId = ++parseSequenceRef.current;
    setIsLoading(true);
    setSelectedIds(new Set());
    if (loadId !== undefined) updateLoad(loadId, { phase: LoadPhase.Parsing, loadedBytes: loaded.fileSize, totalBytes: loaded.fileSize });
    setTimeout(() => {
      if (parseSequenceRef.current !== parseId) return;
      const result = format.builtin
        ? parseLogContent(loaded.content, loaded.fileName, loaded.fileSize)
        : parseConfiguredLogContent(loaded.content, loaded.fileName, loaded.fileSize, format);
      const { logs: parsedLogs, stats: parsedStats } = result;
      setLogs(parsedLogs);
      setStats(parsedStats);
      setIsLoading(false);
      if (loadId !== undefined) finishLoad(loadId);
    }, delay);
  }, [finishLoad, updateLoad]);

  useEffect(() => {
    let active = true;
    loadLogViewerConfig().then((result) => {
      if (!active) return;
      const defaultFormat = result.formats.find((format) => format.id === result.defaultFormat) || result.formats[0];
      setFormats(result.formats);
      setConfigErrors(result.errors);
      setSelectedFormatId(defaultFormat.id);
      setFilter(createFilterOptions(defaultFormat));
      if (sourceRef.current) parseSource(sourceRef.current, defaultFormat);
    });
    return () => { active = false; };
  }, [parseSource]);

  // 核心：处理文件解析与装载
  const handleLoadContent = useCallback((content: string, fileName: string, fileSize: number, loadId: number) => {
    if (fileLoadRef.current.id !== loadId) return;
    const loaded = { content, fileName, fileSize };
    setSource(loaded);
    sourceRef.current = loaded;
    parseSource(loaded, selectedFormat, 10, loadId);
  }, [parseSource, selectedFormat]);

  // 生成并装载示例数据
  const handleLoadSample = useCallback((count: number) => {
    const fileName = `sample_application_${count}.log`;
    const loadId = beginLoad(LoadPhase.Reading, LoadSourceKind.Sample, fileName);
    if (loadId === null) return;
    const builtin = formats.find((format) => format.id === BuiltinFormatId.LegacyStandard) || formats[0];
    const sampleText = generateSampleLogsText(count);
    const loaded = { content: sampleText, fileName, fileSize: new Blob([sampleText]).size };
    setSelectedFormatId(builtin.id);
    setFilter(createFilterOptions(builtin));
    setSource(loaded);
    sourceRef.current = loaded;
    parseSource(loaded, builtin, 20, loadId);
  }, [beginLoad, formats, parseSource]);

  const handleFormatChange = useCallback((formatId: string) => {
    if (isBusy) return;
    const format = formats.find((item) => item.id === formatId);
    if (!format) return;
    setSelectedFormatId(format.id);
    setFilter(createFilterOptions(format));
    setSelectedIds(new Set());
    if (source) {
      const loadId = beginLoad(LoadPhase.Parsing, LoadSourceKind.Reparse, source.fileName, source.fileSize);
      if (loadId !== null) parseSource(source, format, 10, loadId);
    }
  }, [beginLoad, formats, isBusy, parseSource, source]);

  const handleFile = useCallback((file: File) => {
    const loadId = beginLoad(LoadPhase.Reading, LoadSourceKind.Local, file.name, file.size);
    if (loadId === null) return;
    const reader = new FileReader();
    reader.onprogress = (event) => updateLoad(loadId, { loadedBytes: event.loaded, totalBytes: event.lengthComputable ? event.total : file.size });
    reader.onerror = () => failLoad(loadId, '无法读取该本地文件，请检查文件是否仍然可用');
    reader.onload = (event) => handleLoadContent(String(event.target?.result || ''), file.name, file.size, loadId);
    reader.readAsText(file);
  }, [beginLoad, failLoad, handleLoadContent, updateLoad]);

  // 打开本地文件选择器
  const handleSelectFile = () => {
    if (isBusy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.log,.txt,.out,.csv,.jsonl,.ndjson,application/x-ndjson,text/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  };

  const handleRemoteLoad = useCallback(async (profileId: string, remotePath: string) => {
    const fileName = remotePath.split('/').filter(Boolean).pop() || '远程文件';
    const loadId = beginLoad(LoadPhase.Downloading, LoadSourceKind.Remote, fileName);
    if (loadId === null) return;
    setRemoteDialogOpen(false);
    try {
      let task = await RemoteFileApi.create(profileId, remotePath);
      if (cancelledLoadIdsRef.current.delete(loadId) || fileLoadRef.current.id !== loadId) {
        await RemoteFileApi.cancel(task.id).catch(() => undefined);
        return;
      }
      updateLoad(loadId, { taskId: task.id, fileName: task.fileName || fileName });
      while (task.status === DownloadStatus.Queued || task.status === DownloadStatus.Downloading) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (fileLoadRef.current.id !== loadId) return;
        task = await RemoteFileApi.task(task.id);
        updateLoad(loadId, {
          taskId: task.id,
          fileName: task.fileName,
          loadedBytes: task.downloadedBytes,
          totalBytes: task.totalBytes,
        });
      }
      if (task.status !== DownloadStatus.Completed) throw new Error(task.error || '远程文件下载未完成');
      const loaded = await RemoteFileApi.content(task.id);
      handleLoadContent(loaded.content, loaded.name, loaded.size, loadId);
    } catch (error) {
      failLoad(loadId, error instanceof Error ? error.message : '远程文件加载失败');
    }
  }, [beginLoad, failLoad, handleLoadContent, updateLoad]);

  const handleCancelLoad = useCallback(() => {
    const current = fileLoadRef.current;
    if (current.phase !== LoadPhase.Downloading) return;
    cancelledLoadIdsRef.current.add(current.id);
    publishLoad(LoadState.idle());
    if (current.taskId) {
      cancelledLoadIdsRef.current.delete(current.id);
      void RemoteFileApi.cancel(current.taskId).catch(() => undefined);
    }
  }, [publishLoad]);

  // 清除/重置
  const handleClear = () => {
    if (isBusy) return;
    setLogs([]);
    setStats(null);
    setSelectedIds(new Set());
    setSource(null);
    sourceRef.current = null;
  };

  // 全局拖拽支持
  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setIsDragOver(true);
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleGlobalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isBusy) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // 提取日志中所有唯一的 Module 模块列表
  const uniqueModules = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.success && log.fields?.module) {
        set.add(log.fields.module);
      }
    });
    return Array.from(set).sort();
  }, [logs]);

  // 提取日志中所有唯一的 Thread 线程列表
  const uniqueThreads = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.success && log.fields?.threadId) {
        set.add(log.fields.threadId);
      }
    });
    return Array.from(set).sort();
  }, [logs]);

  const timeRange = useMemo<[number, number] | null>(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const log of logs) {
      if (!log.fields?.timestamp) continue;
      const timeMs = parseLogTimestampToMs(log.fields.timestamp);
      if (timeMs === null) continue;
      min = Math.min(min, timeMs);
      max = Math.max(max, timeMs);
    }
    return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
  }, [logs]);

  // 核心过滤器计算：处理区间筛选、时间精准筛选(含UTC转换)、日志级别、模块、线程筛选 (全文搜索改为精准定位导航)
  const filteredLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    const {
      level,
      selectedLevels = [],
      selectedModule,
      selectedThread,
      rangeKeyword,
      startTime,
      endTime,
      isUtcOffset,
      utcOffsetHours,
    } = filter;

    const isAllLevels = selectedLevels.length === 0 || selectedLevels.includes('ALL');

    let baseLogs = logs;

    // 1. 区间筛选：从 rangeKeyword 首次出现的行 ~ 末次出现的行
    if (rangeKeyword && rangeKeyword.trim()) {
      const kw = rangeKeyword.trim();
      const firstIdx = baseLogs.findIndex((log) => log.rawText.includes(kw));
      if (firstIdx === -1) {
        return []; // 没找到区间起始行
      }
      let lastIdx = -1;
      for (let i = baseLogs.length - 1; i >= 0; i--) {
        if (baseLogs[i].rawText.includes(kw)) {
          lastIdx = i;
          break;
        }
      }
      if (firstIdx !== -1 && lastIdx !== -1 && lastIdx >= firstIdx) {
        baseLogs = baseLogs.slice(firstIdx, lastIdx + 1);
      }
    }

    // 2. 时间范围解析（精确到毫秒，支持 GMT+8 自动转换 UTC）
    const startMs = parseInputTimeToMs(startTime, isUtcOffset, utcOffsetHours);
    const endMs = parseInputTimeToMs(endTime, isUtcOffset, utcOffsetHours, true);
    if ((startTime && startMs === null) || (endTime && endMs === null)) return [];
    if (startMs !== null && endMs !== null && startMs > endMs) return [];

    return baseLogs.filter((log) => {
      // 级别筛选 (支持多选，未选/选全部时默认为全部)
      if (!isAllLevels) {
        let matched = false;
        for (const lvl of selectedLevels) {
          if (lvl === 'FAILED_ONLY') {
            if (!log.success) {
              matched = true;
              break;
            }
          } else {
            if (log.success && log.fields?.level === lvl) {
              matched = true;
              break;
            }
          }
        }
        if (!matched) return false;
      } else if (level && level !== 'ALL') {
        if (level === 'FAILED_ONLY') {
          if (log.success) return false;
        } else {
          if (!log.success || log.fields?.level !== level) return false;
        }
      }

      // 模块筛选
      if (selectedModule !== 'ALL') {
        if (!log.success || log.fields?.module !== selectedModule) return false;
      }

      // 线程筛选
      if (selectedThread !== 'ALL') {
        if (!log.success || log.fields?.threadId !== selectedThread) return false;
      }

      // 时间精确到毫秒筛选
      if (startMs !== null || endMs !== null) {
        if (!log.fields?.timestamp) return false;
        const logMs = parseLogTimestampToMs(log.fields.timestamp);
        if (logMs === null) return false;
        if (startMs !== null && logMs < startMs) return false;
        if (endMs !== null && logMs > endMs) return false;
      }

      if (selectedFormat.builtin) {
        if (!matchColumnFilters(log, filter.columnFilters)) return false;
      } else if (!matchConfiguredFilters(log, selectedFormat, filter.configuredFilters)) {
        return false;
      }

      return true;
    });
  }, [logs, filter, selectedFormat]);

  // 计算全文搜索匹配的日志 ID 列表 (支持指定单列/多列与全文搜索，用于定位导航与条数统计)
  const searchMatchLogIds = useMemo(() => {
    if (!filter.searchKeyword || !filter.searchKeyword.trim()) return [];
    let regex: RegExp | null = null;
    try {
      const pattern = filter.isRegex ? filter.searchKeyword : filter.searchKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(pattern, filter.matchCase ? 'g' : 'gi');
    } catch {
      return [];
    }
    const ids: number[] = [];
    const searchCols = filter.searchColumns && filter.searchColumns.length > 0 
      ? filter.searchColumns 
      : (filter.searchColumn ? [filter.searchColumn] : ['ALL']);
    const isAllCols = searchCols.includes('ALL');

    for (const log of filteredLogs) {
      regex.lastIndex = 0;
      let matched = false;
      if (isAllCols) {
        matched = regex.test(log.rawText);
      } else {
        for (const colKey of searchCols) {
          regex.lastIndex = 0;
          let val = '';
          if (colKey === 'lineNumber') {
            val = String(log.lineNumber);
          } else if (log.success && log.fields) {
            val = fieldText(log.fields[colKey]);
          }
          if (val && regex.test(val)) {
            matched = true;
            break;
          }
        }
      }
      if (matched) {
        ids.push(log.id);
      }
    }
    return ids;
  }, [filteredLogs, filter.searchKeyword, filter.isRegex, filter.matchCase, filter.searchColumn, filter.searchColumns]);

  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const firstVisibleIndexRef = useRef<number>(0);

  const handleFirstVisibleIndexChange = useCallback((index: number) => {
    firstVisibleIndexRef.current = index;
  }, []);

  const activeSearchLogId = useMemo(() => {
    if (searchMatchLogIds.length === 0) return null;
    const idx = Math.min(Math.max(0, currentMatchIndex), searchMatchLogIds.length - 1);
    return searchMatchLogIds[idx];
  }, [searchMatchLogIds, currentMatchIndex]);

  // 点击下一条匹配项：导航并选中
  const handleNextMatch = useCallback(() => {
    if (searchMatchLogIds.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchMatchLogIds.length;
    setCurrentMatchIndex(nextIdx);
    const targetLogId = searchMatchLogIds[nextIdx];
    setSelectedIds(new Set([targetLogId]));
    setTargetNavLog({ id: targetLogId, timestamp: Date.now() });
  }, [searchMatchLogIds, currentMatchIndex]);

  // 点击上一条匹配项：导航并选中
  const handlePrevMatch = useCallback(() => {
    if (searchMatchLogIds.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchMatchLogIds.length) % searchMatchLogIds.length;
    setCurrentMatchIndex(prevIdx);
    const targetLogId = searchMatchLogIds[prevIdx];
    setSelectedIds(new Set([targetLogId]));
    setTargetNavLog({ id: targetLogId, timestamp: Date.now() });
  }, [searchMatchLogIds, currentMatchIndex]);

  // 点击搜索按钮或按 Enter：以当前屏幕可视区域首行为基准，搜索后一个匹配目标并导航并选中
  const handleTriggerSearch = useCallback(() => {
    if (searchMatchLogIds.length === 0 || filteredLogs.length === 0) return;

    const logIndexMap = new Map<number, number>();
    filteredLogs.forEach((l, idx) => {
      logIndexMap.set(l.id, idx);
    });

    const v = firstVisibleIndexRef.current;

    // 寻找在当前屏幕可视区域首行之后（或所在行）的第一个匹配项
    let targetMatchIdx = -1;

    for (let i = 0; i < searchMatchLogIds.length; i++) {
      const matchLogId = searchMatchLogIds[i];
      const rowIdx = logIndexMap.get(matchLogId) ?? -1;

      // 如果当前已经选中了该项并且就在当前视口位置，则寻找下一个严格大于当前位置的
      const isAlreadySelected = selectedIds.has(matchLogId);
      if (isAlreadySelected) {
        if (rowIdx > v) {
          targetMatchIdx = i;
          break;
        }
      } else {
        if (rowIdx >= v) {
          targetMatchIdx = i;
          break;
        }
      }
    }

    // 如果在当前屏幕可视区域之后没有更多匹配项，则循环回到首个匹配项 (0)
    if (targetMatchIdx === -1) {
      targetMatchIdx = 0;
    }

    setCurrentMatchIndex(targetMatchIdx);
    const targetLogId = searchMatchLogIds[targetMatchIdx];
    setSelectedIds(new Set([targetLogId]));
    setTargetNavLog({ id: targetLogId, timestamp: Date.now() });
  }, [searchMatchLogIds, filteredLogs, selectedIds]);

  // 更新 partial filter
  const handleFilterChange = (updated: Partial<FilterOptions>) => {
    setFilter((prev) => ({ ...prev, ...updated }));
  };

  // 导出 JSON
  const handleExportJSON = () => {
    const exportData = filteredLogs.map((l) => ({
      lineNumber: l.lineNumber,
      success: l.success,
      fields: l.fields || null,
      rawText: l.rawText,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出 CSV
  const handleExportCSV = () => {
    if (!selectedFormat.builtin) {
      const headers = ['Line', ...selectedFormat.fields.map((field) => field.label), 'Status', 'RawText'];
      const rows = filteredLogs.map((log) => [
        log.lineNumber,
        ...selectedFormat.fields.map((field) => csvCell(log.fields?.[field.id])),
        log.success ? 'SUCCESS' : 'FAILED',
        csvCell(log.rawText),
      ].join(','));
      const csvContent = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `log_export_${selectedFormat.id}_${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = ['Line', 'Timestamp', 'Level', 'RequestID', 'OperationDescription', 'FunctionName', 'ThreadID', 'MemoryAddress', 'Module', 'FileName', 'LineNumber', 'Status', 'RawText'];
    const rows = filteredLogs.map((l) => {
      if (l.success && l.fields) {
        return [
          l.lineNumber,
          `"${l.fields.timestamp.replace(/"/g, '""')}"`,
          `"${l.fields.level}"`,
          `"${l.fields.requestId}"`,
          `"${l.fields.operationDesc.replace(/"/g, '""')}"`,
          `"${l.fields.functionName}"`,
          `"${l.fields.threadId}"`,
          `"${l.fields.memoryAddress}"`,
          `"${l.fields.module}"`,
          `"${l.fields.fileName}"`,
          `"${l.fields.lineNumber}"`,
          'SUCCESS',
          `"${l.rawText.replace(/"/g, '""')}"`,
        ].join(',');
      } else {
        return [l.lineNumber, '', '', '', '', '', '', '', '', '', '', 'FAILED', `"${l.rawText.replace(/"/g, '""')}"`].join(',');
      }
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 复制当前选中的多行日志原始文本
  const handleCopySelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selectedLogsList = filteredLogs.filter((l) => selectedIds.has(l.id));
    const rawTextJoined = selectedLogsList.map((l) => l.rawText).join('\n');
    navigator.clipboard.writeText(rawTextJoined);
  }, [filteredLogs, selectedIds]);

  // 全选过滤结果
  const handleSelectAll = useCallback(() => {
    const allSet = new Set(filteredLogs.map((l) => l.id));
    setSelectedIds(allSet);
  }, [filteredLogs]);

  // 清空选择
  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 复制过滤后的原始日志
  const handleCopyFilteredRaw = () => {
    const rawTextLines = filteredLogs.map((l) => l.rawText).join('\n');
    navigator.clipboard.writeText(rawTextLines);
  };

  const configuredFilterItems = useMemo(
    () => selectedFormat.builtin ? [] : configuredFilterSummaries(selectedFormat, filter.configuredFilters),
    [selectedFormat, filter.configuredFilters],
  );
  const searchableFields = useMemo(
    () => selectedFormat.builtin ? undefined : selectedFormat.fields.map((field) => ({ key: field.id, label: field.label })),
    [selectedFormat],
  );
  const handleClearConfiguredFilter = (fieldId: string) => {
    setFilter((previous) => ({
      ...previous,
      configuredFilters: clearConfiguredFilter(selectedFormat, previous.configuredFilters, fieldId),
    }));
  };
  const handleClearAllConfiguredFilters = () => {
    setFilter((previous) => ({ ...previous, configuredFilters: createConfiguredFilters(selectedFormat) }));
  };

  return (
    <div
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
      className={`h-screen w-screen flex flex-col overflow-hidden font-sans relative select-none ${
        theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* 拖拽全屏 Visual Hover Highlight */}
      {isDragOver && (
        <div className={`absolute inset-0 z-50 backdrop-blur-sm border-4 border-dashed flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150 ${
          theme === 'light' ? 'bg-blue-100/90 border-blue-500 text-blue-900' : 'bg-blue-950/80 border-blue-400 text-blue-200'
        }`}>
          <Upload className="w-16 h-16 mb-4 text-blue-500" />
          <h2 className="text-2xl font-bold">释放鼠标即可立即加载解析日志文件</h2>
          <p className="text-sm mt-2 font-mono">支持 .log / .txt 等文本日志</p>
        </div>
      )}

      {/* 顶部 Header Dashboard */}
      <HeaderDashboard
        stats={stats}
        onSelectFile={handleSelectFile}
        onSelectRemote={() => { if (!isBusy) setRemoteDialogOpen(true); }}
        onLoadSample={handleLoadSample}
        onClear={handleClear}
        isLoading={isBusy}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        formats={formats}
        selectedFormatId={selectedFormat.id}
        configErrors={configErrors}
        onFormatChange={handleFormatChange}
      />

      <FileLoadBar
        state={fileLoad}
        theme={theme}
        onCancel={handleCancelLoad}
        onDismiss={() => publishLoad(LoadState.idle())}
      />

      {/* 主面板内容区 */}
      {logs.length === 0 ? (
        <DropZone
          onFileSelected={handleFile}
          onSelectRemote={() => { if (!isBusy) setRemoteDialogOpen(true); }}
          onLoadSample={handleLoadSample}
          isLoading={isBusy}
          theme={theme}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 工具栏 Toolbar */}
          <Toolbar
            filter={filter}
            onFilterChange={handleFilterChange}
            density={density}
            onDensityChange={setDensity}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            stats={stats}
            filteredCount={filteredLogs.length}
            uniqueModules={uniqueModules}
            uniqueThreads={uniqueThreads}
            timeRange={timeRange}
            selectedCount={selectedIds.size}
            onCopySelected={handleCopySelected}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onExportJSON={handleExportJSON}
            onExportCSV={handleExportCSV}
            onCopyFilteredRaw={handleCopyFilteredRaw}
            totalMatches={searchMatchLogIds.length}
            currentMatchIndex={currentMatchIndex}
            onTriggerSearch={handleTriggerSearch}
            onNextMatch={handleNextMatch}
            onPrevMatch={handlePrevMatch}
            theme={theme}
            borderIntensity={borderIntensity}
            onBorderIntensityChange={setBorderIntensity}
            onResetColumnWidths={handleResetColumnWidths}
            onJumpToLine={handleJumpToLine}
            legacyBoldSelection={legacyBoldSelection}
            onLegacyBoldSelectionChange={setLegacyBoldSelection}
            legacyHighlightStyle={legacyHighlightStyle}
            onLegacyHighlightStyleChange={setLegacyHighlightStyle}
            showLegacyFilters={Boolean(selectedFormat.builtin)}
            searchableFields={searchableFields}
            configuredFilterItems={configuredFilterItems}
            onClearConfiguredFilter={handleClearConfiguredFilter}
            onClearAllConfiguredFilters={handleClearAllConfiguredFilters}
          />

          {/* 内置格式保持原表格；外部格式使用契约驱动表格 */}
          {selectedFormat.builtin ? <VirtualLogTable
            logs={filteredLogs}
            density={density}
            columnVisibility={columnVisibility}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            highlightKeyword={filter.highlightKeyword}
            highlightMatchCase={filter.highlightMatchCase}
            highlightIsRegex={filter.highlightIsRegex}
            matchCase={filter.matchCase}
            wordWrap={filter.wordWrap}
            filter={filter}
            onFilterChange={handleFilterChange}
            uniqueModules={uniqueModules}
            uniqueThreads={uniqueThreads}
            timeRange={timeRange}
            activeSearchLogId={activeSearchLogId}
            searchKeyword={filter.searchKeyword}
            searchMatchCase={filter.matchCase}
            searchIsRegex={filter.isRegex}
            columnWidths={columnWidths}
            onColumnWidthsChange={setColumnWidths}
            theme={theme}
            borderIntensity={borderIntensity}
            jumpToLine={jumpToLine}
            targetNavLog={targetNavLog}
            onFirstVisibleIndexChange={handleFirstVisibleIndexChange}
            legacyBoldSelection={legacyBoldSelection}
            legacyHighlightStyle={legacyHighlightStyle}
          /> : <ConfigurableLogTable
            logs={filteredLogs}
            optionLogs={logs}
            format={selectedFormat}
            filters={filter.configuredFilters}
            onFiltersChange={(configuredFilters) => handleFilterChange({ configuredFilters })}
            filter={filter}
            density={density}
            theme={theme}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            activeSearchLogId={activeSearchLogId}
            targetNavLog={targetNavLog}
            onFirstVisibleIndexChange={handleFirstVisibleIndexChange}
          />}

          {/* 浮动 ERROR 快捷导航控件 */}
          <FloatingErrorNav
            filteredLogs={filteredLogs}
            selectedIds={selectedIds}
            onSelectLog={(id) => setSelectedIds(new Set([id]))}
            onNavigateToLog={handleNavigateToLog}
            theme={theme}
          />
        </div>
      )}
      <RemoteFileDialog
        open={remoteDialogOpen}
        profiles={sftpProfiles}
        busy={isBusy}
        theme={theme}
        onClose={() => { if (!isBusy) setRemoteDialogOpen(false); }}
        onSubmit={handleRemoteLoad}
      />
    </div>
  );
}
