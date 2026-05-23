import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import {
  nextDefaultVariableName,
  nextFreeFnNumber,
  suggestCsvMapping,
  type CsvMapping,
  type CsvParseOptionsPersisted,
  type Variable,
} from '../../types/Variable';
import {
  decodeImportedText,
  getImportedText,
  parseCsvText,
} from '../../lib/csvImport';
import { DialogShell } from '../ui/DialogShell';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { inputCls } from '../Properties/styles';
import { getVariableSource } from '../../lib/variableBinding';
import { VariableSourceBadge } from './VariableSourceBadge';

/* i18n: literal strings here get locale keys at the end-of-branch sweep. */
const COPY = {
  title: 'CSV mapping',
  hint:
    'Match each Variable to a CSV column. Leave a Variable unmapped to keep using its default.',
  variableHeader: 'Variable',
  columnHeader: 'CSV column',
  ignoreOption: '(unmapped)',
  nameEmpty: 'Required',
  nameDuplicate: 'Duplicate',
  willBeCreated: 'will be created',
  removeDraftAria: 'Discard from draft',
  noVariables:
    'No variables defined yet. Add one below or in the Variables panel.',
  addVariable: 'Add variable',
  noSlotsLeft: 'All 99 ^FN slots are taken.',
  activeRowLabel: 'Preview row',
  activeRowOf: 'of',
  activeRowTooltip: 'Which row the canvas previews. Switch any time.',
  confirm: 'Apply',
  cancel: 'Cancel',
  close: 'Close',
  headerMismatchWarning:
    'CSV headers have changed since the last mapping was saved. Check CSV options below if the file structure looks off.',
  csvOptionsTitle: 'CSV options',
  delimiterLabel: 'Delimiter',
  delimiterAuto: 'Auto-detect',
  delimiterComma: 'Comma (,)',
  delimiterSemicolon: 'Semicolon (;)',
  delimiterTab: 'Tab',
  hasHeaderRow: 'First row contains headers',
  skipRowsLabel: 'Skip first N rows',
  encodingLabel: 'Text encoding',
  encodingUtf8: 'UTF-8 (default)',
  encodingWin1252: 'Windows-1252 (ANSI / Western European)',
  encodingIso88591: 'ISO-8859-1 (Latin 1)',
  encodingUtf16le: 'UTF-16 LE',
  noCsvLoaded: 'Import a CSV from the File menu first.',
  parseError: 'Could not parse with current options.',
} as const;

interface Props {
  onClose: () => void;
}

interface DraftOptions {
  /** Stored as PapaParse delimiter string. '' means auto-detect. */
  delimiter: string;
  hasHeaderRow: boolean;
  skipRows: number;
  /** TextDecoder label. 'utf-8' is the default; common alternatives
   *  cover German Excel exports (windows-1252) and legacy Latin
   *  files. The dropdown is curated; arbitrary TextDecoder labels
   *  would also work but aren't surfaced. */
  encoding: string;
}

/** Modal for editing the Variable → CSV-column mapping and the
 *  associated CSV parse options. Full draft pattern: variable list,
 *  bindings, active row and parse options are cloned on open; Apply
 *  commits the whole bundle atomically; Cancel discards everything.
 *  Live re-parse of the cached raw text drives the table whenever
 *  options change, so the user sees the effect immediately. */
export function VariableMappingModal({ onClose }: Props) {
  const variables = useLabelStore((s) => s.variables);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const setVariables = useLabelStore((s) => s.setVariables);
  const setCsvMapping = useLabelStore((s) => s.setCsvMapping);
  const setActiveRow = useLabelStore((s) => s.setActiveRow);
  const loadCsv = useLabelStore((s) => s.loadCsv);

  // Draft state, initialised once at modal-open. The init-from-prop
  // pattern is the React-blessed way to seed local state from props
  // without re-running on every render.
  const [draftVariables, setDraftVariables] = useState<Variable[]>(() => [
    ...variables,
  ]);
  // Snapshot of variable IDs that were already in the store at
  // modal-open. Used to flag "will be created" on rows that exist
  // only in the draft (added inline via the + Add variable button)
  // so the user understands they haven't committed yet.
  const [initialVariableIds] = useState<ReadonlySet<string>>(
    () => new Set(variables.map((v) => v.id)),
  );
  const [draftOptions, setDraftOptions] = useState<DraftOptions>(() => ({
    // Seed from the persisted mapping first (so a reopen reflects the
    // last Apply), then fall back to the dataset's source metadata
    // (the values active at import time), then to library defaults.
    delimiter:
      csvMapping?.parseOptions?.delimiter ??
      csvDataset?.source.delimiter ??
      '',
    hasHeaderRow: csvMapping?.parseOptions?.hasHeaderRow ?? true,
    skipRows: csvMapping?.parseOptions?.skipRows ?? 0,
    encoding:
      csvMapping?.parseOptions?.encoding ??
      csvDataset?.source.encoding ??
      'utf-8',
  }));

  // Re-decode the cached bytes whenever encoding changes. For UTF-8
  // (the default) skip the roundtrip and use the already-decoded text
  // from import time.
  const rawText = useMemo(() => {
    if (draftOptions.encoding === 'utf-8') return getImportedText();
    return decodeImportedText(draftOptions.encoding);
  }, [draftOptions.encoding]);
  const [draftRow, setDraftRow] = useState<number>(
    csvDataset?.activeRowIndex ?? 0,
  );
  const [addError, setAddError] = useState<string | null>(null);

  // Live re-parse from the (possibly re-decoded) raw text whenever
  // options change. Synchronous + memoised so option-tweaks feel
  // instant.
  const draftParse = useMemo(() => {
    if (!rawText) return null;
    return parseCsvText(rawText, {
      delimiter: draftOptions.delimiter || undefined,
      hasHeaderRow: draftOptions.hasHeaderRow,
      skipRows: draftOptions.skipRows,
      encoding: draftOptions.encoding,
      filename: csvDataset?.source.filename,
    });
  }, [rawText, draftOptions, csvDataset?.source.filename]);

  // Memoise so the useEffect deps below stay reference-stable across
  // renders that didn't change the underlying parse.
  const virtualHeaders = useMemo(
    () => (draftParse?.ok ? draftParse.value.headers : csvDataset?.headers ?? []),
    [draftParse, csvDataset?.headers],
  );
  const virtualRows = useMemo(
    () => (draftParse?.ok ? draftParse.value.rows : csvDataset?.rows ?? []),
    [draftParse, csvDataset?.rows],
  );

  // Bindings draft. Seeded from existing mapping (only entries whose
  // header still exists in the virtual parse), then auto-suggest fills
  // the rest. Re-derived when virtualHeaders change so newly-vanished
  // headers drop out and newly-appeared ones can be auto-suggested.
  const [draftBindings, setDraftBindings] = useState<Record<string, string>>(
    () => buildInitialBindings(csvMapping, draftVariables, virtualHeaders),
  );
  useEffect(() => {
    setDraftBindings((prev) => {
      const headerSet = new Set(virtualHeaders);
      const filtered: Record<string, string> = {};
      let changed = false;
      for (const [varId, header] of Object.entries(prev)) {
        if (headerSet.has(header)) filtered[varId] = header;
        else changed = true;
      }
      // Auto-suggest for variables that have no binding yet.
      const unboundVars = draftVariables.filter((v) => !(v.id in filtered));
      const usedHeaders = new Set(Object.values(filtered));
      const freeHeaders = virtualHeaders.filter((h) => !usedHeaders.has(h));
      const suggested = suggestCsvMapping(unboundVars, freeHeaders);
      const merged = { ...filtered, ...suggested };
      if (!changed && Object.keys(suggested).length === 0) return prev;
      return merged;
    });
  }, [virtualHeaders, draftVariables]);

  // Clamp active-row to virtual rows length (option-change may have
  // shrunk the dataset).
  useEffect(() => {
    if (virtualRows.length === 0) return;
    setDraftRow((r) => Math.min(r, virtualRows.length - 1));
  }, [virtualRows.length]);

  // Compute name validity per row. Empty-name is always invalid;
  // duplicate-name is invalid for every row sharing the same trimmed
  // value. Duplicates are computed against trimmed text so trailing
  // whitespace doesn't accidentally "fix" the collision. Computed
  // before the defensive early-return so the hook order is stable.
  const nameErrors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of draftVariables) {
      const t = v.name.trim();
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const errors: Record<string, string> = {};
    for (const v of draftVariables) {
      const t = v.name.trim();
      if (t === '') errors[v.id] = COPY.nameEmpty;
      else if ((counts.get(t) ?? 0) > 1) errors[v.id] = COPY.nameDuplicate;
    }
    return errors;
  }, [draftVariables]);
  const hasNameError = Object.keys(nameErrors).length > 0;

  if (!rawText || !csvDataset) {
    // Defensive: trigger paths gate on csvDataset, but if the cache is
    // empty (e.g. user reloaded the page mid-session) show a friendly
    // close-only shell.
    return (
      <DialogShell
        onClose={onClose}
        labelledBy="variable-mapping-title"
        boxClassName="bg-surface border border-border rounded-lg w-80 shadow-2xl"
      >
        <div className="p-4 font-mono text-xs text-muted">
          <p className="mb-3">{COPY.noCsvLoaded}</p>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 transition-opacity"
          >
            {COPY.close}
          </button>
        </div>
      </DialogShell>
    );
  }

  const handleChangeBinding =
    (variableId: string) => (e: ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setDraftBindings((prev) => {
        if (value === '') {
          if (!(variableId in prev)) return prev;
          const { [variableId]: _drop, ...next } = prev;
          void _drop;
          return next;
        }
        return { ...prev, [variableId]: value };
      });
    };

  const handleRemoveDraftVariable = (id: string) => {
    setDraftVariables((prev) => prev.filter((v) => v.id !== id));
    setDraftBindings((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  };

  const handleAddVariable = () => {
    // Read latest draft inside the setter so rapid clicks (or future
    // batched updaters) compute slot/name from the up-to-date list
    // instead of a stale closure. Without this, two clicks in one
    // React batch both pick `var_1` / fnNumber 1 and collide.
    let failed = false;
    setDraftVariables((prev) => {
      const fn = nextFreeFnNumber(prev.map((v) => v.fnNumber));
      if (fn === null) {
        failed = true;
        return prev;
      }
      const newVar: Variable = {
        id: crypto.randomUUID(),
        name: nextDefaultVariableName(prev),
        fnNumber: fn,
        defaultValue: '',
      };
      return [...prev, newVar];
    });
    setAddError(failed ? COPY.noSlotsLeft : null);
  };

  const handleConfirm = () => {
    if (!draftParse?.ok) return;
    const parse = draftParse.value;
    setVariables(draftVariables);
    loadCsv(parse);
    setCsvMapping({
      bindings: draftBindings,
      headerSnapshot: parse.headers,
      parseOptions: persistableParseOptions(draftOptions),
    });
    // loadCsv resets activeRowIndex to 0; re-apply the draft row
    // clamped to the new rows.length.
    setActiveRow(Math.min(draftRow, Math.max(0, parse.rows.length - 1)));
    onClose();
  };

  const showMismatchWarning =
    csvMapping !== null &&
    !arraysShallowEqual(csvMapping.headerSnapshot, virtualHeaders);

  const allSlotsTaken =
    nextFreeFnNumber(draftVariables.map((v) => v.fnNumber)) === null;

  const parseError = draftParse && !draftParse.ok;

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="variable-mapping-title"
      boxClassName="bg-surface border border-border rounded-lg w-128 flex flex-col shadow-2xl max-h-[85vh]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span
          id="variable-mapping-title"
          className="font-mono text-xs text-muted uppercase tracking-widest"
        >
          {COPY.title}
        </span>
        <button
          onClick={onClose}
          aria-label={COPY.close}
          className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 overflow-y-auto">
        <p className="font-mono text-[10px] text-muted leading-relaxed">
          {COPY.hint}
        </p>

        {showMismatchWarning && (
          <p className="font-mono text-[10px] text-amber-400 leading-relaxed">
            {COPY.headerMismatchWarning}
          </p>
        )}

        {parseError && (
          <p className="font-mono text-[10px] text-amber-400">
            {COPY.parseError}
          </p>
        )}

        <div className="flex flex-col border border-border/50 rounded">
        <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-left text-muted uppercase text-[10px] tracking-wider">
              <th className="pb-2 pt-2 px-3 font-medium">{COPY.variableHeader}</th>
              <th className="pb-2 pt-2 pr-3 font-medium">{COPY.columnHeader}</th>
            </tr>
          </thead>
          <tbody>
            {draftVariables.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-3 px-3 text-muted italic text-[10px]">
                  {COPY.noVariables}
                </td>
              </tr>
            ) : (
              draftVariables.map((v) => {
                const nameError = nameErrors[v.id];
                const isNew = !initialVariableIds.has(v.id);
                // Classify against the draft (not the committed store
                // state) so the badge reflects live binding edits before
                // Apply. Both inputs synthesised here have the minimal
                // shape getVariableSource needs.
                const draftSource = getVariableSource(
                  v,
                  { headers: virtualHeaders },
                  { bindings: draftBindings, headerSnapshot: virtualHeaders as string[] },
                );
                return (
                  <tr key={v.id} className="border-t border-border/50 align-top">
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-1">
                        <VariableSourceBadge
                          source={draftSource}
                          boundHeader={draftBindings[v.id]}
                          size="xs"
                        />
                        <input
                          className={`${inputCls} ${nameError ? 'border-amber-400' : ''}`}
                          value={v.name}
                          onChange={(e) => {
                            const newName = e.target.value;
                            setDraftVariables((prev) =>
                              prev.map((x) => (x.id === v.id ? { ...x, name: newName } : x)),
                            );
                          }}
                        />
                        {isNew && (
                          <button
                            onClick={() => handleRemoveDraftVariable(v.id)}
                            aria-label={COPY.removeDraftAria}
                            title={COPY.removeDraftAria}
                            className="shrink-0 p-1 rounded text-muted hover:text-amber-400 hover:bg-surface-2 transition-colors"
                          >
                            <XMarkIcon className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {nameError ? (
                        <p className="mt-0.5 font-mono text-[9px] text-amber-400">
                          {nameError}
                        </p>
                      ) : isNew ? (
                        <p className="mt-0.5 font-mono text-[9px] text-accent/70 italic">
                          {COPY.willBeCreated}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      <select
                        className={inputCls}
                        value={draftBindings[v.id] ?? ''}
                        onChange={handleChangeBinding(v.id)}
                      >
                        <option value="">{COPY.ignoreOption}</option>
                        {virtualHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
        <div className="border-t border-border/50 px-3 py-2 flex flex-col gap-2">
          <button
            onClick={handleAddVariable}
            disabled={allSlotsTaken}
            className="self-start flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {COPY.addVariable}
          </button>
          {addError && (
            <p className="font-mono text-[10px] text-amber-400">{addError}</p>
          )}
        </div>
        </div>

        {virtualRows.length > 0 && (
          <div
            className="flex items-center gap-2 font-mono text-xs text-text"
            title={COPY.activeRowTooltip}
          >
            <label htmlFor="variable-mapping-preview-row" className="text-muted">
              {COPY.activeRowLabel}:
            </label>
            <input
              id="variable-mapping-preview-row"
              type="number"
              min={1}
              max={virtualRows.length}
              // Inline className instead of inputCls because inputCls
              // includes w-full, which would crowd out the inline label
              // and "of N" suffix.
              className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs font-mono text-text focus:border-accent focus:outline-none"
              value={draftRow + 1}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) {
                  setDraftRow(Math.max(0, Math.min(n - 1, virtualRows.length - 1)));
                }
              }}
            />
            <span className="text-muted">
              {COPY.activeRowOf} {virtualRows.length}
            </span>
          </div>
        )}

        <CollapsibleSection
          id="variable-mapping-csv-options"
          title={COPY.csvOptionsTitle}
          defaultOpen={false}
        >
          <CsvOptionsEditor
            value={draftOptions}
            onChange={setDraftOptions}
          />
        </CollapsibleSection>
      </div>

      <div className="flex justify-end items-center gap-2 px-4 py-3 border-t border-border shrink-0">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          {COPY.cancel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={!draftParse?.ok || hasNameError}
          className="px-3 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {COPY.confirm}
        </button>
      </div>
    </DialogShell>
  );
}

interface CsvOptionsEditorProps {
  value: DraftOptions;
  onChange: (next: DraftOptions) => void;
}

function CsvOptionsEditor({ value, onChange }: CsvOptionsEditorProps) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-muted uppercase tracking-wider">
          {COPY.delimiterLabel}
        </label>
        <select
          className={inputCls}
          value={value.delimiter}
          onChange={(e) => onChange({ ...value, delimiter: e.target.value })}
        >
          <option value="">{COPY.delimiterAuto}</option>
          <option value=",">{COPY.delimiterComma}</option>
          <option value=";">{COPY.delimiterSemicolon}</option>
          <option value={'\t'}>{COPY.delimiterTab}</option>
        </select>
      </div>

      <label className="flex items-center gap-2 font-mono text-[10px] text-text cursor-pointer">
        <input
          type="checkbox"
          className="accent-accent"
          checked={value.hasHeaderRow}
          onChange={(e) => onChange({ ...value, hasHeaderRow: e.target.checked })}
        />
        {COPY.hasHeaderRow}
      </label>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-muted uppercase tracking-wider">
          {COPY.skipRowsLabel}
        </label>
        <input
          type="number"
          min={0}
          className={inputCls}
          value={value.skipRows}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange({ ...value, skipRows: Math.max(0, Number.isNaN(n) ? 0 : n) });
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-muted uppercase tracking-wider">
          {COPY.encodingLabel}
        </label>
        <select
          className={inputCls}
          value={value.encoding}
          onChange={(e) => onChange({ ...value, encoding: e.target.value })}
        >
          <option value="utf-8">{COPY.encodingUtf8}</option>
          <option value="windows-1252">{COPY.encodingWin1252}</option>
          <option value="iso-8859-1">{COPY.encodingIso88591}</option>
          <option value="utf-16le">{COPY.encodingUtf16le}</option>
        </select>
      </div>
    </div>
  );
}

/** Build the initial draft-bindings: keep existing mapping entries
 *  whose header is still present in the current parse, then auto-
 *  suggest for variables that have no binding yet. */
function buildInitialBindings(
  csvMapping: CsvMapping | null,
  variables: readonly Variable[],
  headers: readonly string[],
): Record<string, string> {
  const headerSet = new Set(headers);
  const carried: Record<string, string> = {};
  if (csvMapping) {
    for (const [varId, header] of Object.entries(csvMapping.bindings)) {
      if (headerSet.has(header)) carried[varId] = header;
    }
  }
  const unmapped = variables.filter((v) => !(v.id in carried));
  const usedHeaders = new Set(Object.values(carried));
  const free = headers.filter((h) => !usedHeaders.has(h));
  const suggested = suggestCsvMapping(unmapped, free);
  return { ...carried, ...suggested };
}

/** Strip default values from the draft so a saved mapping only carries
 *  the options the user actually customised. Keeps the design file
 *  minimal and lets future default-changes pick up automatically. */
function persistableParseOptions(d: DraftOptions): CsvParseOptionsPersisted | undefined {
  const opts: CsvParseOptionsPersisted = {};
  if (d.delimiter !== '') opts.delimiter = d.delimiter;
  if (d.hasHeaderRow === false) opts.hasHeaderRow = false;
  if (d.skipRows > 0) opts.skipRows = d.skipRows;
  if (d.encoding !== 'utf-8') opts.encoding = d.encoding;
  return Object.keys(opts).length === 0 ? undefined : opts;
}

function arraysShallowEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
