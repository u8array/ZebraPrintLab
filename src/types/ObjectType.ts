import type React from 'react';
import { z } from 'zod';

/** A single ^CW mapping: a 1-character alias [A-Z0-9] paired with a font
 *  path on the printer's storage (e.g. "E:ARIAL.TTF"). */
export const customFontMappingSchema = z.object({
  alias: z.string().regex(/^[A-Z0-9]$/),
  path: z.string().min(1),
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
   * Marks types whose resize must keep a 1:1 aspect ratio. The transformer
   * restricts to corner anchors and forces the resize bbox to stay square,
   * so visual feedback during drag matches the uniform `commitTransform`
   * applied on release. A predicate form supports per-instance opt-in
   * (e.g. ellipse with `lockAspect: true`); `true` applies to every
   * instance of the type (e.g. QR / DataMatrix).
   */
  uniformScale?: boolean | ((props: P) => boolean);
  toZPL: (obj: LabelObjectBase & { props: P }) => string;
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
  PropertiesPanel: React.ComponentType<{
    obj: LabelObjectBase & { props: P };
    onChange: (props: Partial<P>) => void;
  }>;
}
