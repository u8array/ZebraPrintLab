import { hasTemplateMarkers, resolveTemplateMarkers } from "./fnTemplate";
import { channelDatesFrom, hasClockMarkers, resolveClockMarkers, type ChannelDates } from "./fcTemplate";
import { hasControlMarkers, resolveControlMarkers } from "../types/controlKey";
import type { ClockOffset, LabelConfig } from "../types/LabelConfig";
import type { Variable } from "../types/Variable";

// Leaf module (no registry import) so registry emitters (qrcode's ^GFA
// pre-rotation) can resolve content without a variableBinding -> registry
// -> qrcode import cycle.

export interface ClockResolveCtx {
  dates?: ChannelDates;
  now?: Date;
  secondaryOffset?: ClockOffset;
  tertiaryOffset?: ClockOffset;
}

/** Builds a ClockResolveCtx from the label's ^SO offsets. */
export function clockCtxFromLabel(
  label: Pick<LabelConfig, "secondaryClockOffset" | "tertiaryClockOffset">,
): ClockResolveCtx {
  return {
    secondaryOffset: label.secondaryClockOffset,
    tertiaryOffset: label.tertiaryClockOffset,
  };
}

/** Lazy channel dates for resolveMarkerChain: `new Date()` only runs when a
 *  clock marker actually exists. */
export function clockDatesThunk(clock?: ClockResolveCtx): () => ChannelDates {
  return () => clock?.dates ?? channelDatesFrom(
    clock?.now ?? new Date(),
    clock?.secondaryOffset,
    clock?.tertiaryOffset,
  );
}

/** Shared clock -> control -> variable order: field-own display markers first
 *  (a chip in substituted data stays literal, matching export). `getDates` is
 *  a thunk (Date only when a clock marker exists); `resolveCtrl` mirrors the
 *  emitter's capability gate. */
export function resolveMarkerChain(
  content: string,
  resolveVar: (name: string) => string | undefined,
  getDates: (() => ChannelDates) | null,
  resolveCtrl: boolean,
): string {
  let next = content;
  if (getDates) {
    if (hasClockMarkers(next)) next = resolveClockMarkers(next, getDates());
    if (resolveCtrl && hasControlMarkers(next)) next = resolveControlMarkers(next);
  }
  if (hasTemplateMarkers(next)) next = resolveTemplateMarkers(next, resolveVar);
  return next;
}

/** Resolve content to printable text as the canvas preview would (variables to
 *  their default, no CSV row), so builders can validate marker-bearing values.
 *  `resolveCtrl: false` keeps control chips literal for contexts whose emitter
 *  does too (the GS1 builder), preserving preview/export symmetry. */
export function resolveContentPreview(
  content: string,
  variables: readonly Variable[],
  clock?: ClockResolveCtx,
  opts?: { resolveCtrl?: boolean },
): string {
  const byName = new Map(variables.map((v) => [v.name, v]));
  return resolveMarkerChain(
    content,
    (name) => byName.get(name)?.defaultValue,
    clockDatesThunk(clock),
    opts?.resolveCtrl ?? true,
  );
}
