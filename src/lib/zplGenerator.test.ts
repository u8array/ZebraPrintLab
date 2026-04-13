import { describe, it, expect } from 'vitest';
import { generateZPL } from './zplGenerator';
import { parseZPL } from './zplParser';
import type { LabelConfig } from '../types/ObjectType';

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_LABEL: LabelConfig = {
  widthMm: 100,
  heightMm: 50,
  dpmm: 8,
};

// ── structure ─────────────────────────────────────────────────────────────────

describe('generateZPL — structure', () => {
  it('wraps output in ^XA and ^XZ', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.endsWith('^XZ')).toBe(true);
  });

  it('emits ^PW and ^LL for the label dimensions', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    // 100 mm * 8 dpmm = 800 dots
    expect(zpl).toContain('^PW800');
    // 50 mm * 8 dpmm = 400 dots
    expect(zpl).toContain('^LL400');
  });

  it('emits ^CI28 (UTF-8 encoding)', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    expect(zpl).toContain('^CI28');
  });

  it('does not emit ^PQ when printQuantity is absent', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    expect(zpl).not.toContain('^PQ');
  });

  it('does not emit ^PQ for quantity 1', () => {
    const zpl = generateZPL({ ...BASE_LABEL, printQuantity: 1 }, []);
    expect(zpl).not.toContain('^PQ');
  });

  it('emits ^PQ when printQuantity > 1', () => {
    const zpl = generateZPL({ ...BASE_LABEL, printQuantity: 3 }, []);
    expect(zpl).toContain('^PQ3');
  });

  it('emits ^MM media mode when set', () => {
    const zpl = generateZPL({ ...BASE_LABEL, mediaMode: 'T' }, []);
    expect(zpl).toContain('^MMT');
  });

  it('emits ^LS label shift when set', () => {
    const zpl = generateZPL({ ...BASE_LABEL, labelShift: 5 }, []);
    expect(zpl).toContain('^LS5');
  });
});

// ── object serialisation ──────────────────────────────────────────────────────

describe('generateZPL — text object', () => {
  it('emits ^FO, ^A0 and ^FD for a text object', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,0^FDHello^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^FO10,20');
    expect(zpl).toContain('^A0N,30,0');
    expect(zpl).toContain('^FDHello^FS');
  });
});

describe('generateZPL — box object', () => {
  it('emits ^GB for a box object', () => {
    const { objects } = parseZPL('^XA^FO10,20^GB200,100,3,B,0^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^GB200,100,3,B,0');
  });
});

describe('generateZPL — line object', () => {
  it('emits a horizontal ^GB line', () => {
    const { objects } = parseZPL('^XA^FO0,0^GB700,3,3^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^GB700,3,3');
  });
});

describe('generateZPL — code128 object', () => {
  it('emits ^BC and ^FD for a Code 128 barcode', () => {
    const { objects } = parseZPL('^XA^FO100,50^BCN,200,Y,N,N^FD12345678^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^BC');
    expect(zpl).toContain('^FD12345678^FS');
  });
});

// ── parse → generate → parse roundtrip ───────────────────────────────────────

describe('generateZPL — parse/generate roundtrip', () => {
  it('preserves object count through a roundtrip', () => {
    const original = parseZPL('^XA^FO10,20^A0N,30,0^FDHello^FS^FO10,60^GB200,5,5^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    expect(reparsed.objects).toHaveLength(original.objects.length);
  });

  it('preserves text content through a roundtrip', () => {
    const original = parseZPL('^XA^FO10,20^A0N,30,0^FDHello World^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const textObj = reparsed.objects.find((o) => o.type === 'text')!;
    expect((textObj.props as unknown as Record<string, unknown>)['content']).toBe('Hello World');
  });

  it('preserves barcode content and height through a roundtrip', () => {
    const original = parseZPL('^XA^FO50,50^BCN,150,Y,N,N^FD987654^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const barcode = reparsed.objects.find((o) => o.type === 'code128')!;
    expect((barcode.props as unknown as Record<string, unknown>)['content']).toBe('987654');
    expect((barcode.props as unknown as Record<string, unknown>)['height']).toBe(150);
  });
});
