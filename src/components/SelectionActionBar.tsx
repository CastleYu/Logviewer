import React, { useEffect } from 'react';
import { CheckSquare } from 'lucide-react';
import { UiShortcutKey } from '../config/uiConstants';
import { Tooltip } from './Tooltip';

interface SelectionActionBarProps {
  selectedCount: number;
  filteredCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * 底部固定状态与选中栏（M10）：打开日志后常驻 32px 高度，左侧全选筛选结果与已选数，右侧显示 M / K 条。
 */
export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
  selectedCount,
  filteredCount,
  totalCount,
  onSelectAll,
  onClearSelection,
}) => {
  useEffect(() => {
    if (selectedCount === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== UiShortcutKey.Escape || event.defaultPrevented) return;
      if (isEditableElement(event.target)) return;
      if (document.querySelector('[data-menu], [role="dialog"]')) return;
      onClearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCount, onClearSelection]);

  const allSelected = filteredCount > 0 && selectedCount >= filteredCount;

  return (
    <div
      className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-3 text-[11px] text-ink-2 select-none"
      role="status"
      aria-label="选中与计数状态栏"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Tooltip text={allSelected ? '已全选当前筛选结果' : `全选当前筛选结果（${filteredCount.toLocaleString()} 条）`}>
          <button
            type="button"
            disabled={filteredCount === 0}
            onClick={onSelectAll}
            className={`inline-flex h-5.5 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors disabled:opacity-40 ${
              allSelected
                ? 'border-accent/40 bg-accent-soft text-accent-ink'
                : 'border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink'
            }`}
          >
            <CheckSquare className="h-3 w-3" />
            <span>全选筛选结果 {filteredCount.toLocaleString()} 条</span>
          </button>
        </Tooltip>

        <span className="h-3.5 w-px bg-line" aria-hidden="true" />

        {selectedCount > 0 ? (
          <span className="flex items-center gap-1.5 font-medium tabular-nums text-accent-ink">
            <span>已选 {selectedCount.toLocaleString()} 条</span>
            <Tooltip text="清空当前选中行" kbd="Esc">
              <kbd className="lv-kbd cursor-pointer" onClick={onClearSelection}>
                Esc 清空
              </kbd>
            </Tooltip>
          </span>
        ) : (
          <span className="text-ink-3">未选择</span>
        )}
      </div>

      <div className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
        显示 <strong className="font-semibold text-ink-2">{filteredCount.toLocaleString()}</strong> / {totalCount.toLocaleString()} 条
      </div>
    </div>
  );
};
