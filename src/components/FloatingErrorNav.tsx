import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { ErrorNavConst, OrdinalJump, UiShortcutKey, UiStorageKey } from '../config/uiConstants';
import { Tooltip } from './Tooltip';

interface FloatingErrorNavProps {
  totalErrors: number;
  currentErrorIndex: number;
  onPrevError: () => void;
  onNextError: () => void;
  onJumpToError: (ordinal: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface FloatingPos {
  right: number;
  bottom: number;
}

function loadSavedPos(): FloatingPos {
  try {
    const raw = localStorage.getItem(UiStorageKey.ErrorNavPos);
    if (!raw) return { right: ErrorNavConst.DefaultOffsetRight, bottom: ErrorNavConst.DefaultOffsetBottom };
    const parsed = JSON.parse(raw) as Partial<FloatingPos>;
    if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number' && Number.isFinite(parsed.right) && Number.isFinite(parsed.bottom)) {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    /* ignore */
  }
  return { right: ErrorNavConst.DefaultOffsetRight, bottom: ErrorNavConst.DefaultOffsetBottom };
}

function clampPos(pos: FloatingPos, container: HTMLElement | null, pill: HTMLElement | null): FloatingPos {
  if (!container || !pill) return pos;
  const maxRight = Math.max(ErrorNavConst.EdgePadding, container.clientWidth - pill.offsetWidth - ErrorNavConst.EdgePadding);
  const maxBottom = Math.max(ErrorNavConst.EdgePadding, container.clientHeight - pill.offsetHeight - ErrorNavConst.EdgePadding);
  return {
    right: Math.min(Math.max(ErrorNavConst.EdgePadding, pos.right), maxRight),
    bottom: Math.min(Math.max(ErrorNavConst.EdgePadding, pos.bottom), maxBottom),
  };
}

/**
 * 浮动错误导航条（T15 / T16）：默认停靠表格右下角，支持按手柄在表格容器内拖拽与双击复位，位置持久化。
 */
export const FloatingErrorNav: React.FC<FloatingErrorNavProps> = ({
  totalErrors,
  currentErrorIndex,
  onPrevError,
  onNextError,
  onJumpToError,
  containerRef,
}) => {
  const [pos, setPos] = useState<FloatingPos>(loadSavedPos);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [jumpError, setJumpError] = useState<string | null>(null);
  const pillRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPosRef = useRef<FloatingPos>(pos);
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null);

  useEffect(() => {
    if (totalErrors === 0) {
      setEditing(false);
      setJumpError(null);
    } else {
      setJumpError(null);
    }
  }, [totalErrors]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  useEffect(() => {
    const syncClamp = () => {
      setPos((prev) => {
        const clamped = clampPos(prev, containerRef.current, pillRef.current);
        lastPosRef.current = clamped;
        return clamped;
      });
    };
    syncClamp();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncClamp);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, totalErrors, editing]);

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    lastPosRef.current = pos;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
    };
  };

  const onDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const next = clampPos(
      { right: dragRef.current.startRight - dx, bottom: dragRef.current.startBottom - dy },
      containerRef.current,
      pillRef.current,
    );
    lastPosRef.current = next;
    setPos(next);
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      localStorage.setItem(UiStorageKey.ErrorNavPos, JSON.stringify(lastPosRef.current));
    } catch {
      /* ignore */
    }
  };

  const resetPos = () => {
    const def = clampPos(
      { right: ErrorNavConst.DefaultOffsetRight, bottom: ErrorNavConst.DefaultOffsetBottom },
      containerRef.current,
      pillRef.current,
    );
    setPos(def);
    try {
      localStorage.removeItem(UiStorageKey.ErrorNavPos);
    } catch {
      /* ignore */
    }
  };

  const hasErrors = totalErrors > 0;
  const counterLabel = currentErrorIndex >= 0
    ? `${currentErrorIndex + 1}/${totalErrors.toLocaleString()}`
    : `${totalErrors.toLocaleString()}`;

  const openJumpInput = () => {
    if (!hasErrors) return;
    setDraft(currentErrorIndex >= 0 ? String(currentErrorIndex + 1) : '1');
    setJumpError(null);
    setEditing(true);
  };

  const cancelJumpInput = () => {
    setEditing(false);
    setJumpError(null);
  };

  const commitJumpInput = () => {
    const parsed = OrdinalJump.parse(draft, totalErrors);
    if (parsed.ok === false) {
      setJumpError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    setJumpError(null);
    setEditing(false);
    onJumpToError(parsed.ordinal);
  };

  return (
    <nav
      ref={pillRef}
      style={{ right: pos.right, bottom: pos.bottom }}
      className={`absolute z-30 inline-flex h-9 items-center gap-0.5 rounded-lg border px-1.5 text-xs shadow-[var(--shadow-window)] backdrop-blur-sm select-none ${
        hasErrors
          ? 'border-danger/70 bg-danger-soft/95 text-danger'
          : 'border-line bg-surface/95 text-ink-3'
      }`}
      aria-label="错误行快速导航"
    >
      {editing && jumpError ? (
        <div
          role="alert"
          className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md border border-danger/60 bg-surface px-2 py-1 text-[11px] font-medium text-danger shadow-[var(--shadow-pop)]"
        >
          {jumpError}
        </div>
      ) : null}

      <Tooltip text="拖拽调整位置，双击恢复右下角默认位置">
        <button
          type="button"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={resetPos}
          aria-label="拖拽错误导航条"
          className={`flex h-6 w-4 cursor-grab items-center justify-center rounded active:cursor-grabbing ${
            hasErrors
              ? 'text-danger/75 hover:bg-danger/15 hover:text-danger'
              : 'text-ink-3 hover:bg-raised hover:text-ink'
          }`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </Tooltip>

      {hasErrors ? (
        <>
          {editing ? (
            <div className="flex h-6 items-center gap-1 px-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
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
                    cancelJumpInput();
                  }
                }}
                onBlur={(event) => {
                  if (!pillRef.current?.contains(event.relatedTarget as Node | null)) {
                    cancelJumpInput();
                  }
                }}
                aria-label="跳转到第几条错误（按 Enter 确认）"
                aria-invalid={Boolean(jumpError)}
                className={`h-6 w-14 rounded border bg-surface px-1.5 text-center font-mono text-[11px] font-semibold tabular-nums text-ink outline-none ${
                  jumpError
                    ? 'border-danger ring-2 ring-danger/25'
                    : 'border-danger/60 focus:border-danger focus:ring-2 focus:ring-danger/20'
                }`}
              />
              <span className="font-mono text-[11px] font-semibold tabular-nums text-danger/85">
                /{totalErrors.toLocaleString()}
              </span>
            </div>
          ) : (
            <Tooltip text="点击输入序号跳转到指定错误（基于当前筛选结果）">
              <button
                type="button"
                onClick={openJumpInput}
                aria-label={`当前错误 ${counterLabel}，点击按序号跳转`}
                className="flex h-6 items-center gap-1.5 rounded px-1.5 font-mono text-[11px] font-semibold tabular-nums transition-colors hover:bg-danger/15"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 fill-danger/15" />
                <span>{counterLabel} 错误</span>
              </button>
            </Tooltip>
          )}
          <span className="h-4 w-px bg-danger/30" aria-hidden="true" />
          <Tooltip text="上一条错误或失败行" kbd="Shift+F2">
            <button
              type="button"
              onClick={() => {
                if (editing) cancelJumpInput();
                onPrevError();
              }}
              aria-label="上一条错误"
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-danger/15"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip text="下一条错误或失败行" kbd="F2">
            <button
              type="button"
              onClick={() => {
                if (editing) cancelJumpInput();
                onNextError();
              }}
              aria-label="下一条错误"
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-danger/15"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </>
      ) : (
        <div className="flex h-6 items-center gap-1.5 px-1.5 text-[11px]">
          <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
          <span>无错误</span>
        </div>
      )}
    </nav>
  );
};
