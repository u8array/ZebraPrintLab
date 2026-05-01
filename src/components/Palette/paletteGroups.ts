import type { ObjectGroup } from '../../types/ObjectType';

export const PALETTE_GROUPS = [
  { key: 'text' as ObjectGroup, labelKey: 'groupText' },
  { key: 'code-1d' as ObjectGroup, labelKey: 'groupCode1d' },
  { key: 'code-2d' as ObjectGroup, labelKey: 'groupCode2d' },
  { key: 'code-postal' as ObjectGroup, labelKey: 'groupCodePostal' },
  { key: 'shape' as ObjectGroup, labelKey: 'groupShapes' },
] as const;

export type PaletteGroupLabelKey = typeof PALETTE_GROUPS[number]['labelKey'];
