import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Hash } from 'lucide-react';
import { MenuLayerConst, UiShortcutKey } from '../config/uiConstants';
import { Tooltip } from './Tooltip';

interface LineJumpHeaderProps {
  totalFiltered: number;
  onJump: (lineNumber: number) => void;
  rightSlot?: React.ReactNode;
}

/**
 * 表格首列 `#` 跳转表头（T12）：支持点击 `#` 或按 Ctrl+G 弹出源文件行号跳转输入框。
 */
export const LineJumpHeader: React.FC<LineJumpHeaderProps> = ({ totalFiltered, onJump, rightSlot }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPopover = () => {
    setAnchor(btnRef.current?.getBoundingClientRect() || null);
    setOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === UiShortcutKey.JumpLine) {
        event.preventDefault();
        openPopover();
      } else if (open && event.key === UiShortcutKey.Escape) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-line-jump-popover]') || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const num = Number(value.trim());
    if (!Number.isInteger(num) || num < 1) return;
    onJump(num);
    setOpen(false);
    setValue('');
  };

  return (
    <div className="flex w-full items-center justify-between gap-0.5">
      <Tooltip text="按源行号跳转" kbd="Ctrl+G">
        <button
          ref={btnRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPopover())}
          aria-label="跳转到源行号"
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-semibold text-ink-2 hover:bg-raised hover:text-accent-ink"
        >
          <Hash className="h-3 w-3 text-ink-3" />
        </button>
      </Tooltip>
      {rightSlot}
      {open && anchor
        ? createPortal(
            <form
              data-line-jump-popover
              onSubmit={submit}
              style={{
                left: Math.max(8, Math.min(anchor.left, window.innerWidth - 200)),
                top: anchor.bottom + 4,
                zIndex: MenuLayerConst.ZIndex,
              }}
              className="fixed flex w-48 items-center gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-[var(--shadow-window)]"
            >
              <input
                ref={inputRef}
                type="number"
                min={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label="输入源行号"
                placeholder={totalFiltered > 0 ? '输入源行号…' : '暂无记录'}
                className="lv-input h-7 min-w-0 flex-1 font-mono text-xs"
              />
              <button
                type="submit"
                disabled={!value.trim()}
                className="lv-btn lv-btn-primary h-7 shrink-0 px-2 text-[11px] disabled:opacity-40"
              >
                跳转
              </button>
            </form>,
            document.body,
          )
        : null}
    </div>
  );
};
