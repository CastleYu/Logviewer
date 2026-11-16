import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { SourceOpener } from '../config/sourceTypes';
import { majorityOpener } from '../utils/openerMatch';
import { useSource } from './SourceNavigation';
import { Menu, Tooltip } from './Tooltip';

function shortName(opener: SourceOpener | null, fallback: string): string {
  if (!opener) return fallback;
  return opener.name || opener.exe.split(/[/\\]/).pop() || fallback;
}

/** 源码打开程序选择器（H5 / H10）：支持按当前日志匹配或临时覆盖 */
export function SourceOpenerSwitch({ files }: { files: string[]; light?: boolean }) {
  const source = useSource();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const auto = majorityOpener(files, source.openers);
  const current = (source.overrideId && source.openers.find((item) => item.id === source.overrideId)) || auto;
  const label = source.overrideId ? shortName(current, '临时指定') : shortName(auto, files.length ? '无匹配' : '自动');
  const open = Boolean(anchor);

  const toggle = () => {
    setAnchor((prev) => (prev ? null : btnRef.current?.getBoundingClientRect() || null));
  };

  return (
    <>
      <Tooltip text={current?.exe ? `打开程序：${current.exe}` : '根据当前日志中的源文件匹配打开程序，可临时指定'}>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="当前打开程序"
          onClick={toggle}
          className="lv-btn h-7 max-w-[168px] shrink-0 px-2"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-[9px] font-bold text-accent-ink">
            {(current?.name || 'A').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-ink-3" />
        </button>
      </Tooltip>
      <Menu open={open} anchor={anchor} onClose={() => setAnchor(null)} label="选择打开程序" className="w-64">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!source.overrideId}
          onClick={() => {
            source.setOverrideId(null);
            setAnchor(null);
          }}
          className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-raised ${!source.overrideId ? 'bg-accent-soft text-accent-ink' : 'text-ink'}`}
        >
          <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${!source.overrideId ? 'opacity-100' : 'opacity-0'}`} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">自动</span>
            <span className="text-[11px] text-ink-3">
              {auto ? `当前日志倾向 ${shortName(auto, '')}` : '按后缀/正则匹配'}
            </span>
          </span>
        </button>
        {source.openers.map((item) => {
          const active = source.overrideId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              disabled={!item.exe}
              onClick={() => {
                source.setOverrideId(item.id);
                setAnchor(null);
              }}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-raised disabled:opacity-40 ${active ? 'bg-accent-soft text-accent-ink' : 'text-ink'}`}
            >
              <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{shortName(item, item.id)}</span>
                <span className="truncate font-mono text-[10px] text-ink-3">
                  {item.pattern || '未设置后缀'}
                  {item.exe ? '' : ' · 未配置程序'}
                </span>
              </span>
            </button>
          );
        })}
        {source.openers.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-ink-3">请先在源码索引中添加打开程序</p>
        ) : null}
      </Menu>
    </>
  );
}
