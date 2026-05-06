/**
 * ZPL field orientation. The single letter that follows a barcode/text
 * command in ZPL: N (normal, 0°), R (rotated 90° CW), I (inverted 180°),
 * B (bottom-up 270°).
 */
export type ZplRotation = 'N' | 'R' | 'I' | 'B';

export const ZPL_ROTATIONS: readonly ZplRotation[] = ['N', 'R', 'I', 'B'] as const;

export function isZplRotation(value: string): value is ZplRotation {
  return value === 'N' || value === 'R' || value === 'I' || value === 'B';
}
