import { ThemeMode } from '../types';

export interface ColorPreset {
  id: string;
  name: string;
  bgDot: string;
  lightClass: string;
  darkClass: string;
  borderClass: string;
  legacyLightClass: string;
  legacyDarkClass: string;
}

export const HIGHLIGHT_COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'purple',
    name: '紫色',
    bgDot: 'bg-purple-500',
    lightClass: 'bg-purple-200/90 text-purple-950 rounded-[2px]',
    darkClass: 'bg-purple-500/40 text-purple-100 rounded-[2px]',
    borderClass: 'border-purple-500',
    legacyLightClass: 'bg-purple-100 text-purple-900 border border-purple-300 font-semibold px-0.5 rounded shadow-2xs',
    legacyDarkClass: 'bg-purple-950/80 text-purple-200 border border-purple-500/60 font-semibold px-0.5 rounded shadow-2xs',
  },
  {
    id: 'amber',
    name: '琥珀黄',
    bgDot: 'bg-amber-500',
    lightClass: 'bg-amber-200/90 text-amber-950 rounded-[2px]',
    darkClass: 'bg-amber-500/40 text-amber-100 rounded-[2px]',
    borderClass: 'border-amber-500',
    legacyLightClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold px-0.5 rounded shadow-2xs',
    legacyDarkClass: 'bg-amber-950/80 text-amber-200 border border-amber-500/60 font-semibold px-0.5 rounded shadow-2xs',
  },
  {
    id: 'emerald',
    name: '翠绿',
    bgDot: 'bg-emerald-500',
    lightClass: 'bg-emerald-200/90 text-emerald-950 rounded-[2px]',
    darkClass: 'bg-emerald-500/40 text-emerald-100 rounded-[2px]',
    borderClass: 'border-emerald-500',
    legacyLightClass: 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold px-0.5 rounded shadow-2xs',
    legacyDarkClass: 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/60 font-semibold px-0.5 rounded shadow-2xs',
  },
  {
    id: 'cyan',
    name: '青蓝',
    bgDot: 'bg-cyan-500',
    lightClass: 'bg-cyan-200/90 text-cyan-950 rounded-[2px]',
    darkClass: 'bg-cyan-500/40 text-cyan-100 rounded-[2px]',
    borderClass: 'border-cyan-500',
    legacyLightClass: 'bg-cyan-100 text-cyan-900 border border-cyan-300 font-semibold px-0.5 rounded shadow-2xs',
    legacyDarkClass: 'bg-cyan-950/80 text-cyan-200 border border-cyan-500/60 font-semibold px-0.5 rounded shadow-2xs',
  },
  {
    id: 'rose',
    name: '玫瑰红',
    bgDot: 'bg-rose-500',
    lightClass: 'bg-rose-200/90 text-rose-950 rounded-[2px]',
    darkClass: 'bg-rose-500/40 text-rose-100 rounded-[2px]',
    borderClass: 'border-rose-500',
    legacyLightClass: 'bg-rose-100 text-rose-900 border border-rose-300 font-semibold px-0.5 rounded shadow-2xs',
    legacyDarkClass: 'bg-rose-950/80 text-rose-200 border border-rose-500/60 font-semibold px-0.5 rounded shadow-2xs',
  },
  {
    id: 'indigo',
    name: '靛蓝',
    bgDot: 'bg-indigo-500',
    lightClass: 'bg-indigo-200/90 text-indigo-950 rounded-[2px]',
    darkClass: 'bg-indigo-500/40 text-indigo-100 rounded-[2px]',
    borderClass: 'border-indigo-500',
    legacyLightClass: 'bg-indigo-100 text-indigo-900 border border-indigo-300 font-semibold px-0.5 rounded shadow-2xs',
    legacyDarkClass: 'bg-indigo-950/80 text-indigo-200 border border-indigo-500/60 font-semibold px-0.5 rounded shadow-2xs',
  },
];

export function getHighlightColorStyle(
  colorId: string | undefined,
  theme: ThemeMode = 'dark',
  legacyStyle: boolean = false
): string {
  const preset = HIGHLIGHT_COLOR_PRESETS.find((p) => p.id === colorId) || HIGHLIGHT_COLOR_PRESETS[0];
  if (legacyStyle) {
    return theme === 'light' ? preset.legacyLightClass : preset.legacyDarkClass;
  }
  return theme === 'light' ? preset.lightClass : preset.darkClass;
}
