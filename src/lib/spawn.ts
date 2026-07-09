import { getEntry } from '../registry';
import { getStepRotation, zplRotationForView, type ZplRotation } from '../registry/rotation';
import { objectBoundsDots, type ObjectBoundsCtx } from './objectBounds';
import type { LabelConfig } from '../types/LabelConfig';
import type { LabelObject } from '../types/Group';

type ViewRotation = 0 | 90 | 180 | 270;

/** Props patch so a palette spawn lands upright in a rotated canvas view.
 *  Only step-rotation types (text, barcodes) qualify; shapes/lines/images have
 *  no reading direction. An explicit rotation in the caller's override wins.
 *  Shared by the store spawn and the drag ghost so the preview matches the
 *  dropped object. */
export function spawnRotationOverride(
  type: string,
  propsOverride: object | undefined,
  view: ViewRotation,
): { rotation: ZplRotation } | undefined {
  if (view === 0) return undefined;
  if (propsOverride && 'rotation' in propsOverride) return undefined;
  const def = getEntry(type);
  if (!def || getStepRotation({ type, props: def.defaultProps }) === null) return undefined;
  return { rotation: zplRotationForView(view) };
}

/** Anchor position that puts the spawned object's visual center at `at`.
 *  The center is the only pointer anchor that stays put across view and field
 *  rotations (the model anchor corner wanders per rotation), so the ghost sits
 *  under the cursor the same way in every view. Bounds come from the same
 *  objectBoundsDots the canvas reasons with, including the spawn rotation the
 *  store will apply. Barcode/text size isn't computable upfront, so pass the
 *  live drag ghost's measured footprint (keyed by `measured.id`) to center on
 *  the real rendered size; without it the upright registry fallback is used.
 *  Null for unknown types. */
export function centeredSpawnAnchor(
  type: string,
  propsOverride: object | undefined,
  at: { x: number; y: number },
  label: LabelConfig,
  view: ViewRotation,
  measured?: { footprints: ObjectBoundsCtx['measured']; id: string },
): { x: number; y: number } | null {
  const def = getEntry(type);
  if (!def) return null;
  const props = {
    ...def.defaultProps,
    ...propsOverride,
    ...spawnRotationOverride(type, propsOverride, view),
  };
  const b = objectBoundsDots(
    { id: measured?.id ?? '__spawn__', type, x: 0, y: 0, rotation: 0, props } as LabelObject,
    { label, measured: measured?.footprints },
  );
  return {
    x: Math.round(at.x - b.x - b.width / 2),
    y: Math.round(at.y - b.y - b.height / 2),
  };
}
