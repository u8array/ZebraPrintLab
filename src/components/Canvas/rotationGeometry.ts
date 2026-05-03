export type ViewRotation = 0 | 90 | 180 | 270;

/**
 * Applies the inverse of a clockwise screen-space rotation to a delta vector.
 * Used to map screen-space pointer/key directions back into label coordinates
 * when the canvas is viewed at a non-zero rotation.
 */
export function inverseRotateDelta(
  dx: number,
  dy: number,
  rotation: ViewRotation,
): [number, number] {
  // `+ 0` normalizes -0 to 0 so equality assertions don't surprise callers.
  switch (rotation) {
    case 0:   return [dx, dy];
    case 90:  return [dy, -dx + 0];
    case 180: return [-dx + 0, -dy + 0];
    case 270: return [-dy + 0, dx];
  }
}

/** True when the view rotation swaps the visible width/height axes. */
export function isAxisSwapped(rotation: ViewRotation): boolean {
  return rotation === 90 || rotation === 270;
}

/**
 * Whether the visual horizontal/vertical axes point opposite to label-space
 * coordinates at the given view rotation. Used by rulers and any consumer
 * that displays values along a screen-space axis derived from a label-space
 * axis.
 */
export function axisReversal(rotation: ViewRotation): {
  horizontal: boolean;
  vertical: boolean;
} {
  return {
    horizontal: rotation === 90 || rotation === 180,
    vertical: rotation === 180 || rotation === 270,
  };
}

/** The next 90° clockwise step. */
export function nextRotation(rotation: ViewRotation): ViewRotation {
  return ((rotation + 90) % 360) as ViewRotation;
}
