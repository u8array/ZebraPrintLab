import type { Variable } from './Variable';
import type { LabelConfig } from './LabelConfig';

export interface TransformContext {
  /** Konva scaleX from the transform end. */
  sx: number;
  /** Konva scaleY from the transform end. */
  sy: number;
  /** Snaps a value to the user's grid (identity when snap is disabled). */
  snap: (n: number) => number;
  /** Konva node's intrinsic height after scale was reset. Only meaningful for stacked 2D. */
  nodeHeight: number;
  /** Captured at drag start; non-null only for stacked 2D barcodes. */
  anchor: { nodeHeight: number; rowHeight: number } | null;
}

/** Context passed to `toZPL` so leaf emit functions can reach
 *  label-wide state (default font ID, ^CW alias map, variables, etc.).
 *  Optional — most types ignore it; text/serial use it for the default
 *  font fallback, text/barcode emitters consult `variables` when an
 *  object's `variableId` is set. */
export interface ZplEmitContext {
  label: LabelConfig;
  /** Document-level variables. When a field carries `variableId` pointing
   *  at one of these, the emitter writes `^FN{n}^FD{default}^FS` so the
   *  printer treats the field as a template slot. */
  variables?: readonly Variable[];
  /** ^FE embed delimiter active for the current label. Defaults to `#`. */
  embedChar?: string;
  /** ^FC clock chars active for the current label. Defaults to `% { #`. */
  clockChars?: { date: string; time: string; tertiary: string };
}

/**
 * Per-type HRI (human-readable interpretation) rendering behaviour. All
 * fields are optional with sensible defaults: text is rendered below the
 * bars in raw form with the standard textGap. Each leaf overrides only
 * what differs from the baseline, keeping BarcodeObject type-agnostic
 * for the generic HRI path.
 *
 * @example See registry/logmars.tsx (text above + wider gap + check digit
 * formatter) and registry/upcEanExtension.tsx (text above + very tight gap).
 */
export interface HriBehavior {
  /** True when the HRI text sits above the bars (logmars spec, ^BS). */
  textAbove?: boolean;
  /** Gap in dots between the bar edge and the text glyph. Applies to
   *  both the upright above-bars gap AND the side gap on rotated R/B/I.
   *  Pass a function when the gap depends on moduleWidth (^BS). */
  aboveGapDots?: number | ((moduleWidth: number) => number);
  /** Transform raw content into the displayed HRI string. Default: identity. */
  formatHri?: (content: string) => string;
  /** HRI glyph ink height in dots as a function of moduleWidth, overriding
   *  the generic `moduleWidth * 10` formula. Use when the symbology uses
   *  discrete Font 0 magnification steps instead of continuous scaling
   *  (^BS supplement digits). */
  fontDots?: (moduleWidth: number) => number;
}
