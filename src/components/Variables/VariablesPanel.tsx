import { useState, type ChangeEvent } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import {
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  nextFreeFnNumber,
  type Variable,
} from '../../types/Variable';
import { walkObjects, type LabelObject } from '../../types/Group';
import { inputCls, labelCls } from '../Properties/styles';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/* i18n: literal strings in this file are scheduled for locale extraction in
 *  Phase 1 step 3d. Keep them in one place so the sweep is mechanical. */
const COPY = {
  panelHint:
    'Variables hold defaults that ZPL ^FN/^FV slots reference at print time. Bind a text or barcode field from its Properties tab.',
  add: 'Add variable',
  empty: 'No variables yet.',
  nameLabel: 'Name',
  fnLabel: 'Slot',
  defaultLabel: 'Default',
  removeAria: (name: string) => `Remove variable ${name}`,
  bindingsBadge: (n: number) => (n === 1 ? '1 binding' : `${n} bindings`),
  noBindings: 'unused',
  deleteMessage: (name: string, count: number) =>
    count === 0
      ? `Delete variable "${name}"? It is not bound to any field.`
      : `Delete variable "${name}"? It is bound to ${count} field${count === 1 ? '' : 's'}; they will be unbound and fall back to their last literal value.`,
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel',
  noSlotsLeft: 'All 99 slots are taken.',
  nameInUse: 'Name already in use.',
  slotInUse: 'Slot already in use.',
} as const;

export function VariablesPanel() {
  const variables = useLabelStore((s) => s.variables);
  const pages = useLabelStore((s) => s.pages);
  const addVariable = useLabelStore((s) => s.addVariable);
  const updateVariable = useLabelStore((s) => s.updateVariable);
  const removeVariable = useLabelStore((s) => s.removeVariable);

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
    const base = nextDefaultName(variables);
    const id = addVariable({ name: base });
    if (id === null) {
      // Name collisions on a fresh `var_n` are essentially impossible
      // since `n` is unique; the only realistic null path is exhausted
      // ^FN slots.
      setPanelError(COPY.noSlotsLeft);
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
        // Rebuild without the cleared key — dynamic delete is linted out
        // for hot-paths; this rebuild is fine for a per-row state update.
        const next: Record<string, string> = {};
        for (const [k, msg] of Object.entries(prev)) {
          if (k !== id) next[k] = msg;
        }
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="font-mono text-[10px] text-muted leading-relaxed">
        {COPY.panelHint}
      </p>

      {variables.length === 0 ? (
        <p className="font-mono text-[10px] text-muted italic">{COPY.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {variables.map((v) => (
            <VariableRow
              key={v.id}
              variable={v}
              bindings={bindingCounts.get(v.id) ?? 0}
              error={rowError[v.id]}
              onChangeName={(name) =>
                tryUpdate(v.id, { name }, COPY.nameInUse)
              }
              onChangeFnNumber={(fnNumber) =>
                tryUpdate(v.id, { fnNumber }, COPY.slotInUse)
              }
              onChangeDefault={(defaultValue) =>
                tryUpdate(v.id, { defaultValue }, '')
              }
              onRequestDelete={() => setPendingDelete(v)}
            />
          ))}
        </ul>
      )}

      <button
        onClick={handleAdd}
        disabled={allSlotsTaken}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        {COPY.add}
      </button>

      {panelError && (
        <p className="font-mono text-[10px] text-amber-400">{panelError}</p>
      )}

      {pendingDelete && (
        <ConfirmDialog
          message={COPY.deleteMessage(
            pendingDelete.name,
            bindingCounts.get(pendingDelete.id) ?? 0,
          )}
          confirmLabel={COPY.deleteConfirm}
          cancelLabel={COPY.deleteCancel}
          destructive
          onConfirm={() => {
            removeVariable(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  variable: Variable;
  bindings: number;
  error?: string;
  onChangeName: (next: string) => void;
  onChangeFnNumber: (next: number) => void;
  onChangeDefault: (next: string) => void;
  onRequestDelete: () => void;
}

function VariableRow({
  variable,
  bindings,
  error,
  onChangeName,
  onChangeFnNumber,
  onChangeDefault,
  onRequestDelete,
}: RowProps) {
  // Mirror inputs locally so the user can transiently type invalid values
  // (empty name, mid-edit number) without the store snapping them back on
  // each keystroke. Commit on blur. Known limitation: an external store
  // update to the same id (undo, file load) does not flow back into this
  // local mirror — the user would need to blur and re-focus. Accepted
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
          <label className={labelCls}>{COPY.nameLabel}</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onBlur={commitName}
          />
        </div>
        <div className="w-14 flex flex-col gap-0.5">
          <label className={labelCls}>{COPY.fnLabel}</label>
          <input
            type="number"
            min={FN_NUMBER_MIN}
            max={FN_NUMBER_MAX}
            className={inputCls}
            value={fn}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFn(e.target.value)}
            onBlur={commitFn}
          />
        </div>
        <button
          onClick={onRequestDelete}
          aria-label={COPY.removeAria(variable.name)}
          className="p-1.5 rounded text-muted hover:text-amber-400 hover:bg-surface-2 transition-colors"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className={labelCls}>{COPY.defaultLabel}</label>
        <input
          className={inputCls}
          value={def}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDef(e.target.value)}
          onBlur={commitDef}
        />
      </div>
      <div className="flex justify-between items-center font-mono text-[9px] uppercase tracking-wider text-muted">
        <span>
          {bindings === 0 ? COPY.noBindings : COPY.bindingsBadge(bindings)}
        </span>
        {error && <span className="text-amber-400">{error}</span>}
      </div>
    </li>
  );
}

/** Walk every page (groups too) and tally how many fields reference each
 *  variable. Returns a Map keyed by variable.id. Variables with no
 *  bindings are absent from the map; callers default to 0. */
function countBindings(
  pages: { objects: LabelObject[] }[],
  variables: readonly Variable[],
): Map<string, number> {
  const known = new Set(variables.map((v) => v.id));
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const obj of walkObjects(page.objects)) {
      if (obj.variableId && known.has(obj.variableId)) {
        counts.set(obj.variableId, (counts.get(obj.variableId) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** `var_{n}` where n is the lowest integer that yields a unique name.
 *  Keeps the user from having to type a name to add an entry while still
 *  giving each one a distinct default. */
function nextDefaultName(existing: readonly Variable[]): string {
  const taken = new Set(existing.map((v) => v.name));
  let i = 1;
  while (taken.has(`var_${i}`)) i++;
  return `var_${i}`;
}
