import React from 'react';
import { LogStats } from '../types';

interface StatusBarProps {
  stats: LogStats;
  filtered: number;
  selected: number;
  origin?: string;
}

/** 底部状态栏：记录数、筛选结果、失败数、解析耗时、来源路径与选择数。 */
export const StatusBar: React.FC<StatusBarProps> = ({ stats, filtered, selected, origin }) => {
  const lines = stats.physicalLineCount ?? stats.totalCount;
  const item = 'flex shrink-0 items-center gap-1.5 whitespace-nowrap';
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-raised px-3 font-mono text-[11px] tabular-nums text-ink-3" aria-label="日志状态">
      <span className={item} title="解析出的记录数 / 物理行数">
        <span className="text-ink-2">{stats.totalCount.toLocaleString()}</span> 条记录
        {lines !== stats.totalCount ? <span>· {lines.toLocaleString()} 行</span> : null}
      </span>
      {filtered !== stats.totalCount ? (
        <span className={item}><span className="h-1.5 w-1.5 rounded-full bg-accent" />筛选后 <span className="text-accent-ink">{filtered.toLocaleString()}</span></span>
      ) : null}
      {stats.failedCount > 0 ? (
        <span className={`${item} text-danger`} title="无法按当前格式解析的行">解析失败 {stats.failedCount.toLocaleString()}</span>
      ) : <span className={`${item} text-ok`}>全部解析成功</span>}
      <span className={`${item} hidden sm:flex`}>{stats.parseDurationMs} ms</span>
      <span className="hidden min-w-0 flex-1 truncate text-right md:block" title={origin}>{origin}</span>
      {selected > 0 ? <span className={`${item} ml-auto text-accent-ink md:ml-0`}>已选 {selected.toLocaleString()}</span> : null}
    </footer>
  );
};
