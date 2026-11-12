import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [box, setBox] = useState<{ x: number; y: number } | null>(null);
  const id = useId();
  const show = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    setBox({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
  };
  return <span className="inline-flex" onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={() => setBox(null)} onFocus={(event) => show(event.currentTarget)} onBlur={() => setBox(null)}>
    {children}
    {box ? createPortal(<span role="tooltip" id={id} style={{ left: box.x, top: box.y }} className="pointer-events-none fixed z-[200] max-w-xs -translate-x-1/2 rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-ink shadow-pop">{text}</span>, document.body) : null}
  </span>;
}

export function Menu({ open, anchor, onClose, children, label }: { open: boolean; anchor: DOMRect | null; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('[data-menu]')) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [open, onClose]);
  if (!open || !anchor) return null;
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 280);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 260));
  return createPortal(<div data-menu role="menu" aria-label={label} style={{ top, left }} className="fixed z-[200] max-h-72 min-w-44 overflow-auto rounded-lg border border-line bg-surface p-1 text-ink shadow-pop">{children}</div>, document.body);
}

export function menuItem(active = false): string {
  return `block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-raised ${active ? 'bg-accent-soft text-accent-ink' : 'text-ink'}`;
}
