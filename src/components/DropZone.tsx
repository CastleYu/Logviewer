import React, { useState } from 'react';
import { Upload, FileText, Sparkles, Code } from 'lucide-react';
import { ThemeMode } from '../types';

interface DropZoneProps {
  onFileLoaded: (content: string, name: string, size: number) => void;
  onLoadSample: (count: number) => void;
  isLoading: boolean;
  theme?: ThemeMode;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileLoaded,
  onLoadSample,
  isLoading,
  theme = 'dark',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const isLight = theme === 'light';

  const handleFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileLoaded(content, file.name, file.size);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex-1 w-full h-full flex flex-col items-center justify-center p-6 transition-all relative overflow-hidden select-none ${
        isDragOver
          ? isLight ? 'bg-indigo-50/80 border-2 border-dashed border-indigo-500' : 'bg-indigo-950/30 border-2 border-dashed border-indigo-400'
          : isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* 初始全屏拖拽大虚线框 */}
      <div className={`w-full max-w-3xl border border-dashed rounded-2xl p-8 sm:p-12 flex flex-col items-center text-center transition-all ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-2xl scale-[1.01]'
          : isLight
            ? 'border-slate-300 bg-white shadow-xl hover:border-slate-400'
            : 'border-slate-800/90 bg-slate-900/40 hover:border-slate-700/80 hover:bg-slate-900/60 shadow-2xl'
      }`}>
        {/* 顶部图标 */}
        <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-6 shadow-xs group transition-all ${
          isLight 
            ? 'bg-indigo-50 border-indigo-200/80 text-indigo-600' 
            : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
        }`}>
          <Upload className={`w-7 h-7 transition-transform duration-300 ${isDragOver ? 'scale-125 -translate-y-1' : ''}`} />
        </div>

        {/* 标题说明 */}
        <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          请将日志文件拖拽至此
        </h2>
        <p className={`text-xs sm:text-sm mt-2 max-w-md leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          支持 <code className={isLight ? 'text-indigo-700 font-mono font-semibold' : 'text-indigo-300 font-mono'}>.log</code>, <code className={isLight ? 'text-indigo-700 font-mono font-semibold' : 'text-indigo-300 font-mono'}>.txt</code> 等任意文本格式日志文件。系统将自动执行基于括号计数的嵌套算法进行极速拆解。
        </p>

        {/* 文件选择按钮 */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <label className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-all shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95">
            <FileText className="w-4 h-4" />
            选择本地文件
            <input
              type="file"
              accept=".log,.txt,.out,.csv,text/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </label>

          <button
            onClick={() => onLoadSample(10000)}
            disabled={isLoading}
            className={`flex items-center gap-2 px-5 py-2.5 font-medium text-xs rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 border ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            试用 10,000 行示例日志
          </button>
        </div>

        {/* 标准 10 字段日志格式图示规范 */}
        <div className={`mt-10 pt-6 border-t w-full text-left ${isLight ? 'border-slate-200/80' : 'border-slate-800/80'}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <Code className="w-3.5 h-3.5 text-indigo-500" />
            标准 10 字段日志格式规范 (Nested Bracket Log Syntax)
          </div>
          <div className={`p-3.5 border rounded-lg font-mono-dense text-[11px] overflow-x-auto ${
            isLight ? 'bg-slate-100/80 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800/80 text-slate-300'
          }`}>
            <div className="text-indigo-600 dark:text-indigo-400 font-semibold mb-1.5">
              [时间戳][日志级别][请求ID][操作描述][函数名][线程ID][内存地址][模块][文件名][行号]
            </div>
            <div className={`text-[10px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              支持“操作描述”内包含任意层级的嵌套中括号，如：<br/>
              <span className={isLight ? 'text-emerald-700 font-medium' : 'text-emerald-400/90 font-medium'}>
                [2026-07-30 23:30:00.123][INFO][REQ-890214][User <span className={isLight ? 'text-amber-700 font-semibold' : 'text-amber-300'}>[ID: 9812]</span> executed <span className={isLight ? 'text-amber-700 font-semibold' : 'text-amber-300'}>[Login]</span>][ProcessAuth][T-04][0x7FFF5FBFF040][AuthModule][user_service.cpp][142]
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
