import { getEntry } from '../registry';
import { getStepRotation, zplRotationForView, type ZplRotation } from '../registry/rotation';

/** Props patch so a palette spawn lands upright in a rotated canvas view.
 *  Only step-rotation types (text, barcodes) qualify; shapes/lines/images have
 *  no reading direction. An explicit rotation in the caller's override wins.
 *  Shared by the store spawn and the drag ghost so the preview matches the
 *  dropped object. */
export function spawnRotationOverride(
  type: string,
  propsOverride: object | undefined,
  view: 0 | 90 | 180 | 270,
): { rotation: ZplRotation } | undefined {
  if (view === 0) return undefined;
  if (propsOverride && 'rotation' in propsOverride) return undefined;
  const def = getEntry(type);
  if (!def || getStepRotation({ type, props: def.defaultProps }) === null) return undefined;
  return { rotation: zplRotationForView(view) };
}
