import { useLabelStore } from "./labelStore";
import {
  buildActiveCsvRow,
  clockCtxFromLabel,
  resolveContentPreview,
  type ActiveCsvRow,
  type ClockResolveCtx,
} from "../lib/variableBinding";
import type { Variable } from "../types/Variable";

export interface PreviewBinding {
  variables: readonly Variable[];
  /** Active CSV row, or null without a dataset/mapping. */
  active: ActiveCsvRow | null;
  /** Label-level ^SO2/^SO3 clock offsets. */
  clock: ClockResolveCtx;
  /** Content string -> its builder-preview substitution: variable DEFAULTS +
   *  label clock, explicitly NO CSV row (the builders' validation semantics).
   *  Named to keep it from being mistaken for an `active`-aware resolver. */
  resolveDefaults: (content: string, opts?: { resolveCtrl?: boolean }) => string;
}

/** The one seam for "what would this print": every preview consumer (builders,
 *  canvas, preflight) derives the same binding context from the store here
 *  instead of assembling variables/CSV/clock ad hoc per call site. */
export function usePreviewBinding(): PreviewBinding {
  const variables = useLabelStore((s) => s.variables);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const label = useLabelStore((s) => s.label);
  const active = buildActiveCsvRow(csvDataset, csvMapping);
  const clock = clockCtxFromLabel(label);
  return {
    variables,
    active,
    clock,
    resolveDefaults: (content, opts) => resolveContentPreview(content, variables, clock, opts),
  };
}
