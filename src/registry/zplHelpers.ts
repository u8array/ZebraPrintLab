import type { LabelObjectBase } from '../types/ObjectType';

/** Emit `^FT` or `^FO` depending on how the object was originally positioned. */
export function fieldPos(obj: LabelObjectBase): string {
  const cmd = obj.positionType === 'FT' ? 'FT' : 'FO';
  return `^${cmd}${obj.x},${obj.y}`;
}
