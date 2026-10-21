import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { pathCrumbs } from '../utils/browsePath';

interface RemotePathBarProps {
  path: string;
  disabled?: boolean;
  onGo: (input: string) => void;
}

/**
 * 面包屑 + 可编辑路径。点击空白处进入编辑（可粘贴完整路径、相对路径、~、文件路径），
 * 路径过长时折叠中间层级到 “…” 菜单，始终保留根目录与最后两级。
 */
export const RemotePathBar: React.FC<RemotePathBarProps> = ({ path, disabled, onGo }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);
  const [hidden, setHidden] = useState(0);
  const [menu, setMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const crumbs = pathCrumbs(path, []);

  useEffect(() => { if (!editing) setDraft(path); }, [path, editing]);
  useEffect(() => { setHidden(0); setMenu(false); }, [path]);
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  // 逐步折叠中间层级直到不溢出；保留根和最后两级
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || editing) return;
    if (row.scrollWidth > row.clientWidth + 1 && hidden < Math.max(0, crumbs.length - 3)) setHidden((value) => value + 1);
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== path) onGo(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="远程路径"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(path); setEditing(false); }
        }}
        placeholder="/var/log、logs、~、或完整文件路径"
        className="lv-input h-[30px] min-w-0 flex-1 font-mono"
      />
    );
  }

  const visible = hidden > 0 ? [crumbs[0], ...crumbs.slice(1 + hidden)] : crumbs;
  const folded = hidden > 0 ? crumbs.slice(1, 1 + hidden) : [];
  const label = (item: string) => (item === '/' ? '/' : item.slice(item.lastIndexOf('/') + 1));

  return (
    <div
      className="relative flex h-[30px] min-w-0 flex-1 items-center rounded-[var(--radius-ctl)] border border-line bg-surface pl-1 pr-1 hover:border-line-strong"
      onClick={(event) => { if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.fill) setEditing(true); }}
      title="点击空白处编辑路径"
    >
      <div ref={rowRef} className="flex min-w-0 flex-1 items-center overflow-hidden font-mono text-[12px]" data-fill="1">
        {visible.map((item, index) => (
          <React.Fragment key={item}>
            {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-ink-3" /> : null}
            {index === 1 && folded.length > 0 ? (
              <>
                <button
                  type="button"
                  aria-label="显示折叠的上级目录"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); setMenu((value) => !value); }}
                  className="lv-icon-btn h-6 w-6 shrink-0"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="h-3 w-3 shrink-0 text-ink-3" />
              </>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => { event.stopPropagation(); onGo(item); }}
              title={item}
              className={`shrink-0 truncate rounded px-1.5 py-0.5 hover:bg-sunken ${index === visible.length - 1 ? 'max-w-[40ch] font-semibold text-ink' : 'max-w-[20ch] text-ink-2'}`}
            >
              {label(item)}
            </button>
          </React.Fragment>
        ))}
        <span className="h-full min-w-6 flex-1 cursor-text" data-fill="1" />
      </div>
      {menu ? (
        <div role="menu" className="lv-menu absolute left-6 top-full z-[95] mt-1 max-h-72 w-72 overflow-auto" onPointerDown={(event) => event.stopPropagation()}>
          {folded.map((item) => (
            <button key={item} type="button" role="menuitem" onClick={() => { setMenu(false); onGo(item); }} className="lv-menu-item font-mono" title={item}>
              <span className="truncate">{item}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
