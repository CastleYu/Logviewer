import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MenuLayerConst, TooltipConst, UiShortcutKey } from '../config/uiConstants';

export interface TooltipProps {
  /** 提示主文案 */
  text: string;
  /** 可选结构化内容（替换纯文本） */
  content?: ReactNode;
  /** 右侧快捷键角标 */
  kbd?: string;
  /** 禁用提示显示 */
  disabled?: boolean;
  /** 包裹容器附加 class */
  className?: string;
  children: ReactNode;
}

/**
 * 统一悬浮提示组件（G-1）：400ms 延迟显现、自动避让视口边缘、Portal 置顶展示。
 */
export function Tooltip({ text, content, kbd, disabled = false, className = 'inline-flex', children }: TooltipProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false });
  const timerRef = useRef<number | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (!disabled) return;
    clearTimer();
    setAnchor(null);
  }, [disabled]);

  const scheduleShow = (node: HTMLElement) => {
    if (disabled || (!text && !content)) return;
    clearTimer();
    const rect = node.getBoundingClientRect();
    timerRef.current = window.setTimeout(() => {
      setPos({ left: rect.left + rect.width / 2, top: rect.bottom + TooltipConst.GapPx, ready: false });
      setAnchor(rect);
    }, TooltipConst.HoverDelayMs);
  };

  const hide = () => {
    clearTimer();
    setAnchor(null);
  };

  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) return;
    const tipRect = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = TooltipConst.PaddingPx;

    let left = anchor.left + anchor.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, vw - tipRect.width - pad));

    let top = anchor.bottom + TooltipConst.GapPx;
    if (top + tipRect.height > vh - pad && anchor.top - TooltipConst.GapPx - tipRect.height >= pad) {
      top = anchor.top - TooltipConst.GapPx - tipRect.height;
    } else {
      top = Math.min(top, vh - tipRect.height - pad);
    }

    setPos({ left, top, ready: true });
  }, [anchor, text, kbd, content]);

  const visible = Boolean(anchor && !disabled && (text || content));

  return (
    <span
      className={className}
      aria-describedby={visible ? id : undefined}
      onMouseEnter={(event) => scheduleShow(event.currentTarget)}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={(event) => scheduleShow(event.currentTarget)}
      onBlur={hide}
    >
      {children}
      {visible
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              id={id}
              style={{
                left: pos.left,
                top: pos.top,
                zIndex: TooltipConst.ZIndex,
                maxWidth: TooltipConst.MaxWidthPx,
                visibility: pos.ready ? 'visible' : 'hidden',
              }}
              className="pointer-events-none fixed inline-flex items-center gap-2 rounded-[6px] border border-line bg-surface px-2 py-1 text-[11px] leading-snug text-ink shadow-[var(--shadow-window)]"
            >
              {content ? <span className="min-w-0">{content}</span> : <span className="whitespace-pre-line">{text}</span>}
              {kbd ? <kbd className="lv-kbd shrink-0">{kbd}</kbd> : null}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/**
 * Portal 下拉菜单容器（H10）：自动视口避让并渲染在最高浮层。
 */
export function Menu({
  open,
  anchor,
  onClose,
  children,
  label,
  align = 'left',
  className = '',
}: {
  open: boolean;
  anchor: DOMRect | null;
  onClose: () => void;
  children: ReactNode;
  label: string;
  align?: 'left' | 'right';
  className?: string;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false });

  useEffect(() => {
    if (!open || !anchor) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-menu]')) return;
      const inAnchor =
        event.clientX >= anchor.left &&
        event.clientX <= anchor.right &&
        event.clientY >= anchor.top &&
        event.clientY <= anchor.bottom;
      if (inAnchor) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === UiShortcutKey.Escape) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, anchor, onClose]);

  useLayoutEffect(() => {
    if (!open || !anchor || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = MenuLayerConst.ViewportMarginPx;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const rawLeft = align === 'right' ? anchor.right - rect.width : anchor.left;
    const left = Math.max(pad, Math.min(rawLeft, vw - rect.width - pad));

    let top = anchor.bottom + MenuLayerConst.GapPx;
    if (top + rect.height > vh - pad && anchor.top - MenuLayerConst.GapPx - rect.height >= pad) {
      top = anchor.top - MenuLayerConst.GapPx - rect.height;
    } else {
      top = Math.min(top, Math.max(pad, vh - rect.height - pad));
    }

    setCoords({ left, top, ready: true });
  }, [open, anchor, align]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-menu
      role="menu"
      aria-label={label}
      style={{
        top: coords.top,
        left: coords.left,
        zIndex: MenuLayerConst.ZIndex,
        visibility: coords.ready ? 'visible' : 'hidden',
      }}
      className={`fixed max-h-[min(24rem,calc(100vh-16px))] min-w-44 overflow-auto rounded-lg border border-line bg-surface p-1 text-ink shadow-[var(--shadow-window)] ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

export function menuItem(active = false): string {
  return `flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-raised ${active ? 'bg-accent-soft text-accent-ink font-medium' : 'text-ink'}`;
}
