import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import {
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LinkSlashIcon,
  VariableIcon,
} from '@heroicons/react/16/solid';
import { getEntry } from '../../registry';
import { isGroup, type LabelObject } from '../../types/Group';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import { lookupBoundVariable } from '../../lib/variableBinding';
import { DragHandleIcon } from '../ui/DragHandleIcon';
import { INDENT_STEP } from './layerLayout';

export interface LayerRowProps {
  obj: LabelObject;
  depth: number;
  containerId: string;
  isSelected: boolean;
  /** True for any leaf or sub-group that lives under a currently-selected
   *  group. Drives the soft tint that signals "I move with the group". */
  isInSelectedGroup: boolean;
  isExpanded: boolean;
  /** Highlight the row body; used for "drop into this group". */
  isDropTarget: boolean;
  /** Show an accent line above this row; used for sibling drops so the
   *  user sees the exact landing slot before releasing. */
  showInsertionLine: boolean;
  /** Add a small bottom gap because the next row in display order leaves
   *  this row's container (depth drops). Visually closes the group. */
  isContainerEnd: boolean;
  /** Visual depth at which to render the insertion line. Diverges from
   *  the row's own depth while the user drags horizontally to climb out
   *  of a deeply nested container. */
  insertionLineDepth: number | null;
  onSelect: () => void;
  onToggle: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
  onToggleExpand: () => void;
  onUngroup: () => void;
  /** Commit the new name; empty string clears it back to the default. */
  onRename: (name: string | undefined) => void;
}

export function LayerRow({
  obj,
  depth,
  containerId,
  isSelected,
  isInSelectedGroup,
  isExpanded,
  isDropTarget,
  showInsertionLine,
  insertionLineDepth,
  isContainerEnd,
  onSelect,
  onToggle,
  onToggleLock,
  onToggleVisible,
  onToggleExpand,
  onUngroup,
  onRename,
}: LayerRowProps) {
  const t = useT();
  const def = getEntry(obj.type);
  const groupRow = isGroup(obj);
  // Variable badge: small {x} glyph next to the type icon when the leaf
  // is bound, with the variable name as a tooltip. Lets the user scan
  // the layers list for slot usage without selecting each row. The
  // selector subscribes the row to variable changes; cheap because
  // each row already re-renders on selection / visibility flips.
  const boundVariable = useLabelStore((s) =>
    lookupBoundVariable(obj, s.variables),
  );
  // Inline-rename is exposed only for groups; leaves render their
  // registry label as a non-editable span. The single groupRow check at
  // the entry-point keeps the rest of the edit path free of guards.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Cancellation flag so the blur that fires when the input unmounts
  // on Escape doesn't sneak through commitEdit and persist the draft
  // the user wanted to discard.
  const cancellingRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const beginEdit = () => {
    cancellingRef.current = false;
    setDraft(obj.name ?? '');
    setEditing(true);
  };
  const commitEdit = () => {
    if (cancellingRef.current) return;
    const trimmed = draft.trim();
    if ((obj.name ?? '') !== trimmed) onRename(trimmed || undefined);
    setEditing(false);
  };
  const cancelEdit = () => {
    cancellingRef.current = true;
    setEditing(false);
  };
  const defaultLabel = groupRow ? t.types.group : (def?.label ?? obj.type);
  const displayName = obj.name ?? defaultLabel;
  // Show the child count next to a collapsed group's name so the user can
  // judge what's inside without expanding. Hidden while expanded (the
  // count is visible as actual rows) and while editing (the input would
  // otherwise prefill with the count too).
  const childCount = groupRow ? obj.children.length : 0;
  const showCount = groupRow && !isExpanded && childCount > 0 && !editing;
  const labelText = showCount ? `${displayName} · ${childCount}` : displayName;
  const isLocked = !!obj.locked;
  const isHidden = obj.visible === false;
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: obj.id,
    data: { containerId },
    disabled: isLocked,
  });
  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();
  // The line indent follows the *target* depth, not the row's own depth,
  // so as the user drags left the line slides left in real time.
  const lineDepth = insertionLineDepth ?? depth;
  const linePadLeft = lineDepth > 0 ? lineDepth * INDENT_STEP + 16 : 8;

  return (
    <>
      <div
        className={`h-0.5 mr-2 rounded transition-colors ${
          showInsertionLine ? 'bg-accent' : 'bg-transparent'
        }`}
        style={{ marginLeft: linePadLeft }}
      />
    <div
      ref={setNodeRef}
      style={{ touchAction: 'none' }}
      {...attributes}
      {...(isLocked ? {} : listeners)}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) onToggle();
        else onSelect();
      }}
      className={`
        flex items-center gap-2 pr-2 py-1.5
        ${isLocked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
        border-b border-border group transition-colors hover:bg-surface-2
        ${isSelected ? 'bg-surface-2 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'}
        ${isInSelectedGroup && !isSelected ? 'bg-accent/5' : ''}
        ${isDragging ? 'opacity-40' : ''}
        ${isHidden ? 'opacity-50' : ''}
        ${isDropTarget ? 'bg-accent/15 outline outline-1 outline-accent/60' : ''}
        ${isContainerEnd ? 'mb-1' : ''}
      `}
    >
      {/* Indent column: a leading 8px gutter plus one fixed-width spacer
          per ancestor level, each carrying a left border so consecutive
          rows at the same depth visually form a continuous vertical
          guide from the parent group's row down through its children.
          Always rendered (even at depth 0) so the wrapper handles the
          row's base left padding uniformly. */}
      <div className="flex self-stretch shrink-0" aria-hidden>
        <span className="w-2" />
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="w-4 border-l border-border/60" />
        ))}
      </div>
      <DragHandleIcon
        className={`w-2 h-3.5 shrink-0 text-muted transition-opacity ${isLocked ? 'opacity-0' : 'opacity-0 group-hover:opacity-60'}`}
      />
      {groupRow ? (
        <button
          type="button"
          onPointerDown={stopRowClick}
          onClick={(e) => { stopRowClick(e); onToggleExpand(); }}
          title={isExpanded ? t.app.collapse : t.app.expand}
          aria-label={isExpanded ? t.app.collapse : t.app.expand}
          aria-expanded={isExpanded}
          className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-text hover:bg-surface shrink-0"
        >
          {isExpanded
            ? <ChevronDownIcon className="w-3 h-3" />
            : <ChevronRightIcon className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}
      <span className="font-mono text-xs text-accent shrink-0 w-4 text-center">
        {groupRow ? '⊞' : def?.icon}
      </span>
      {boundVariable && (
        <VariableIcon
          className="w-3 h-3 shrink-0 text-accent/70"
          title={`Bound to ${boundVariable.name}`}
        />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              else if (e.key === 'Escape') cancelEdit();
            }}
            onClick={stopRowClick}
            onPointerDown={stopRowClick}
            placeholder={defaultLabel}
            className="text-xs text-text bg-surface-2 border border-border rounded px-1 py-0 -my-0.5 focus:border-accent focus:outline-none w-full"
          />
        ) : (
          <span
            className={`text-xs text-text truncate ${groupRow ? 'font-medium' : ''}`}
            onDoubleClick={groupRow ? (e) => { e.stopPropagation(); beginEdit(); } : undefined}
            title={groupRow ? t.layers.rename : undefined}
          >
            {labelText}
          </span>
        )}
        <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
      </div>
      {groupRow && (
        <button
          type="button"
          onPointerDown={stopRowClick}
          onClick={(e) => { stopRowClick(e); onUngroup(); }}
          title={t.layers.ungroup}
          aria-label={t.layers.ungroup}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-surface"
        >
          <LinkSlashIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onPointerDown={stopRowClick}
        onClick={(e) => { stopRowClick(e); onToggleVisible(); }}
        title={isHidden ? t.layers.show : t.layers.hide}
        aria-label={isHidden ? t.layers.show : t.layers.hide}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isHidden ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100'} hover:text-text hover:bg-surface`}
      >
        {isHidden ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onPointerDown={stopRowClick}
        onClick={(e) => { stopRowClick(e); onToggleLock(); }}
        title={isLocked ? t.layers.unlock : t.layers.lock}
        aria-label={isLocked ? t.layers.unlock : t.layers.lock}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isLocked ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100'} hover:text-text hover:bg-surface`}
      >
        {isLocked ? <LockClosedIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
      </button>
    </div>
    </>
  );
}
