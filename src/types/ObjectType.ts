import type React from 'react';
import type { LabelObjectBase, ObjectChanges, ObjectGroup } from './LabelObject';
import type { HriBehavior, TransformContext, ZplEmitContext } from './ZplEmit';

/** Domain half of a registry entry: emits ZPL, no React deps. */
export interface ObjectTypeCore<P extends object = object> {
  label: string;
  icon: string;
  group: ObjectGroup;
  defaultProps: P;
  /** Default footprint at palette-drop time. Two shapes:
   *    `{ width, height }`       in dots (most types: an editor
   *                              default chosen for visual size,
   *                              not a spec quantity)
   *    `{ widthMm, heightMm }`   in millimetres (spec-fixed
   *                              physical-size types like Maxicode,
   *                              where the printed footprint is set
   *                              by the symbology spec regardless
   *                              of dpmm)
   *  The palette resolves the active variant against the current
   *  label's dpmm so centring works at any resolution. */
  defaultSize:
    | { width: number; height: number }
    | { widthMm: number; heightMm: number };
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
}

/** UI half: the per-type PropertiesPanel React component. Lives in
 *  `<type>.panel.tsx` so the domain `.ts` stays React-free. */
export interface ObjectTypeUi<P extends object = object> {
  PropertiesPanel: React.ComponentType<{
    obj: LabelObjectBase & { props: P };
    onChange: (props: Partial<P>) => void;
  }>;
}

/** Combined Core+Ui shape, used at the palette boundary where both halves
 *  are needed together (e.g. `defaultSize` lookup from `ObjectPalette`). */
export type ObjectTypeDefinition<P extends object = object> = ObjectTypeCore<P> & ObjectTypeUi<P>;
