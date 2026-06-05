import type { ObjectChanges } from "../store/labelStore";

/** Object shape this helper cares about. Kept narrow on purpose so the
 *  function stays decoupled from the full LabelObject union. */
export interface ToggleTarget {
  id: string;
  locked?: boolean;
  visible?: boolean;
}

export type ToggleField = "locked" | "visible";

/**
 * Figma-style bulk toggle.
 *
 * A click on a per-row Lock or Eye icon broadcasts the resulting state to
 * the whole active selection when the clicked row is part of it; otherwise
 * the click acts only on that row. The next value is derived from the
 * *clicked* object's current state so mixed-state selections converge on
 * one predictable value rather than each item toggling independently.
 *
 * Returns the patch list to feed into `useLabelStore.updateObjects`. Empty
 * array if the clicked id is unknown.
 */
export function buildBulkToggleUpdates(
  objects: readonly ToggleTarget[],
  selectedIds: readonly string[],
  clickedId: string,
  field: ToggleField,
): { id: string; changes: ObjectChanges }[] {
  const clicked = objects.find((o) => o.id === clickedId);
  if (!clicked) return [];

  // `locked` is on when truthy; `visible` defaults to on when undefined, so
  // only an explicit `false` counts as off. Inverting whichever is current
  // gives the new value.
  const currentlyOn =
    field === "locked" ? !!clicked.locked : clicked.visible !== false;
  const nextValue = !currentlyOn;

  // Match the PropertiesPanel checkbox pattern: persist `undefined` for
  // each field's default state (locked=off, visible=on) so the same toggle
  // produces the same JSON regardless of which UI path triggered it.
  // Without this, LayersPanel toggles would leave `locked: false` /
  // `visible: true` in saved design files while PropertiesPanel toggles
  // omit the key; producing churn in version-controlled design files.
  const patchValue: boolean | undefined =
    field === "locked"
      ? (nextValue ? true : undefined)
      : (nextValue ? undefined : false);

  const targets = selectedIds.includes(clickedId) ? selectedIds : [clickedId];
  return targets.map((id) => ({ id, changes: { [field]: patchValue } }));
}
