import { describe, it, expect } from 'vitest';
import { code128 } from './code128';
import { parseZPL } from '../lib/zplParser';
import { generateZPL } from '../lib/zplGenerator';
import { GS1_SAMPLE_CONTENT, elementStringToContent } from '../lib/gs1';
import { PALETTE_PRESET_IDS } from './palettePresets';
import type { LabelConfig } from '../types/LabelConfig';
import type { LabelObject } from '../types/Group';

const LABEL: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 };

const baseProps = {
  content: GS1_SAMPLE_CONTENT,
  height: 100,
  moduleWidth: 2,
  printInterpretation: true,
  printInterpretationAbove: false,
  checkDigit: false,
  rotation: 'N' as const,
};

const mk = (props: object): LabelObject =>
  ({ id: 'c', type: 'code128', x: 10, y: 10, rotation: 0, props }) as unknown as LabelObject;

const propsOf = (o: unknown) => (o as { props: { gs1?: boolean; content: string } }).props;

describe('GS1-128 (code128 gs1 mode)', () => {
  it('emits ^BC..,D with the parenthesized element string as ^FD', () => {
    const zpl = code128.toZPL(mk({ ...baseProps, gs1: true }) as never);
    expect(zpl).toContain('^BCN,100,Y,N,N,D');
    expect(zpl).toContain('^FD(01)09501101530003^FS');
  });

  it('omits the mode flag and sends raw content when gs1 is off', () => {
    const zpl = code128.toZPL(mk({ ...baseProps, gs1: false, content: '12345678' }) as never);
    expect(zpl).toContain('^BCN,100,Y,N,N^FD12345678^FS');
    expect(zpl).not.toContain(',D^FD');
  });

  it('parses ^BC..,D as gs1 with canonical (unparenthesized) content', () => {
    const { objects } = parseZPL('^XA^FO10,10^BCN,100,Y,N,N,D^FD(01)09501101530003^FS^XZ', 8);
    expect((objects[0] as { type: string }).type).toBe('code128');
    expect(propsOf(objects[0]).gs1).toBe(true);
    expect(propsOf(objects[0]).content).toBe(GS1_SAMPLE_CONTENT);
  });

  it('parses a plain ^BC as non-gs1', () => {
    const { objects } = parseZPL('^XA^FO10,10^BCN,100,Y,N,N^FD12345678^FS^XZ', 8);
    expect(propsOf(objects[0]).gs1).toBeFalsy();
    expect(propsOf(objects[0]).content).toBe('12345678');
  });

  it('round-trips gs1 mode + content through generate->parse', () => {
    const zpl = generateZPL(LABEL, [mk({ ...baseProps, gs1: true })]);
    const { objects } = parseZPL(zpl, LABEL.dpmm);
    expect(propsOf(objects[0]).gs1).toBe(true);
    expect(propsOf(objects[0]).content).toBe(GS1_SAMPLE_CONTENT);
  });

  it('round-trips a multi-AI payload with a GS separator', () => {
    const canonical = elementStringToContent('(01)09501101530003(10)LOT123(21)SER456');
    expect(canonical).not.toBeNull();
    const zpl = generateZPL(LABEL, [mk({ ...baseProps, gs1: true, content: canonical! })]);
    expect(zpl).toContain('^FD(01)09501101530003(10)LOT123(21)SER456^FS');
    const { objects } = parseZPL(zpl, LABEL.dpmm);
    expect(propsOf(objects[0]).gs1).toBe(true);
    expect(propsOf(objects[0]).content).toBe(canonical);
  });

  it('fdTransform emits the element-string form (CSV / single-bind path)', () => {
    const transform = code128.fdTransform?.(mk({ ...baseProps, gs1: true }) as never);
    expect(transform).toBeTypeOf('function');
    expect(transform!(GS1_SAMPLE_CONTENT)).toBe('(01)09501101530003');
  });

  it('registers the GS1-128 palette preset', () => {
    expect(PALETTE_PRESET_IDS).toContain('code128-gs1');
  });
});
