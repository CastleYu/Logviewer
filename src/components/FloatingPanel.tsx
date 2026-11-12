import React, { useEffect, useRef, useState } from 'react';
import { GripHorizontal, Minus, X } from 'lucide-react';
import { ThemeMode } from '../types';

export interface FloatingPanelProps {
  theme: ThemeMode;
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  height?: number;
  className?: string;
  extra?: React.ReactNode;
  minimized?: boolean;
  onMinimize?: () => void;
  fill?: boolean;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({ theme, title, open, onClose, children, width = 520, height = 520, className = '', extra, minimized = false, onMinimize, fill = false }) => {
  const light = theme === 'light';
  const [size, setSize] = useState({ width, height });
  const [position, setPosition] = useState({ x: 32, y: 72 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => { if (open) setSize((current) => ({ width: Math.max(current.width, width), height: Math.max(current.height, height) })); }, [height, open, width]);
  if (!open) return null;
  return <section role="dialog" aria-modal="false" aria-label={title} style={{ left: `min(${position.x}px, max(8px, calc(100vw - ${size.width + 8}px)))`, top: `min(${position.y}px, max(8px, calc(100vh - ${minimized ? 48 : size.height + 8}px)))`, width: `min(${size.width}px,calc(100vw - 16px))`, height: minimized ? 'auto' : `min(${size.height}px,calc(100vh - 16px))` }} className={`fixed z-[90] flex flex-col overflow-hidden rounded-xl border shadow-2xl ${light ? 'border-slate-200 bg-white text-slate-900' : 'border-line bg-surface text-ink'} ${className}`}>
    <header onPointerDown={(event) => { if (event.button !== 0 || (event.target as HTMLElement).closest('button,a,[role="menu"]')) return; drag.current = { dx: event.clientX - position.x, dy: event.clientY - position.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current) setPosition({ x: Math.max(8, Math.min(window.innerWidth - 220, event.clientX - drag.current.dx)), y: Math.max(8, Math.min(window.innerHeight - 56, event.clientY - drag.current.dy)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} className={`flex shrink-0 cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing ${light ? 'border-slate-200 bg-slate-50' : 'border-line bg-canvas'}`}>
      <GripHorizontal className="h-4 w-4 shrink-0 text-ink-3" /><h2 className="min-w-0 flex-1 truncate text-xs font-bold">{title}</h2>
      {extra}
      {onMinimize ? <button type="button" onClick={onMinimize} aria-label={minimized ? `还原${title}` : `最小化${title}`} className="rounded p-1 hover:bg-slate-200/70 dark:hover:bg-raised"><Minus className="h-3.5 w-3.5" /></button> : null}
      <button type="button" onClick={onClose} aria-label={`关闭${title}`} className="rounded p-1 hover:bg-slate-200/70 dark:hover:bg-raised"><X className="h-3.5 w-3.5" /></button>
    </header>
    {minimized ? null : <div className={fill ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto'}>{children}</div>}
    {minimized ? null : <span aria-hidden="true" onPointerDown={(event) => { resize.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const start = resize.current; if (start) setSize({ width: Math.max(360, start.width + event.clientX - start.x), height: Math.max(280, start.height + event.clientY - start.y) }); }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" />}
  </section>;
};

export default FloatingPanel;
