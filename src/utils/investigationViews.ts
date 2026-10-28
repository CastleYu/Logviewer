import type {
  BorderIntensity, ColumnVisibility, ColumnWidths, DisplayDensity, FilterOptions,
} from '../types';

export const INVESTIGATION_VIEWS_STORAGE_KEY = 'LOGVIEWER_INVESTIGATION_VIEWS';

export interface InvestigationViewDisplay {
  density: DisplayDensity;
  columnVisibility: ColumnVisibility;
  columnWidths: ColumnWidths;
  configuredColumnWidths: Record<string, number>;
  borderIntensity: BorderIntensity;
  legacyBoldSelection: boolean;
  legacyHighlightStyle: boolean;
}

export interface InvestigationView {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  sourceName: string;
  formatId: string;
  filter: FilterOptions;
  display: InvestigationViewDisplay;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseInvestigationViews(serialized: string | null): InvestigationView[] {
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is InvestigationView => isRecord(item)
      && item.version === 1
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.createdAt === 'number'
      && typeof item.sourceName === 'string'
      && typeof item.formatId === 'string'
      && isRecord(item.filter)
      && typeof item.filter.searchKeyword === 'string'
      && isRecord(item.filter.configuredFilters)
      && isRecord(item.display)
      && isRecord(item.display.columnVisibility)
      && isRecord(item.display.columnWidths)
      && isRecord(item.display.configuredColumnWidths)).slice(0, 50);
  } catch {
    return [];
  }
}

export function loadInvestigationViews(): InvestigationView[] {
  try {
    return parseInvestigationViews(localStorage.getItem(INVESTIGATION_VIEWS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function storeInvestigationViews(views: InvestigationView[]): void {
  localStorage.setItem(INVESTIGATION_VIEWS_STORAGE_KEY, JSON.stringify(views));
}

export function restoreInvestigationFilter(saved: FilterOptions, defaults: FilterOptions): FilterOptions {
  return {
    ...defaults,
    ...saved,
    pinnedHighlights: saved.pinnedHighlights || [],
    configuredFilters: { ...defaults.configuredFilters, ...saved.configuredFilters },
  };
}
