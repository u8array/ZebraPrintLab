import { useState, type ChangeEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import type { LabelObject } from '../../types/Group';
import { inputCls } from '../Properties/styles';
import { FieldLabel } from '../ui/FieldLabel';
import { ZplCmd } from '../Properties/ZplCmd';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../lib/useT';
import { getObjectStringContent } from '../../lib/variableBinding';

const CREATE_NEW_SENTINEL = '__create_new__';

interface Props {
  obj: LabelObject;
}

export function VariableBindingControl({ obj }: Props) {
  const t = useT();
  const tv = t.variables;
  const variables = useLabelStore((s) => s.variables);
  const updateObject = useLabelStore((s) => s.updateObject);
  const addVariable = useLabelStore((s) => s.addVariable);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const boundId = obj.variableId;
  // Bound to a variable that no longer exists (race after delete with
  // pending undo, or partial state from a manual edit). Treat as unbound
  // so the dropdown doesn't show a phantom selection; the orphan is
  // already harmless at emit time (fdFieldFor falls back to literal).
  const boundVariable = boundId
    ? variables.find((v) => v.id === boundId)
    : undefined;

  const handleSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setError(null);
    if (value === '') {
      // 'Not bound' picked: clear any existing binding.
      if (boundId) updateObject(obj.id, { variableId: undefined });
      return;
    }
    if (value === CREATE_NEW_SENTINEL) {
      setCreating(true);
      setNewName('');
      return;
    }
    updateObject(obj.id, { variableId: value });
  };

  const commitCreate = () => {
    const trimmed = newName.trim();
    if (trimmed === '') {
      setError(tv.nameRequired);
      return;
    }
    // Every bindable type's first ^FD emission comes from
    // `props.content`, so seeding the default from it preserves the
    // canvas state across the binding transition.
    const defaultValue = getObjectStringContent(obj) ?? '';
    const id = addVariable({ name: trimmed, defaultValue });
    if (id === null) {
      // Two reasons addVariable returns null: name collision or no free
      // ^FN slot. Distinguish via the variables list so the user knows
      // which to fix.
      setError(
        variables.some((v) => v.name === trimmed)
          ? tv.nameInUse
          : tv.noSlotsLeft,
      );
      return;
    }
    updateObject(obj.id, { variableId: id });
    setCreating(false);
    setNewName('');
    setError(null);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
    setError(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel text={tv.sectionTitle} help={tv.bindingHelp} />
        <ZplCmd cmd="^FN" />
      </div>

      {creating ? (
        <div className="flex flex-col gap-1">
          <input
            autoFocus
            className={inputCls}
            placeholder={tv.newNamePlaceholder}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') cancelCreate();
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={commitCreate}
              className="px-2 py-1 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 transition-opacity"
            >
              {tv.create}
            </button>
            <button
              onClick={cancelCreate}
              className="px-2 py-1 rounded text-xs font-mono text-muted hover:text-text transition-colors"
            >
              {tv.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <select
            className={`${inputCls} flex-1`}
            aria-label={tv.sectionTitle}
            value={boundVariable?.id ?? ''}
            onChange={handleSelect}
          >
            <option value="">{tv.notBound}</option>
            {variables.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {formatVariableOption(entry.name, entry.defaultValue, tv.emptyDefault)}
              </option>
            ))}
            <option value={CREATE_NEW_SENTINEL}>{tv.createNew}</option>
          </select>
          {boundVariable && (
            <Tooltip content={tv.unbindAria}>
              <button
                onClick={() => updateObject(obj.id, { variableId: undefined })}
                aria-label={tv.unbindAria}
                className="p-1 rounded text-muted hover:text-amber-400 hover:bg-surface-2 transition-colors"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {error && (
        <p className="font-mono text-[10px] text-amber-400">{error}</p>
      )}

      {boundVariable && !creating && (
        <p className="font-mono text-[10px] text-muted leading-relaxed">
          <span className="text-text">
            {boundVariable.defaultValue === ''
              ? tv.emptyDefault
              : `"${boundVariable.defaultValue}"`}
          </span>{' '}
          {tv.boundHint}
        </p>
      )}
    </div>
  );
}

/** Render `{name}: "{default}"`, truncating long defaults so the
 *  <option> stays scannable in narrow dropdowns. Empty default uses
 *  the locale's `emptyDefault` label so users see the state explicitly. */
const OPTION_DEFAULT_MAX = 24;
function formatVariableOption(
  name: string,
  defaultValue: string,
  emptyLabel: string,
): string {
  if (defaultValue === '') return `${name}: ${emptyLabel}`;
  const truncated =
    defaultValue.length > OPTION_DEFAULT_MAX
      ? `${defaultValue.slice(0, OPTION_DEFAULT_MAX)}…`
      : defaultValue;
  return `${name}: "${truncated}"`;
}
