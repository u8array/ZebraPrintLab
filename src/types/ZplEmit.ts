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

export interface ZplEmitContext {
  label: LabelConfig;
  /** Bound field emits `^FN{n}^FD{default}^FS`. */
  variables?: readonly Variable[];
  /** ^FE delimiter; default `#`. */
  embedChar?: string;
  /** ^FC chars; defaults `% { #`. */
  clockChars?: { date: string; time: string; tertiary: string };
}

/** Per-type HRI overrides; defaults render text below bars in raw form. */
export interface HriBehavior {
  /** HRI sits above bars (logmars, ^BS). */
  textAbove?: boolean;
  /** Bar-to-text gap in dots; function form for moduleWidth dependence (^BS). */
  aboveGapDots?: number | ((moduleWidth: number) => number);
  /** Transform raw content for display; default identity. */
  formatHri?: (content: string) => string;
  /** Override generic `moduleWidth * 10` for discrete Font 0 steps (^BS). */
  fontDots?: (moduleWidth: number) => number;
}
