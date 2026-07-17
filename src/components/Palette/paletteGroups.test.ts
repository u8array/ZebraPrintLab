import { describe, it, expect } from 'vitest';
import { symbologyGroupsFor } from './paletteGroups';
import { symbologyTargets } from '../../lib/symbologySwitch';
import en from '../../locales/en';
import type { LabelObject } from '@zplab/core/types/Group';

const barcode = (type: string, content: string): LabelObject =>
  ({ id: 'x', type, x: 0, y: 0, rotation: 0, props: { content } }) as unknown as LabelObject;

describe('symbologyGroupsFor', () => {
  it('groups in palette order, resolves labels, drops empty groups', () => {
    const groups = symbologyGroupsFor(symbologyTargets(barcode('code128', '')), en);
    expect(groups.map((g) => g.key)).toEqual(['code-1d', 'code-2d', 'legacy']);
    const oneD = groups.find((g) => g.key === 'code-1d');
    expect(oneD?.types.find((t) => t.type === 'code39')?.label).toBe('Code 39');
    expect(oneD?.types.every((t) => !t.disabled)).toBe(true);
  });

  it('carries disabled + a localized reason tooltip from the target list', () => {
    const groups = symbologyGroupsFor(symbologyTargets(barcode('code128', 'ABC-abc')), en);
    const ean13 = groups.flatMap((g) => g.types).find((t) => t.type === 'ean13');
    expect(ean13?.disabled).toBe(true);
    expect(ean13?.tooltip).toBe(en.registry.symbologySwitch.digitsOnly);
  });

  it('returns no barcode groups for a non-barcode object', () => {
    expect(symbologyGroupsFor(symbologyTargets(barcode('text', 'hi')), en)).toEqual([]);
  });
});
