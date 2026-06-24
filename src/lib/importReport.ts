import type { ImportFinding, ImportFindingKind, ImportReport } from './zplParser';
import { ZPL_COMMAND_MAP } from './zplCommandSupport';

// Re-export the parser-side domain types so UI code talks to the report
// surface through this module exclusively instead of reaching into the
// parser for type imports.
export type { ImportFinding, ImportFindingKind, ImportReport };

export interface ImportResult {
  objectCount: number;
  report: ImportReport;
}

/** Returns the loss description for a partial command code, e.g. "^A@" → font face note. */
function partialLoss(cmd: string): string {
  const key = cmd.slice(1);
  const entry = ZPL_COMMAND_MAP.get(key) ?? (key[0] === 'A' ? ZPL_COMMAND_MAP.get('A@') : undefined);
  return entry?.loss ?? 'imported with limitations';
}

/**
 * Single source of truth for finding wording. Both the UI list and the
 * copy-as-text formatter feed off this so the user sees the same
 * description in both surfaces; without it, the two pathways drift
 * whenever someone tweaks a string in one place.
 *
 * `title` is the headline (kind + command code where useful);
 * `detail` is the secondary line (loss description for partial, raw
 * token for the others).
 */
export function describeFinding(f: ImportFinding): { title: string; detail: string } {
  if (f.kind === 'partial') {
    return {
      title: `Partially imported (${f.command})`,
      detail: partialLoss(f.command),
    };
  }
  if (f.kind === 'browserLimit') {
    return {
      title: 'Skipped: needs printer hardware',
      detail: f.command,
    };
  }
  if (f.kind === 'replayRisk') {
    return {
      title: 'Printer setup command: runs on the printer when exported/printed',
      detail: f.command,
    };
  }
  return {
    title: 'Skipped: command not recognised',
    detail: f.command,
  };
}

/** Compact "Page N: " prefix when a finding originates from a multi-page
 *  import. Single-page reports omit it to stay terse. */
function pagePrefix(f: ImportFinding, multiPage: boolean): string {
  return multiPage ? `Page ${f.pageIndex + 1}: ` : '';
}

export function formatReportAsText(result: ImportResult): string {
  const { objectCount, report } = result;
  const findings = report.findings;
  const multiPage = findings.some((f) => f.pageIndex > 0);

  const lines: string[] = [
    `ZPL Import Report`,
    `Objects imported: ${objectCount}`,
    '',
  ];

  if (findings.length === 0) {
    lines.push('All commands recognised. No design information was lost.');
    return lines.join('\n');
  }

  // One row per finding (per page-occurrence). Matches the UI list so the
  // copied text mirrors what the user sees in the modal.
  for (const f of findings) {
    const { title, detail } = describeFinding(f);
    lines.push(`${pagePrefix(f, multiPage)}${title}: ${detail}`);
  }
  return lines.join('\n');
}
