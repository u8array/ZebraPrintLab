import { describe, it, expect } from 'vitest';
import { text } from './text';
import type { TextProps } from './text';
import type { LabelObjectBase } from '../types/LabelObject';

const baseObj = (
  overrides: Partial<TextProps> = {},
): LabelObjectBase & { props: TextProps } => ({
  id: 'test',
  type: 'text',
  x: 0,
  y: 0,
  rotation: 0,
  props: {
    content: 'ABC',
    fontHeight: 30,
    fontWidth: 0,
    rotation: 'N',
    ...overrides,
  },
});

/**
 * normalizeChanges strips the un-emit shape for ^FP so any prop-write
 * path (panel onChange, import, paste) lands on the same canonical
 * props. Anchors the round-trip guarantee documented in toZPL.
 */
describe('text — normalizeChanges ^FP un-emit shape', () => {
  it('drops explicit fpDirection="H" to undefined', () => {
    const obj = baseObj();
    const result = text.normalizeChanges?.(obj, { props: { fpDirection: 'H' } });
    expect((result?.props as Partial<TextProps>).fpDirection).toBeUndefined();
  });

  it('drops fpCharGap=0 to undefined', () => {
    const obj = baseObj();
    const result = text.normalizeChanges?.(obj, { props: { fpCharGap: 0 } });
    expect((result?.props as Partial<TextProps>).fpCharGap).toBeUndefined();
  });

  it('strips both fields in one patch', () => {
    const obj = baseObj();
    const result = text.normalizeChanges?.(obj, {
      props: { fpDirection: 'H', fpCharGap: 0 },
    });
    const props = result?.props as Partial<TextProps>;
    expect(props.fpDirection).toBeUndefined();
    expect(props.fpCharGap).toBeUndefined();
  });

  it('preserves non-default values', () => {
    const obj = baseObj();
    const result = text.normalizeChanges?.(obj, {
      props: { fpDirection: 'V', fpCharGap: 5 },
    });
    expect((result?.props as Partial<TextProps>).fpDirection).toBe('V');
    expect((result?.props as Partial<TextProps>).fpCharGap).toBe(5);
  });

  it('returns the original changes object when nothing needs normalizing', () => {
    const obj = baseObj();
    const changes = { props: { fontHeight: 40 } };
    const result = text.normalizeChanges?.(obj, changes);
    expect(result).toBe(changes);
  });

  it('is a no-op when changes.props is absent', () => {
    const obj = baseObj();
    const changes = { x: 10 };
    const result = text.normalizeChanges?.(obj, changes);
    expect(result).toBe(changes);
  });
});
