import { useState, type ChangeEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import type { LabelObject } from '../../types/Group';
import { inputCls } from '../Properties/styles';
import { FieldLabel } from '../ui/FieldLabel';

/* i18n: literal strings here belong to the end-of-branch locale sweep;
 *  see docs/variables-plan.local.md. */
const COPY = {
  label: 'Variable',
  help:
    'Bind this field to a Variable. The field will display the variable\'s default value and emit it as a ZPL ^FN slot at print time.',
  unbound: 'Not bound',
  createNew: '+ Create new variable…',
  unbindAria: 'Unbind variable',
  newNamePlaceholder: 'Name for new variable',
  cancel: 'Cancel',
  create: 'Create',
  noSlotsLeft: 'All 99 ^FN slots are taken; remove an unused variable first.',
  nameRequired: 'Name required.',
  nameInUse: 'Name already in use.',
  boundHint: 'Default editable in the Variables tab.',
  emptyDefault: '(empty)',
} as const;

const CREATE_NEW_SENTINEL = '__create_new__';

interface Props {
  obj: LabelObject;
}

export function VariableBindingControl({ obj }: Props) {
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
      setError(COPY.nameRequired);
      return;
    }
    // Seed the new variable's default with whatever literal content the
    // field is currently carrying — preserves the canvas state across
    // the binding transition. Every bindable type's first ^FD emission
    // comes from `props.content` (see registry implementations).
    const props = (obj as { props?: { content?: unknown } }).props;
    const defaultValue =
      typeof props?.content === 'string' ? props.content : '';
    const id = addVariable({ name: trimmed, defaultValue });
    if (id === null) {
      // Two reasons addVariable returns null: name collision or no free
      // ^FN slot. Distinguish via the variables list so the user knows
      // which to fix.
      setError(
        variables.some((v) => v.name === trimmed)
          ? COPY.nameInUse
          : COPY.noSlotsLeft,
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
      <FieldLabel text={COPY.label} help={COPY.help} />

      {creating ? (
        <div className="flex flex-col gap-1">
          <input
            autoFocus
            className={inputCls}
            placeholder={COPY.newNamePlaceholder}
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
              {COPY.create}
            </button>
            <button
              onClick={cancelCreate}
              className="px-2 py-1 rounded text-xs font-mono text-muted hover:text-text transition-colors"
            >
              {COPY.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <select
            className={`${inputCls} flex-1`}
            value={boundVariable?.id ?? ''}
            onChange={handleSelect}
          >
            <option value="">{COPY.unbound}</option>
            {variables.map((v) => (
              <option key={v.id} value={v.id}>
                {formatVariableOption(v.name, v.defaultValue)}
              </option>
            ))}
            <option value={CREATE_NEW_SENTINEL}>{COPY.createNew}</option>
          </select>
          {boundVariable && (
            <button
              onClick={() => updateObject(obj.id, { variableId: undefined })}
              aria-label={COPY.unbindAria}
              title={COPY.unbindAria}
              className="p-1 rounded text-muted hover:text-amber-400 hover:bg-surface-2 transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
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
              ? COPY.emptyDefault
              : `"${boundVariable.defaultValue}"`}
          </span>{' '}
          {COPY.boundHint}
        </p>
      )}
    </div>
  );
}

/** Render `{name} — "{default}"`, truncating long defaults so the
 *  <option> stays scannable in narrow dropdowns. Empty default is
 *  surfaced as `{name} — (empty)` rather than a trailing em-dash so
 *  users see the state explicitly. */
const OPTION_DEFAULT_MAX = 24;
function formatVariableOption(name: string, defaultValue: string): string {
  if (defaultValue === '') return `${name} — (empty)`;
  const truncated =
    defaultValue.length > OPTION_DEFAULT_MAX
      ? `${defaultValue.slice(0, OPTION_DEFAULT_MAX)}…`
      : defaultValue;
  return `${name} — "${truncated}"`;
}
