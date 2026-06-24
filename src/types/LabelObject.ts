import { z } from 'zod';

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
   *  Leaves fall back to their registry label; the field is on the base
   *  so adding leaf naming would not need a schema change. */
  name: z.string().optional(),
  /** When set, the field's render/export content resolves through the
   *  referenced Variable (defaultValue today). The field's own content
   *  prop is kept as fallback when the binding is removed. Exported
   *  as `^FN{n}^FD{default}^FS` instead of plain `^FD{content}^FS`. */
  variableId: z.string().optional(),
  /** Lossless round-trip provenance: set once an imported object diverges from
   *  its source bytes, so the page overlay regenerates it instead of replaying
   *  the original segment verbatim. Absent for net-new and untouched objects.
   *  Stamped centrally by the dirtyTracking store middleware. Transient state,
   *  so a corrupt persisted value drops to undefined rather than failing the
   *  whole design-file load. */
  dirty: z.boolean().optional().catch(undefined),
});

export type LabelObjectBase = z.infer<typeof labelObjectBaseSchema>;

export type ObjectChanges = Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object };

export type ObjectGroup = 'text' | 'code-1d' | 'code-2d' | 'code-postal' | 'shape';
