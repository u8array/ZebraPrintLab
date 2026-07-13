import { exportableLeaves, type LabelObject } from "../types/Group";
import { extractTemplateRefs } from "./fnTemplate";
import { getObjectStringContent } from "./variableBinding";
import type { Variable } from "../types/Variable";

/** ^BR and GS1 DataMatrix encode FNC1 differently and must not match. */
export function isModeDLeaf(leaf: LabelObject): boolean {
  return leaf.type === "code128" && (leaf.props as { gs1?: boolean }).gs1 === true;
}

function sweepFnConsumers(
  objects: readonly LabelObject[],
  variables: readonly Variable[],
): { modeD: Set<number>; other: Set<number> } {
  const fnByName = new Map(variables.map((v) => [v.name, v.fnNumber]));
  const modeD = new Set<number>();
  const other = new Set<number>();
  // A non-exported consumer never prints, so it must not influence the sets.
  for (const leaf of exportableLeaves(objects)) {
    const c = getObjectStringContent(leaf);
    if (c === undefined) continue;
    const target = isModeDLeaf(leaf) ? modeD : other;
    for (const name of extractTemplateRefs(c)) {
      const fn = fnByName.get(name);
      if (fn !== undefined) target.add(fn);
    }
  }
  return { modeD, other };
}

/** ^FN numbers consumed exclusively by GS1 mode-D Code 128 fields. Firmware
 *  substitutes one ^FN value into every consumer, so the mode-D encoding
 *  (>0 escape, >8 FNC1) is only correct when no other field shares the slot.
 *  Generator (escape on emit) and parser (normalize on import) both derive
 *  this set from the document itself, keeping the round trip symmetric. */
export function gs1ModeDExclusiveFns(
  objects: readonly LabelObject[],
  variables: readonly Variable[],
): Set<number> {
  const { modeD, other } = sweepFnConsumers(objects, variables);
  for (const fn of other) modeD.delete(fn);
  return modeD;
}

/** Slots a mode-D field shares with a literal consumer: no substituted value
 *  is correct for both, so emit stays raw and preflight warns on a > value. */
export function gs1ModeDSharedFns(
  objects: readonly LabelObject[],
  variables: readonly Variable[],
): Set<number> {
  const { modeD, other } = sweepFnConsumers(objects, variables);
  return new Set([...modeD].filter((fn) => other.has(fn)));
}
