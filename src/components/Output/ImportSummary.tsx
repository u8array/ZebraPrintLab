import { describeFinding } from '../../lib/importReport';
import type { ImportFinding, ImportFindingKind, ImportResult } from '../../lib/importReport';

export type { ImportResult };

/** Severity colour per finding kind. Tailwind classes only. The table
 *  form over a switch keeps the kind→tone mapping in one expression
 *  and lets the compiler check exhaustiveness via the Record type. */
const TONE: Record<ImportFindingKind, string> = {
  partial: 'text-amber-400',
  browserLimit: 'text-amber-400',
  unknown: 'text-muted',
};

function FindingRow({ finding, showPage }: { finding: ImportFinding; showPage: boolean }) {
  const { title, detail } = describeFinding(finding);
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      {showPage && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted shrink-0 mt-0.5">
          Page&nbsp;{finding.pageIndex + 1}
        </span>
      )}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className={`font-mono text-[10px] font-semibold ${TONE[finding.kind]}`}>
          {title}
        </span>
        <span className="font-mono text-[10px] text-muted truncate">
          {detail}
        </span>
      </div>
    </div>
  );
}

export function ImportSummaryBody({ result }: { result: ImportResult }) {
  const { objectCount, report } = result;
  const { findings } = report;
  // Only show per-row page badges when the import actually spanned multiple
  // pages. Single-page reports don't need the badge clutter.
  const multiPage = findings.some((f) => f.pageIndex > 0);

  return (
    <div className="flex flex-col gap-3 p-4 flex-1 min-h-0 overflow-y-auto">
      <p className="font-mono text-[10px] text-amber-400 leading-relaxed">
        Imported {objectCount} object{objectCount !== 1 ? 's' : ''} with{' '}
        {findings.length} issue{findings.length !== 1 ? 's' : ''}:
      </p>
      <div className="flex flex-col">
        {findings.map((f, i) => (
          <FindingRow
            key={`${f.pageIndex}-${f.kind}-${f.command}-${i}`}
            finding={f}
            showPage={multiPage}
          />
        ))}
      </div>
    </div>
  );
}
