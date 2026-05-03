import type React from 'react';
import { z } from 'zod';

export const labelConfigSchema = z.object({
  widthMm: z.number(),
  heightMm: z.number(),
  dpmm: z.number(),
  printQuantity: z.number().optional(),
  mediaMode: z.enum(['T', 'V', 'D', 'K']).optional(),
  labelShift: z.number().optional(),
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
   * Origin of the Konva node used to render this type. Defaults to 'top-left'.
   * Set to 'center' for shapes whose Konva counterpart positions by their
   * center (e.g. Ellipse), so the transformer can convert the node coordinate
   * back to the model's top-left convention.
   */
  nodeOrigin?: 'center' | 'top-left';
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
