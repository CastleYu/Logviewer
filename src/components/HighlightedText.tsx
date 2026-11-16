import React from 'react';
import { ThemeMode, PinnedHighlight } from '../types';
import { getHighlightColorStyle } from '../utils/highlightColors';

interface HighlightedTextProps {
  text: string;
  highlight?: string;
  matchCase?: boolean;
  isRegex?: boolean;
  pinnedHighlights?: PinnedHighlight[];
  searchHighlight?: string;
  searchMatchCase?: boolean;
  searchIsRegex?: boolean;
  theme?: ThemeMode;
  className?: string;
  legacyHighlightStyle?: boolean;
}

interface MatchRange {
  start: number;
  end: number;
  type: 'search' | 'highlight' | 'pinned';
  colorId?: string;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  highlight,
  matchCase = false,
  isRegex = false,
  pinnedHighlights = [],
  searchHighlight,
  searchMatchCase = false,
  searchIsRegex = false,
  theme = 'dark',
  className = '',
  legacyHighlightStyle = false,
}) => {
  if (!text) return null;

  const hQuery = highlight?.trim();
  const sQuery = searchHighlight?.trim();
  const activePins = pinnedHighlights.filter((p) => !p.hidden && p.keyword.trim().length > 0);

  if (!hQuery && !sQuery && activePins.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const ranges: MatchRange[] = [];

  const collectRanges = (
    query: string,
    queryIsRegex: boolean,
    queryMatchCase: boolean,
    type: 'search' | 'highlight' | 'pinned',
    colorId?: string
  ) => {
    let regex: RegExp | null = null;
    try {
      const pattern = queryIsRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(pattern, queryMatchCase ? 'g' : 'gi');
    } catch {
      return;
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchLength = match[0].length;
      if (matchLength === 0) {
        regex.lastIndex++;
        if (regex.lastIndex > text.length) break;
        continue;
      }
      ranges.push({
        start: matchStart,
        end: matchStart + matchLength,
        type,
        colorId,
      });
    }
  };

  if (sQuery) collectRanges(sQuery, searchIsRegex, searchMatchCase, 'search');
  if (hQuery) collectRanges(hQuery, isRegex, matchCase, 'highlight', 'emerald');
  for (const pin of activePins) {
    collectRanges(
      pin.keyword.trim(),
      pin.isRegex ?? false,
      pin.matchCase ?? false,
      'pinned',
      pin.color || 'emerald'
    );
  }

  if (ranges.length === 0) {
    return <span className={className}>{text}</span>;
  }

  ranges.sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  const isLight = theme === 'light';

  for (const r of ranges) {
    if (r.start < lastIndex) continue;
    if (r.start > lastIndex) {
      parts.push(text.substring(lastIndex, r.start));
    }

    let styleClass = '';
    if (r.type === 'search') {
      if (legacyHighlightStyle) {
        styleClass = isLight
          ? 'bg-[#c8f0d8] text-[#0f6b43] font-semibold px-0.5 rounded border border-[#138a5a]/50 shadow-2xs'
          : 'bg-emerald-500/45 text-emerald-100 font-semibold px-0.5 rounded border border-emerald-400/60 shadow-2xs';
      } else {
        styleClass = isLight
          ? 'bg-[#c8f0d8] text-[#0f6b43] rounded-[2px]'
          : 'bg-emerald-500/40 text-emerald-100 rounded-[2px]';
      }
    } else {
      styleClass = getHighlightColorStyle(r.colorId, theme as ThemeMode, legacyHighlightStyle);
    }

    parts.push(
      <mark
        key={key++}
        className={
          legacyHighlightStyle
            ? `${styleClass} inline`
            : `${styleClass} p-0 m-0 border-0 font-normal inline`
        }
      >
        {text.substring(r.start, r.end)}
      </mark>
    );

    lastIndex = r.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span className={className}>{parts}</span>;
};
