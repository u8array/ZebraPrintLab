import type React from 'react';
import { z } from 'zod';
import type { Variable } from './Variable';

/** A single font mapping. Three row shapes are supported so the editor
 *  can stay 1:1 with what the printer renders:
 *
 *  1. **Printer-resident custom font** — `path` set, optional
 *     `previewFontName`. Emits `^CW{alias},{path}` so the printer
 *     resolves `^A{alias}` against the path. With `previewFontName`
 *     also set the canvas renders that TTF; with `embedInZpl` true the
 *     TTF bytes ship in the ZPL stream via `~DY`.
 *  2. **Built-in font preview binding** — alias is one of `0` / `A-H`
 *     (the fonts every Zebra printer ships with), `path` left empty,
 *     `previewFontName` points at an uploaded TTF. No `^CW` is emitted;
 *     the binding is cosmetic so the canvas can show what the built-in
 *     glyphs actually look like.
 *  3. **Manual printer-resident font** — `path` set, no upload. User
 *     declares "this alias maps to a file already on the printer";
 *     canvas falls back to PrintLab ZPL because it has no bytes.
 *
 *  Both `path` and `previewFontName` allow empty strings: while the user
 *  is editing a fresh row the value may transiently be blank, and we
 *  want that state to survive a persist/rehydrate round-trip so the
 *  reload lands on the same row instead of dropping it. Completeness
 *  ("at least one of the two is non-empty") is enforced at emit time
 *  via the existing `if (m.alias && m.path)` guards in zplGenerator —
 *  not as a schema-level refine, because the schema fronts the
 *  persisted store and the store has to allow in-progress edits. */
export const customFontMappingSchema = z
  .object({
    alias: z.string().regex(/^[A-Z0-9]$/),
    path: z.string().optional(),
    previewFontName: z.string().optional(),
    embedInZpl: z.boolean().optional(),
  })
  .refine((m) => !m.embedInZpl || (!!m.path && !!m.previewFontName), {
    message:
      "embedInZpl requires both a printer path (~DY target) and a preview TTF (~DY bytes)",
  });
export type CustomFontMapping = z.infer<typeof customFontMappingSchema>;

export const labelConfigSchema = z.object({
  widthMm: z.number(),
  heightMm: z.number(),
  dpmm: z.number(),
  printQuantity: z.number().optional(),
  /** ^PQ p2: pause every N labels (0 = none). */
  pauseCount: z.number().int().min(0).max(99999999).optional(),
  /** ^PQ p3: replicates of each serialised label. */
  replicates: z.number().int().min(0).max(99999999).optional(),
  /** ^PQ p4: override pause count (cutter behaviour). */
  overridePauseCount: z.enum(['Y', 'N']).optional(),
  mediaMode: z.enum(['T', 'V', 'D', 'K']).optional(),
  labelShift: z.number().optional(),
  /** ^LH x: horizontal origin offset emitted at export. Field FOs are
   *  shifted accordingly so the on-screen layout equals the print result. */
  labelHomeX: z.number().int().min(0).optional(),
  /** ^LH y: vertical origin offset emitted at export. See labelHomeX. */
  labelHomeY: z.number().int().min(0).optional(),
  /** ^LT y: label top shift emitted at export. Same compensation semantics
   *  as labelHomeY. Zebra supports -120..+120. */
  labelTop: z.number().int().min(-120).max(120).optional(),
  printSpeed: z.number().int().min(2).max(14).optional(),
  /** ^PR p2: slew (inter-label) speed. */
  slewSpeed: z.number().int().min(2).max(14).optional(),
  /** ^PR p3: backfeed speed. */
  backfeedSpeed: z.number().int().min(2).max(14).optional(),
  darkness: z.number().int().min(-30).max(30).optional(),
  /** ~SD: instant darkness set, emitted before ^XA. 0-30. */
  instantDarkness: z.number().int().min(0).max(30).optional(),
  mediaType: z.enum(['T', 'D']).optional(),
  printOrientation: z.enum(['N', 'I']).optional(),
  /** ^PM: mirror image (left/right flip). */
  mirror: z.enum(['Y', 'N']).optional(),
  defaultFontId: z.string().min(1).optional(),
  defaultFontHeight: z.number().int().positive().optional(),
  /** ^CF width param. Spec allows 0 → printer auto-derives from height. */
  defaultFontWidth: z.number().int().min(0).optional(),
  /** ^CW alias→path mappings emitted at the top of the label. Each entry
   *  registers a single-char identifier ([A-Z0-9]) that ^A{alias} fields
   *  can reference instead of the verbose ^A@…E:font.TTF form. */
  customFonts: z.array(customFontMappingSchema).optional(),
});

export type LabelConfig = z.infer<typeof labelConfigSchema>;

/** Common fields shared by every label object, without the typed `props`. */
export const labelObjectBaseSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  /** 'FT' = field typeset (baseline), 'FO' = field origin (top-left). Defaults to 'FO'. */
  positionType: z.enum(['FO', 'FT']).optional(),
  /** Emitted as ^FX before this field in ZPL output. Carries no print output. */
  comment: z.string().optional(),
  /** When true, blocks position/size/prop edits, drag, resize and deletion.
   *  Editor still allows selection and toggling of locked/visible/includeInExport
   *  themselves so the lock can be released. Persisted; not exported to ZPL. */
  locked: z.boolean().optional(),
  /** When false, the object is omitted from the canvas render. Distinct from
   *  includeInExport so a designer can hide reference geometry while still
   *  shipping it. Defaults to true. */
  visible: z.boolean().optional(),
  /** When false, the object is skipped during ZPL generation. Distinct from
   *  visible so a designer can preview placement without shipping. Defaults
   *  to true. */
  includeInExport: z.boolean().optional(),
  /** Optional user-supplied label. Used by groups so the layers panel and
   *  properties panel can show "Header" instead of the generic "Group".
   *  Leaves currently fall back to their registry label; the field lives
   *  on the base so naming leaves later is a UI-only change. */
  name: z.string().optional(),
  /** When set, the field's render/export content comes from the referenced
   *  Variable's defaultValue (or future data source). The field's own
   *  content prop is kept as fallback when the binding is removed.
   *  Exported as `^FN{n}^FD{default}^FS` instead of plain `^FD{content}^FS`. */
  variableId: z.string().optional(),
});

export type LabelObjectBase = z.infer<typeof labelObjectBaseSchema>;

export type ObjectChanges = Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object };

export type ObjectGroup = 'text' | 'code-1d' | 'code-2d' | 'code-postal' | 'shape';

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
 *  object's `variableId` is set. Tests calling `toZPL` directly can omit
 *  `ctx` and get the no-binding / no-default-context branches. */
export interface ZplEmitContext {
  label: LabelConfig;
  /** Document-level variables. When a field carries `variableId` pointing
   *  at one of these, the emitter writes `^FN{n}^FD{default}^FS` so the
   *  printer treats the field as a template slot. Absent / empty: every
   *  field emits its own literal content. */
  variables?: readonly Variable[];
  /** ^FE embed delimiter active for the current label. Defaults to `#`
   *  (ZPL's own default). Set by the label-level emitter when it picks
   *  an alternate char to avoid colliding with literal payload text;
   *  per-leaf emitters consult it when translating `«name»` markers
   *  back to `#n#` embed syntax. */
  embedChar?: string;
  /** ^FC clock chars active for the current label. Defaults to
   *  `% { #`; the label-level emitter picks an alternate triple when
   *  defaults clash with literal payload text. Per-leaf emitters
   *  consult it when translating `«clock:T»` markers back to
   *  `<char><T>` token syntax. Absent when no field carries clock
   *  markers — fdFieldFor leaves them literal in that case. */
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
 * formatter) and registry/upcEanExtension.tsx (text above + very tight gap)
 * for the canonical patterns.
 */
export interface HriBehavior {
  /** True when the HRI text sits above the bars (logmars spec, ^BS).
   *  Default: false. */
  textAbove?: boolean;
  /** Gap in dots between the bar edge and the text glyph. Applies to
   *  both the upright above-bars gap AND the side gap on rotated
   *  R/B/I, so a tighter ^BS (2) stays tight after rotation while
   *  logmars (10) keeps its wider air gap. Below-bars upright always
   *  uses the global textGap regardless of this value. */
  aboveGapDots?: number;
  /** Transform raw content into the displayed HRI string (add check
   *  digit, wrap with start/stop chars, pad, …). Default: identity. */
  formatHri?: (content: string) => string;
}

export interface ObjectTypeDefinition<P extends object = object> {
  label: string;
  icon: string;
  group: ObjectGroup;
  defaultProps: P;
  defaultSize: { width: number; height: number };
  /**
   * True if the rendered height is fixed by the symbology spec rather than the
   * `height` prop (e.g. GS1 Databar Omnidirectional). The transformer disables
   * its height anchors and the properties panel renders the height input as
   * read-only — both reflect that the value cannot influence the print output.
   */
  heightLocked?: boolean;
  /**
   * True if the symbology has no human-readable interpretation in ZPL output
   * (e.g. GS1 Databar — `^BR` exposes no HRI parameter and Labelary never
   * renders text). The properties panel hides the checkbox and the canvas
   * renderer suppresses the text so the designer matches the print output.
   */
  interpretationLocked?: boolean;
  /**
   * True when the type emits a ^FD content block via `fdFieldFor` and can
   * therefore be bound to a Variable. The Properties panel uses this to
   * decide whether to render the bind-to-variable control. Mirrors which
   * registry modules actually wire fdFieldFor in their toZPL — keep them
   * in sync.
   */
  bindable?: boolean;
  /**
   * Marks types whose resize must keep a 1:1 aspect ratio. The transformer
   * restricts to corner anchors and forces the resize bbox to stay square,
   * so visual feedback during drag matches the uniform `commitTransform`
   * applied on release. A predicate form supports per-instance opt-in
   * (e.g. ellipse with `lockAspect: true`); `true` applies to every
   * instance of the type (e.g. QR / DataMatrix).
   */
  uniformScale?: boolean | ((props: P) => boolean);
  toZPL: (obj: LabelObjectBase & { props: P }, ctx?: ZplEmitContext) => string;
  /**
   * Optional hook to enforce type-specific invariants on incoming changes
   * (e.g. clamp out-of-range coordinates). Called before changes are merged
   * into the object. Pure function — should not have side effects.
   */
  normalizeChanges?: (
    obj: LabelObjectBase & { props: P },
    changes: ObjectChanges,
  ) => ObjectChanges;
  /**
   * Optional. Converts a Konva Transformer scale operation into prop changes
   * specific to this object type. Called on transform end. If absent, the
   * object's position is still updated but its size/scale props stay unchanged.
   * Pure function — should not have side effects.
   */
  commitTransform?: (
    obj: LabelObjectBase & { props: P },
    ctx: TransformContext,
  ) => Partial<P>;
  /** See {@link HriBehavior}. Only meaningful for 1D barcode types
   *  that render an HRI text overlay; other types should leave this
   *  undefined. */
  hri?: HriBehavior;
  PropertiesPanel: React.ComponentType<{
    obj: LabelObjectBase & { props: P };
    onChange: (props: Partial<P>) => void;
  }>;
}
