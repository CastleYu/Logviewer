import {
  CopyActionConfig,
  CopyBuildResult,
  CopyMissingPolicy,
  CopyPartKind,
  CopyPlacement,
  LogFormatConfig,
  RuntimeCopyAction,
} from '../config/logFormatTypes';
import { LogEntry } from '../types';

export function copyPlacements(fieldPlacements?: CopyPlacement[], legacy: boolean = false): CopyPlacement[] {
  if (fieldPlacements && fieldPlacements.length > 0) return fieldPlacements;
  return legacy ? [CopyPlacement.Cell] : [CopyPlacement.Cell, CopyPlacement.Header, CopyPlacement.ContextMenu];
}

export function createFieldCopyAction(fieldId: string, label: string, placements: CopyPlacement[], legacy: boolean = false): RuntimeCopyAction {
  return {
    id: legacy ? `legacy-field-${fieldId}` : `field-${fieldId}`,
    label,
    anchorField: fieldId,
    placements,
    parts: [{ kind: CopyPartKind.Field, field: fieldId }],
    sourceField: fieldId,
  };
}

export function copyActions(format: LogFormatConfig): RuntimeCopyAction[] {
  const actions: RuntimeCopyAction[] = [];
  for (const field of format.fields) {
    if (field.copy?.enabled) {
      actions.push(createFieldCopyAction(field.id, field.copy.label || `复制${field.label}`, copyPlacements(field.copy.placements)));
    } else if (field.display?.copyable) {
      actions.push(createFieldCopyAction(field.id, `复制${field.label}`, copyPlacements(undefined, true), true));
    }
  }
  actions.push(...(format.copyActions || []));
  return actions;
}

export function copyActionsAt(actions: RuntimeCopyAction[], placement: CopyPlacement, anchorField?: string): RuntimeCopyAction[] {
  return actions.filter((action) => action.placements.includes(placement) && (!anchorField || action.anchorField === anchorField));
}

export function copyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function buildCopyRow(action: CopyActionConfig, log: LogEntry): { text: string; missing: boolean } {
  let missing = false;
  const text = action.parts.map((part) => {
    if (part.kind === CopyPartKind.Literal) return part.value;
    const value = log.success ? log.fields?.[part.field] : undefined;
    if (value === null || value === undefined) missing = true;
    return copyValue(value);
  }).join('');
  return { text, missing };
}

export function buildCopyText(action: CopyActionConfig, logs: LogEntry[]): CopyBuildResult {
  const policy = action.rows?.missing || CopyMissingPolicy.Empty;
  const rows: string[] = [];
  let missingCount = 0;
  for (const log of logs) {
    const row = buildCopyRow(action, log);
    if (row.missing) {
      missingCount += 1;
      if (policy === CopyMissingPolicy.Disable) {
        return { ok: false, text: '', rowCount: 0, missingCount, error: `${action.label}包含缺失字段，请调整配置或选择其他日志` };
      }
      if (policy === CopyMissingPolicy.SkipRow) continue;
    }
    rows.push(row.text);
  }
  if (rows.length === 0) return { ok: false, text: '', rowCount: 0, missingCount, error: `${action.label}没有可复制的数据` };
  return { ok: true, text: rows.join(action.rows?.separator ?? '\n'), rowCount: rows.length, missingCount };
}
