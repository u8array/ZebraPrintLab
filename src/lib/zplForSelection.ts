import type { LabelConfig } from "../types/LabelConfig";
import { isGroup, getAllLeaves, type LabelObject } from "../types/Group";
import type { Variable } from "../types/Variable";
import { planFieldEmission } from "./zplGenerator";

/** Just the field commands for the selected objects (no ^XA / label config /
 *  ^XZ): the page's top-level objects that are selected, a group counting when
 *  it or any descendant leaf is. Includes the template/clock header (^FE/^FN/
 *  ^SO/^FC) the bodies depend on, so a selection using variables stays valid;
 *  it stays empty for plain objects. Empty string when nothing is selected. */
export function zplForSelection(
  label: LabelConfig,
  pageObjects: readonly LabelObject[],
  selectedIds: readonly string[],
  variables: readonly Variable[] = [],
): string {
  const sel = new Set(selectedIds);
  const picked = pageObjects.filter(
    (o) => sel.has(o.id) || (isGroup(o) && getAllLeaves(o.children).some((l) => sel.has(l.id))),
  );
  if (picked.length === 0) return "";
  const { headerLines, bodyLines } = planFieldEmission(label, picked, variables);
  return [...headerLines, ...bodyLines].join("\n");
}
