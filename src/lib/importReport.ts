import type { ImportReport } from './zplParser';
import { ZPL_COMMAND_MAP } from './zplCommandSupport';

export interface ImportResult {
  objectCount: number;
  report: ImportReport;
}

/** Returns the loss description for a partial command code, e.g. "^A@" → font face note. */
export function partialLoss(cmd: string): string {
  const key = cmd.slice(1);
  const entry = ZPL_COMMAND_MAP.get(key) ?? (key[0] === 'A' ? ZPL_COMMAND_MAP.get('A@') : undefined);
  return entry?.loss ?? 'imported with limitations';
}

export function formatReportAsText(result: ImportResult): string {
  const { objectCount, report } = result;
  const lines: string[] = [
    `ZPL Import Report`,
    `Objects imported: ${objectCount}`,
    '',
  ];
  if (report.partial.length > 0) {
    const uniqueLosses = [...new Set(report.partial.map(partialLoss))];
    lines.push(`Partially imported (${report.partial.join(', ')}): ${uniqueLosses.join('; ')}`);
  }
  if (report.browserLimit.length > 0) {
    lines.push(`Skipped (printer-only): ${report.browserLimit.map((t) => t.split(',')[0]).join(', ')}`);
  }
  if (report.unknown.length > 0) {
    lines.push(`Skipped (unrecognised): ${report.unknown.map((t) => t.split(',')[0]).join(', ')}`);
  }
  if (report.partial.length === 0 && report.browserLimit.length === 0 && report.unknown.length === 0) {
    lines.push('All commands recognised — no design information was lost.');
  }
  return lines.join('\n');
}
