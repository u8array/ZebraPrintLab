import { describe, it, expect } from 'vitest';
import { commitUniformScaleTransform } from './transformHelpers';
import type { LabelObjectBase, TransformContext } from '../types/ObjectType';

const ctx = (sx: number, sy: number): TransformContext => ({
  sx, sy, snap: (n) => n, nodeHeight: 0, anchor: null,
});

interface Sample { magnification: number }
const obj = (mag: number): LabelObjectBase & { props: Sample } => ({
  id: 'id', type: 'sample', x: 0, y: 0, rotation: 0, props: { magnification: mag },
});

describe('commitUniformScaleTransform', () => {
  const handler = commitUniformScaleTransform('magnification', 1, 10);

  it('scales by min(sx, sy) so non-uniform drags stay inside the box', () => {
    expect(handler(obj(4), ctx(2, 1.5))).toEqual({ magnification: 6 });
    expect(handler(obj(4), ctx(1.5, 2))).toEqual({ magnification: 6 });
  });

  it('rounds to integer module sizes', () => {
    expect(handler(obj(3), ctx(1.4, 1.4))).toEqual({ magnification: 4 });
  });

  it('clamps to the configured maximum', () => {
    expect(handler(obj(8), ctx(3, 3))).toEqual({ magnification: 10 });
  });

  it('clamps to the configured minimum (collapsing drags)', () => {
    expect(handler(obj(4), ctx(0, 0))).toEqual({ magnification: 1 });
  });
});
