import type React from 'react';
import type { LabelObjectBase, ObjectChanges, ObjectGroup } from './LabelObject';
import type { HriBehavior, TransformContext, ZplEmitContext } from './ZplEmit';

/** Domain half of a registry entry: emits ZPL, no React deps. */
export interface ObjectTypeCore<P extends object = object> {
  label: string;
  icon: string;
  /** Primary ZPL command this type emits (e.g. `^BC`, `^GB`, `^A`). Single
   *  source for the palette's power-user command icon. */
  zplCmd?: string;
  /** Per-object override of `zplCmd` for types whose command depends on props
   *  (e.g. a line emits `^GB` axis-aligned but `^GD` diagonal). Falls back to
   *  `zplCmd` when absent. */
  zplCmdFor?: (obj: LabelObjectBase & { props: P }) => string;
  group: ObjectGroup;
  defaultProps: P;
  /** Drop footprint: dots (editor default) or mm (spec-fixed types
   *  like Maxicode). Palette resolves against current label dpmm. */
  defaultSize:
    | { width: number; height: number }
    | { widthMm: number; heightMm: number };
  /** Height fixed by symbology spec; disables transformer height anchors. */
  heightLocked?: boolean;
  /** Symbology has no HRI in ZPL output; hides checkbox + suppresses overlay. */
  interpretationLocked?: boolean;
  /** Emits ^FD via fdFieldFor; enables bind-to-variable control. */
  bindable?: boolean;
  /** 1:1 aspect-locked free resize (ellipse with lockAspect). For
   *  integer-module 2D symbologies use uniformScaleProp instead. */
  uniformScale?: boolean | ((props: P) => boolean);
  /** Integer-module 2D symbology (QR/Aztec/DataMatrix): drives drag-time
   *  module snap and release-time commit from one prop spec; implies
   *  uniformScale (the canvas is square by construction). */
  uniformScaleProp?: { name: keyof P & string; min: number; max: number };
  /** ^BY moduleWidth lower bound for stacked-2D resize (default 1); CODABLOCK A
   *  requires 2. Drives both the drag-time snap and the release commit. */
  moduleWidthMin?: number;
  toZPL: (obj: LabelObjectBase & { props: P }, ctx?: ZplEmitContext) => string;
  /** Optional ^FD payload transform (QR `{ec}A,` prefix, UPC-E compaction, GS1
   *  FNC1 escaping). Returned per object so the single emit AND the CSV batch
   *  ^FN override apply the same transform; undefined when none applies. */
  fdTransform?: (
    obj: LabelObjectBase & { props: P },
  ) => ((payload: string) => string) | undefined;
  /** Pure hook for type-specific clamp/invariant on incoming changes. */
  normalizeChanges?: (
    obj: LabelObjectBase & { props: P },
    changes: ObjectChanges,
  ) => ObjectChanges;
  /** Pure hook: maps Konva Transformer scale to prop changes on transform end. */
  commitTransform?: (
    obj: LabelObjectBase & { props: P },
    ctx: TransformContext,
  ) => Partial<P>;
  /** Only for 1D barcodes with an HRI overlay; see {@link HriBehavior}. */
  hri?: HriBehavior;
}

/** Lives in `<type>.panel.tsx` so the domain `.ts` stays React-free. */
export interface ObjectTypeUi<P extends object = object> {
  PropertiesPanel: React.ComponentType<{
    obj: LabelObjectBase & { props: P };
    onChange: (props: Partial<P>) => void;
  }>;
}

export type ObjectTypeDefinition<P extends object = object> = ObjectTypeCore<P> & ObjectTypeUi<P>;
