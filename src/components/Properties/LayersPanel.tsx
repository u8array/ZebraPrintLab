import { useMemo, useState } from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FolderPlusIcon } from '@heroicons/react/16/solid';
import { useLabelStore, useCurrentObjects } from '../../store/labelStore';
import { canGroupSelection, findObjectById, isGroup, walkObjects } from '../../types/Group';
import { useT } from '../../lib/useT';
import { buildBulkToggleUpdates, type ToggleField } from '../../lib/bulkToggle';
import { buildFlatRows, useLayerDnd, type FlatRow } from './useLayerDnd';
import { LayerRow } from './LayerRow';

export function LayersPanel() {
  const t = useT();
  const {
    selectedIds,
    selectObject,
    toggleSelectObject,
    updateObject,
    updateObjects,
    groupSelection,
    addGroup,
    ungroupIds,
    reparentObject,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const allNodes = useMemo(() => [...walkObjects(objects)], [objects]);
  const rows = useMemo(() => buildFlatRows(objects, expandedIds), [objects, expandedIds]);
  const rowsById = useMemo(() => {
    const m = new Map<string, FlatRow>();
    for (const r of rows) m.set(r.obj.id, r);
    return m;
  }, [rows]);
  const allRowIds = useMemo(() => rows.map((r) => r.obj.id), [rows]);

  // Soft tint for descendants of a selected group, signalling which
  // leaves move together. The group row itself keeps the stronger
  // "selected" accent.
  const idsUnderSelectedGroup = useMemo(() => {
    const out = new Set<string>();
    for (const id of selectedIds) {
      const obj = findObjectById(objects, id);
      if (!obj || !isGroup(obj)) continue;
      for (const desc of walkObjects(obj.children)) out.add(desc.id);
    }
    return out;
  }, [objects, selectedIds]);

  const {
    sensors,
    collisionDetection,
    panelRef,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    preview,
  } = useLayerDnd({ objects, rowsById, expandedIds, reparentObject });

  const toggleField = (clickedId: string, field: ToggleField) => {
    const updates = buildBulkToggleUpdates(allNodes, selectedIds, clickedId, field);
    if (updates.length > 0) updateObjects(updates);
  };

  // Smart "New group" button: prefer grouping the current top-level
  // selection (matches the Ctrl+G shortcut), fall back to creating an
  // empty group at the top so the affordance is also useful before
  // any items exist or have been selected.
  const onNewGroup = () => {
    if (canGroupSelection(objects, selectedIds)) groupSelection();
    else addGroup();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex items-center justify-end px-2 py-1.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onNewGroup}
          title={t.layers.newGroup}
          aria-label={t.layers.newGroup}
          className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <FolderPlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {objects.length === 0 ? (
        <div className="p-4 text-center text-muted text-xs mt-6">
          {t.layers.empty}
        </div>
      ) : (
        <SortableContext items={allRowIds} strategy={verticalListSortingStrategy}>
          <div ref={panelRef} className="flex flex-col">
            {rows.map(({ obj, depth, containerId }, i) => (
              <LayerRow
                key={obj.id}
                obj={obj}
                depth={depth}
                containerId={containerId}
                isSelected={selectedIds.includes(obj.id)}
                isInSelectedGroup={idsUnderSelectedGroup.has(obj.id)}
                isExpanded={expandedIds.has(obj.id)}
                isDropTarget={preview.dropIntoTargetId === obj.id}
                showInsertionLine={preview.insertionLineRowId === obj.id}
                insertionLineDepth={
                  preview.insertionLineRowId === obj.id ? preview.insertionLineDepth : null
                }
                // The next row leaving a deeper container marks the
                // boundary: add a small bottom gap so the user sees the
                // group "close" before the next sibling at the parent
                // level begins.
                isContainerEnd={
                  depth > 0 && (rows[i + 1]?.depth ?? -1) < depth
                }
                onSelect={() => selectObject(obj.id)}
                onToggle={() => toggleSelectObject(obj.id)}
                onToggleLock={() => toggleField(obj.id, 'locked')}
                onToggleVisible={() => toggleField(obj.id, 'visible')}
                onToggleExpand={() => toggleExpand(obj.id)}
                onUngroup={() => ungroupIds([obj.id])}
                onRename={(name) => updateObject(obj.id, { name })}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </DndContext>
  );
}
