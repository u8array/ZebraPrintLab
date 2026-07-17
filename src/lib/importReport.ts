import type { ImportFinding, ImportFindingKind, ImportReport } from '@zplab/core/lib/zplParser';
import { ZPL_COMMAND_MAP } from './zplCommandSupport';

// Re-export the parser-side domain types so UI code talks to the report
// surface through this module exclusively instead of reaching into the
// parser for type imports.
export type { ImportFinding, ImportFindingKind, ImportReport };

export interface ImportResult {
  objectCount: number;
  report: ImportReport;
}

/** Distinct command codes of one finding kind; backs the report's bucket views. */
export function dedupCommandsByKind(
  findings: readonly ImportFinding[],
  kind: ImportFindingKind,
): string[] {
  return [...new Set(findings.filter((f) => f.kind === kind).map((f) => f.command))];
}

/** Routable setup-script findings; drives the import routing prompt. */
export function replayRiskFindings(report: ImportReport): ImportFinding[] {
  return report.findings.filter((f) => f.kind === 'replayRisk');
}

/** Routable setup commands plus non-routable device actions, for the prompt list. */
export function printerCommandFindings(report: ImportReport): ImportFinding[] {
  return report.findings.filter((f) => f.kind === 'replayRisk' || f.kind === 'deviceAction');
}

/** Report after routing setup commands out of the label: replayRisk resolved,
 *  overlay-dependent findings on routed pages moot, findings on dropped pages
 *  removed and survivors remapped to `keptPageIndexes` order. */
export function resolveRoutedReport(
  report: ImportReport,
  keptPageIndexes: readonly number[],
): ImportReport {
  const riskPages = new Set(replayRiskFindings(report).map((f) => f.pageIndex));
  const newIndexOf = new Map(keptPageIndexes.map((orig, i) => [orig, i]));
  const findings = report.findings.flatMap((f) => {
    if (f.kind === 'replayRisk') return [];
    if ((f.kind === 'lossyEdit' || f.kind === 'deviceAction') && riskPages.has(f.pageIndex)) {
      return [];
    }
    const newIndex = newIndexOf.get(f.pageIndex);
    return newIndex === undefined ? [] : [{ ...f, pageIndex: newIndex }];
  });
  return {
    findings,
    partial: dedupCommandsByKind(findings, 'partial'),
    browserLimit: dedupCommandsByKind(findings, 'browserLimit'),
    unknown: dedupCommandsByKind(findings, 'unknown'),
    replayRisk: dedupCommandsByKind(findings, 'replayRisk'),
    deviceAction: dedupCommandsByKind(findings, 'deviceAction'),
  };
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
  if (f.kind === 'deviceAction') {
    return {
      title: 'Printer device action: runs on the printer when exported/printed',
      detail: f.command,
    };
  }
  if (f.kind === 'lossyEdit') {
    return {
      title: 'First edit re-emits the whole label (not byte-exact)',
      detail: f.command,
    };
  }
  if (f.kind === 'fnRenumbered') {
    return {
      title: 'Shared ^FN slot with a different default: field moved to a free slot',
      detail: f.command,
    };
  }
  if (f.kind === 'fnDefaultDropped') {
    return {
      title: "All ^FN slots taken: this field keeps the first page's default",
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
