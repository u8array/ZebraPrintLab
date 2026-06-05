import { useState, type ChangeEvent } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PlusIcon,
  TableCellsIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import {
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  nextFreeFnNumber,
  nextDefaultVariableName,
  type Variable,
} from '../../types/Variable';
import { walkObjects, type LabelObject } from '../../types/Group';
import { inputCls } from '../Properties/styles';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FieldLabel } from '../ui/FieldLabel';
import { useT } from '../../lib/useT';
import type { Translations } from '../../locales';
import { getObjectStringContent, getVariableSource, type VariableSource } from '../../lib/variableBinding';
import { extractTemplateRefs } from '../../lib/fnTemplate';
import { VariableSourceBadge } from './VariableSourceBadge';

export function VariablesPanel() {
  const t = useT();
  const tv = t.variables;
  const variables = useLabelStore((s) => s.variables);
  const pages = useLabelStore((s) => s.pages);
  const addVariable = useLabelStore((s) => s.addVariable);
  const updateVariable = useLabelStore((s) => s.updateVariable);
  const removeVariable = useLabelStore((s) => s.removeVariable);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const clearCsv = useLabelStore((s) => s.clearCsv);
  const setActiveRow = useLabelStore((s) => s.setActiveRow);
  const setCsvMapping = useLabelStore((s) => s.setCsvMapping);
  const openCsvMappingModal = useLabelStore((s) => s.openCsvMappingModal);
  const csvRenderMode = useLabelStore((s) => s.canvasSettings.csvRenderMode);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const [pendingCsvDiscard, setPendingCsvDiscard] = useState(false);

  // Mapping completeness for the badge's secondary line. Counts only
  // bindings whose header still exists in the active dataset, since
  // stale entries (header dropped) don't actually map anything.
  const mappedCount = (() => {
    if (!csvMapping || !csvDataset) return 0;
    const headerSet = new Set(csvDataset.headers);
    return Object.values(csvMapping.bindings).filter((h) => headerSet.has(h)).length;
  })();

  const [pendingDelete, setPendingDelete] = useState<Variable | null>(null);

  // Per-row local rejection state. The store silently no-ops invalid
  // updates (collision / range), so the input would visually snap back
  // without explanation. Tracking the rejection here lets us flash a
  // one-line hint under the offending input.
  const [rowError, setRowError] = useState<Record<string, string>>({});
  /** Panel-wide message for the one case that has no row to attach to:
   *  add-variable rejected because all 99 slots are taken. */
  const [panelError, setPanelError] = useState<string | null>(null);

  const bindingCounts = countBindings(pages, variables);
  const allSlotsTaken =
    nextFreeFnNumber(variables.map((v) => v.fnNumber)) === null;

  const handleAdd = () => {
    const base = nextDefaultVariableName(variables);
    const id = addVariable({ name: base });
    if (id === null) {
      // Name collisions on a fresh `var_n` are essentially impossible
      // since `n` is unique; the only realistic null path is exhausted
      // ^FN slots.
      setPanelError(tv.noSlotsLeft);
      return;
    }
    setPanelError(null);
  };

  const setRowMsg = (id: string, msg: string) =>
    setRowError((prev) => ({ ...prev, [id]: msg }));

  const tryUpdate = (id: string, changes: Partial<Variable>, errKey: string) => {
    const before = variables.find((v) => v.id === id);
    updateVariable(id, changes);
    const after = useLabelStore.getState().variables.find((v) => v.id === id);
    // The store applies updates by reference replacement; if nothing
    // changed the rejection happened (uniqueness / range). `before` is a
    // snapshot of the pre-update entry, so reference equality means the
    // store kept the old one verbatim.
    if (before && after === before) {
      setRowMsg(id, errKey);
    } else {
      setRowError((prev) => {
        if (!(id in prev)) return prev;
        // Destructure-omit the cleared key. Dynamic `delete` is linted
        // out for hot-paths; rest-spread is the idiomatic alternative.
        const { [id]: _drop, ...next } = prev;
        void _drop;
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] text-muted leading-relaxed flex-1">
          {tv.panelHint}
        </p>
        {variables.length > 0 && (
          <button
            onClick={() =>
              setCanvasSettings({
                csvRenderMode:
                  csvRenderMode === 'preview' ? 'schema' : 'preview',
              })
            }
            title={
              csvRenderMode === 'preview'
                ? csvDataset
                  ? tv.csvBadgePreviewTip
                  : tv.csvBadgePreviewTipNoCsv
                : tv.csvBadgeSchemaTip
            }
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              csvRenderMode === 'preview'
                ? 'text-accent bg-[--color-accent-dim]'
                : 'text-muted hover:text-text hover:bg-surface-2 border border-border'
            }`}
          >
            {csvRenderMode === 'preview' ? tv.csvBadgePreviewMode : tv.csvBadgeSchemaMode}
          </button>
        )}
      </div>

      {!csvDataset && csvMapping && Object.keys(csvMapping.bindings).length > 0 && (
        /* Mapping persisted (design.json or localStorage) but no CSV
           data in this session; reload, Discard CSV, or opening a
           saved design. Surface it so the saved bindings don't look
           lost. User re-imports via the File menu's "Import CSV data"
           to bring values back; the X here drops the mapping entirely. */
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded border border-amber-500/40 bg-amber-500/5 font-mono text-[10px] text-text">
          <div className="flex items-center gap-1.5">
            <TableCellsIcon className="w-3 h-3 shrink-0 text-amber-400" />
            <span className="flex-1 min-w-0 text-amber-300">
              {tv.csvSavedMappingTitle}
            </span>
            <button
              onClick={() => setCsvMapping(null)}
              aria-label={tv.csvSavedMappingDiscard}
              title={tv.csvSavedMappingDiscard}
              className="shrink-0 text-muted hover:text-amber-400 transition-colors"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </div>
          <p className="text-muted">
            {tv.csvSavedMappingDescFmt
              .replace('{mapped}', String(Object.keys(csvMapping.bindings).length))
              .replace('{total}', String(variables.length))}
          </p>
        </div>
      )}

      {csvDataset && (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded border border-border bg-surface-2 font-mono text-[10px] text-text">
          {/* i18n: Phase-2 strings here get locale keys at end-of-branch sweep. */}
          <div className="flex items-center gap-1.5">
            <TableCellsIcon className="w-3 h-3 shrink-0 text-muted" />
            <span
              className="truncate flex-1 min-w-0"
              title={csvDataset.source.filename}
            >
              {csvDataset.source.filename}
            </span>
            <button
              onClick={openCsvMappingModal}
              aria-label={tv.csvBadgeConfigureMapping}
              title={tv.csvBadgeConfigureMapping}
              className="shrink-0 text-muted hover:text-text transition-colors"
            >
              <Cog6ToothIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPendingCsvDiscard(true)}
              aria-label={tv.csvBadgeDiscardCsv}
              title={tv.csvBadgeDiscardCsv}
              className="shrink-0 text-muted hover:text-amber-400 transition-colors"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </div>
          <p className="text-muted">
            {tv.csvBadgeRowsMappedFmt
              .replace('{rowCount}', String(csvDataset.source.rowCount))
              .replace('{mapped}', String(mappedCount))
              .replace('{total}', String(variables.length))}
          </p>
          {csvDataset.rows.length > 0 && (
            <div className="flex items-center gap-1 pt-0.5">
              <button
                onClick={() => setActiveRow(csvDataset.activeRowIndex - 1)}
                disabled={
                  csvDataset.activeRowIndex === 0 || csvRenderMode === 'schema'
                }
                aria-label={tv.csvBadgePrevRow}
                title={tv.csvBadgePrevRow}
                className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <span className="text-muted">{tv.csvBadgeRowLabel}</span>
              <input
                type="number"
                min={1}
                max={csvDataset.rows.length}
                value={csvDataset.activeRowIndex + 1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) setActiveRow(n - 1);
                }}
                disabled={csvRenderMode === 'schema'}
                className="w-10 bg-surface-2 border border-border rounded px-1 py-0 text-[10px] font-mono text-text focus:border-accent focus:outline-none text-center disabled:opacity-30 disabled:cursor-not-allowed"
              />
              <span className="text-muted">/ {csvDataset.rows.length}</span>
              <button
                onClick={() => setActiveRow(csvDataset.activeRowIndex + 1)}
                disabled={
                  csvDataset.activeRowIndex === csvDataset.rows.length - 1 ||
                  csvRenderMode === 'schema'
                }
                aria-label={tv.csvBadgeNextRow}
                title={tv.csvBadgeNextRow}
                className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {variables.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] text-muted italic">{tv.empty}</p>
          <p className="font-mono text-[10px] text-muted leading-relaxed">
            {tv.emptyExample}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {variables.map((entry) => {
            const source = getVariableSource(entry, csvDataset, csvMapping);
            const boundHeader = csvMapping?.bindings[entry.id];
            return (
              <VariableRow
                key={entry.id}
                variable={entry}
                bindings={bindingCounts.get(entry.id) ?? 0}
                source={source}
                boundHeader={boundHeader}
                error={rowError[entry.id]}
                tv={tv}
                onChangeName={(name) =>
                  tryUpdate(entry.id, { name }, tv.nameInUse)
                }
                onChangeFnNumber={(fnNumber) =>
                  tryUpdate(entry.id, { fnNumber }, tv.slotInUse)
                }
                onChangeDefault={(defaultValue) =>
                  tryUpdate(entry.id, { defaultValue }, '')
                }
                onRequestDelete={() => setPendingDelete(entry)}
                onDirtyChange={() =>
                  setRowError((prev) => {
                    if (!(entry.id in prev)) return prev;
                    const { [entry.id]: _drop, ...rest } = prev;
                    void _drop;
                    return rest;
                  })
                }
              />
            );
          })}
        </ul>
      )}

      <button
        onClick={handleAdd}
        disabled={allSlotsTaken}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        {tv.add}
      </button>

      {panelError && (
        <p className="font-mono text-[10px] text-amber-400">{panelError}</p>
      )}

      {pendingDelete && (
        <ConfirmDialog
          message={formatDeleteMessage(
            tv,
            pendingDelete.name,
            bindingCounts.get(pendingDelete.id) ?? 0,
          )}
          confirmLabel={tv.confirmDelete}
          cancelLabel={tv.cancel}
          destructive
          onConfirm={() => {
            removeVariable(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingCsvDiscard && csvDataset && (
        <ConfirmDialog
          message={tv.csvDiscardConfirmFmt.replace(
            '{filename}',
            csvDataset.source.filename,
          )}
          confirmLabel={tv.csvDiscardConfirmAction}
          cancelLabel={tv.cancel}
          destructive
          onConfirm={() => {
            clearCsv();
            setPendingCsvDiscard(false);
          }}
          onCancel={() => setPendingCsvDiscard(false)}
        />
      )}
    </div>
  );
}

interface RowProps {
  variable: Variable;
  bindings: number;
  source: VariableSource;
  boundHeader: string | undefined;
  error?: string;
  tv: Translations['variables'];
  onChangeName: (next: string) => void;
  onChangeFnNumber: (next: number) => void;
  onChangeDefault: (next: string) => void;
  onRequestDelete: () => void;
  /** Called when any input value diverges from the committed value so
   *  the panel can clear a stale rowError. Without this a duplicate-
   *  name rejection would linger after the user kept typing. */
  onDirtyChange: () => void;
}

function VariableRow({
  variable,
  bindings,
  source,
  boundHeader,
  error,
  tv,
  onChangeName,
  onChangeFnNumber,
  onChangeDefault,
  onRequestDelete,
  onDirtyChange,
}: RowProps) {
  // Mirror inputs locally so the user can transiently type invalid values
  // (empty name, mid-edit number) without the store snapping them back on
  // each keystroke. Commit on blur. Known limitation: an external store
  // update to the same id (undo, file load) does not flow back into this
  // local mirror; the user would need to blur and re-focus. Accepted
  // for Phase 1 because the alternative (effect-based sync) introduced
  // focus-stealing and setState-in-render bugs.
  const [name, setName] = useState(variable.name);
  const [fn, setFn] = useState(String(variable.fnNumber));
  const [def, setDef] = useState(variable.defaultValue);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === variable.name) {
      setName(variable.name);
      return;
    }
    onChangeName(trimmed);
  };

  const commitFn = () => {
    const n = parseInt(fn, 10);
    if (Number.isNaN(n) || n === variable.fnNumber) {
      setFn(String(variable.fnNumber));
      return;
    }
    onChangeFnNumber(n);
  };

  const commitDef = () => {
    if (def === variable.defaultValue) return;
    onChangeDefault(def);
  };

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <div className="flex-1 flex flex-col gap-0.5">
          <FieldLabel text={tv.nameLabel} help={tv.nameHelp} />
          <input
            className={inputCls}
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setName(e.target.value);
              onDirtyChange();
            }}
            onBlur={commitName}
          />
        </div>
        <div className="w-14 flex flex-col gap-0.5">
          <FieldLabel text={tv.fnLabel} help={tv.fnHelp} />
          <input
            type="number"
            min={FN_NUMBER_MIN}
            max={FN_NUMBER_MAX}
            className={inputCls}
            value={fn}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFn(e.target.value);
              onDirtyChange();
            }}
            onBlur={commitFn}
          />
        </div>
        <button
          onClick={onRequestDelete}
          aria-label={tv.removeAriaFmt.replace('{name}', variable.name)}
          className="p-1.5 rounded text-muted hover:text-amber-400 hover:bg-surface-2 transition-colors"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <FieldLabel text={tv.defaultLabel} help={tv.defaultHelp} />
        <input
          className={inputCls}
          value={def}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDef(e.target.value)}
          onBlur={commitDef}
        />
      </div>
      <div className="flex justify-between items-center font-mono text-[9px] uppercase tracking-wider text-muted gap-2">
        <span>
          {bindings === 0
            ? tv.noBindings
            : bindings === 1
              ? tv.bindingsSingular
              : tv.bindingsPluralFmt.replace('{n}', String(bindings))}
        </span>
        {error ? (
          <span className="text-amber-400">{error}</span>
        ) : (
          <VariableSourceBadge
            source={source}
            boundHeader={boundHeader}
            size="xs"
            showLabel
          />
        )}
      </div>
    </li>
  );
}

/** Build the delete-confirmation message from the parameterised locale
 *  templates. Lives outside the component so the locale format is a
 *  pure transformation, not a hook-bound side effect. */
function formatDeleteMessage(
  tv: Translations['variables'],
  name: string,
  count: number,
): string {
  const template = count === 0 ? tv.deleteUnboundFmt : tv.deleteBoundFmt;
  return template.replace('{name}', name).replace('{n}', String(count));
}

/** Walk every page (groups too) and tally how many fields reference each
 *  variable, either via single-bind `variableId` OR via inline
 *  `«name»` template markers in their content. Returns a Map keyed by
 *  variable.id. Variables with no bindings are absent; callers
 *  default to 0. */
function countBindings(
  pages: { objects: LabelObject[] }[],
  variables: readonly Variable[],
): Map<string, number> {
  const known = new Set(variables.map((v) => v.id));
  const byName = new Map(variables.map((v) => [v.name, v.id]));
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const obj of walkObjects(page.objects)) {
      // De-dupe per OBJECT across both binding styles: a field with
      // both `variableId === V` and `«V»` in its content counts as
      // one usage of V, not two. Mirrors how the user thinks about
      // "where is V used"; one field = one place.
      const refsInThisObj = new Set<string>();
      if (obj.variableId && known.has(obj.variableId)) {
        refsInThisObj.add(obj.variableId);
      }
      const c = getObjectStringContent(obj);
      if (c !== undefined) {
        for (const name of extractTemplateRefs(c)) {
          const id = byName.get(name);
          if (id) refsInThisObj.add(id);
        }
      }
      for (const id of refsInThisObj) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return counts;
}

