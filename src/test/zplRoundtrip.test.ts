/**
 * Golden round-trip tests: parse → generate → re-parse.
 *
 * These act as regression anchors for the parser/generator pair.
 * They do not test pixel-exact ZPL byte output (which is covered by
 * zplGenerator.test.ts), but verify that the object graph survives a
 * full round-trip without structural loss.
 */
import { describe, it, expect } from 'vitest';
import { parseZPL } from '../lib/zplParser';
import { generateZPL } from '../lib/zplGenerator';
import type { LabelConfig } from '../types/ObjectType';

const BASE: LabelConfig = { widthMm: 100, heightMm: 60, dpmm: 8 };

// ── helpers ─────────────────────────────────────────────────────────────────

const props = (obj: { props: unknown } | undefined): Record<string, unknown> =>
  (obj?.props ?? {}) as Record<string, unknown>;

function roundtrip(zpl: string, dpmm = 8) {
  const first = parseZPL(zpl, dpmm);
  // BASE provides fallbacks for labels that omit ^PW/^LL; dpmm always wins over any parsed value
  const label: LabelConfig = { ...BASE, ...first.labelConfig, dpmm };
  const regenerated = generateZPL(label, first.objects);
  const second = parseZPL(regenerated, dpmm);
  return { first, second, label, regenerated };
}

// ── shipping label round-trip ────────────────────────────────────────────────

const SHIPPING_ZPL = `
^XA
^CF0,60
^FO50,50^GB100,100,100^FS
^FO75,75^FR^GB100,100,100^FS
^FO220,50^FDIntershipping, Inc.^FS
^CF0,30
^FO220,115^FD1000 Shipping Lane^FS
^FO50,250^GB700,3,3^FS
^BY5,2,270
^FO100,400^BC^FD12345678^FS
^FO50,700^GB700,250,3^FS
^XZ
`.trim();

describe('round-trip — shipping label', () => {
  it('preserves object count across parse → generate → re-parse', () => {
    const { first, second } = roundtrip(SHIPPING_ZPL);
    expect(second.objects).toHaveLength(first.objects.length);
  });

  it('preserves object types in the same order', () => {
    const { first, second } = roundtrip(SHIPPING_ZPL);
    expect(second.objects.map((o) => o.type)).toEqual(first.objects.map((o) => o.type));
  });

  it('preserves Code 128 content and height', () => {
    const { first, second } = roundtrip(SHIPPING_ZPL);
    const bc1 = first.objects.find((o) => o.type === 'code128');
    const bc2 = second.objects.find((o) => o.type === 'code128');
    expect(props(bc2).content).toBe(props(bc1).content);
    expect(props(bc2).height).toBe(props(bc1).height);
    expect(props(bc2).moduleWidth).toBe(props(bc1).moduleWidth);
  });

  it('preserves text content and font height', () => {
    const { first, second } = roundtrip(SHIPPING_ZPL);
    const texts1 = first.objects.filter((o) => o.type === 'text');
    const texts2 = second.objects.filter((o) => o.type === 'text');
    expect(texts2.map((o) => props(o).content)).toEqual(texts1.map((o) => props(o).content));
    expect(texts2.map((o) => props(o).fontHeight)).toEqual(texts1.map((o) => props(o).fontHeight));
  });

  it('preserves box dimensions', () => {
    const { first, second } = roundtrip(SHIPPING_ZPL);
    const boxes1 = first.objects.filter((o) => o.type === 'box');
    const boxes2 = second.objects.filter((o) => o.type === 'box');
    expect(boxes2.map((o) => [props(o).width, props(o).height]))
      .toEqual(boxes1.map((o) => [props(o).width, props(o).height]));
  });
});

// ── QR code label round-trip ─────────────────────────────────────────────────

const QR_LABEL_ZPL = `
^XA
^PW640^LL480
^FO50,50^BQN,2,6^FDQA,https://example.com^FS
^FO50,300^A0N,30,0^FDScan for details^FS
^XZ
`.trim();

describe('round-trip — QR code label', () => {
  it('preserves QR code content and magnification', () => {
    const { first, second } = roundtrip(QR_LABEL_ZPL);
    const qr1 = first.objects.find((o) => o.type === 'qrcode');
    const qr2 = second.objects.find((o) => o.type === 'qrcode');
    expect(qr2).toBeDefined();
    expect(props(qr2).content).toBe(props(qr1).content);
    expect(props(qr2).magnification).toBe(props(qr1).magnification);
    expect(props(qr2).errorCorrection).toBe(props(qr1).errorCorrection);
  });

  it('preserves label dimensions', () => {
    const { first, second } = roundtrip(QR_LABEL_ZPL);
    expect(second.labelConfig.widthMm).toBe(first.labelConfig.widthMm);
    expect(second.labelConfig.heightMm).toBe(first.labelConfig.heightMm);
  });
});

// ── multi-barcode label round-trip ───────────────────────────────────────────

const MULTICODE_ZPL = `
^XA
^PW800^LL600
^FO10,10^BXN,8,200^FD1234567890^FS
^FO10,100^BEN,60,Y^FD590123412345^FS
^FO10,200^B7N,12,3,5,,,^FDPdf417 content^FS
^FO10,350^GE120,60,4,B^FS
^FO10,430^GC80,4,B^FS
^XZ
`.trim();

describe('round-trip — multi-barcode + shapes label', () => {
  it('preserves all barcode types', () => {
    const { first, second } = roundtrip(MULTICODE_ZPL);
    const types1 = first.objects.map((o) => o.type).sort();
    const types2 = second.objects.map((o) => o.type).sort();
    expect(types2).toEqual(types1);
  });

  it('preserves DataMatrix content and dimension', () => {
    const { first, second } = roundtrip(MULTICODE_ZPL);
    const dm1 = first.objects.find((o) => o.type === 'datamatrix');
    const dm2 = second.objects.find((o) => o.type === 'datamatrix');
    expect(props(dm2).content).toBe(props(dm1).content);
    expect(props(dm2).dimension).toBe(props(dm1).dimension);
  });

  it('preserves ellipse dimensions', () => {
    const { first, second } = roundtrip(MULTICODE_ZPL);
    const el1 = first.objects.find((o) => o.type === 'ellipse' && props(o).width !== props(o).height);
    const el2 = second.objects.find((o) => o.type === 'ellipse' && props(o).width !== props(o).height);
    expect(props(el2).width).toBe(props(el1).width);
    expect(props(el2).height).toBe(props(el1).height);
  });
});

// ── field-block text round-trip ───────────────────────────────────────────────

const BLOCK_TEXT_ZPL = `
^XA
^PW640^LL400
^FO50,50^A0N,25,0^FB400,3,5,C,0^FDLine one\\&Line two\\&Line three^FS
^XZ
`.trim();

describe('round-trip — field block text', () => {
  it('preserves block width and justify', () => {
    const { first, second } = roundtrip(BLOCK_TEXT_ZPL);
    const t1 = first.objects.find((o) => o.type === 'text');
    const t2 = second.objects.find((o) => o.type === 'text');
    expect(props(t2).blockWidth).toBe(props(t1).blockWidth);
    expect(props(t2).blockJustify).toBe(props(t1).blockJustify);
    expect(props(t2).blockLines).toBe(props(t1).blockLines);
  });
});

// ── barcode1d types round-trip ────────────────────────────────────────────────

const BARCODE1D_ZPL = `
^XA
^PW800^LL600
^BY3,2,80
^FO10,10^BUN,80,Y,N,N^FD01234567890^FS
^FO10,120^B8N,60,Y^FD1234567^FS
^FO10,220^B9N,60,Y^FD01234565^FS
^FO10,320^B2N,80,Y,N,N^FD12345678^FS
^FO10,420^BAN,80,Y,N,N^FDABC123^FS
^XZ
`.trim();

describe('round-trip — barcode1d types (UPC-A, EAN-8, UPC-E, I2of5, Code93)', () => {
  it('preserves all five barcode1d types', () => {
    const { first, second } = roundtrip(BARCODE1D_ZPL);
    expect(second.objects.map((o) => o.type)).toEqual(first.objects.map((o) => o.type));
  });

  it('preserves UPC-A content and height', () => {
    const { first, second } = roundtrip(BARCODE1D_ZPL);
    const b1 = first.objects.find((o) => o.type === 'upca');
    const b2 = second.objects.find((o) => o.type === 'upca');
    expect(props(b2).content).toBe(props(b1).content);
    expect(props(b2).height).toBe(props(b1).height);
  });

  it('preserves Code93 content', () => {
    const { first, second } = roundtrip(BARCODE1D_ZPL);
    const b1 = first.objects.find((o) => o.type === 'code93');
    const b2 = second.objects.find((o) => o.type === 'code93');
    expect(props(b2).content).toBe(props(b1).content);
  });
});

// ── label home offset round-trip ──────────────────────────────────────────────

const LH_OFFSET_ZPL = `
^XA
^PW640^LL400
^LH30,20
^FO70,80^A0N,25,0^FDOffset text^FS
^FO170,80^BCN,60,Y,N,N^FD99999^FS
^XZ
`.trim();

describe('round-trip — ^LH label home offset', () => {
  it('bakes the ^LH offset into absolute object positions', () => {
    // After import the LH offset is merged into x/y — objects sit at FO+LH
    const { first } = roundtrip(LH_OFFSET_ZPL);
    const text = first.objects.find((o) => o.type === 'text');
    expect(text?.x).toBe(100); // 70 + 30
    expect(text?.y).toBe(100); // 80 + 20
  });

  it('preserves object positions across the round-trip', () => {
    const { first, second } = roundtrip(LH_OFFSET_ZPL);
    expect(second.objects.map((o) => [o.x, o.y])).toEqual(first.objects.map((o) => [o.x, o.y]));
  });
});

// ── MSI barcode ──────────────────────────────────────────────────────────────

describe('round-trip — MSI barcode', () => {
  // ^BM format: ^BMN,{checkType},{height},{interp},N
  // checkType: A=Mod10, B=Mod11, C=Mod10+Mod10, D=Mod11+Mod10, N=none
  it('parses ^BM height from third parameter (new format)', () => {
    const { first } = roundtrip(
      '^XA^PW784^LL264^CI28^BY2^FO0,0^BMN,N,80,Y,N^FD12345678^FS^XZ',
    );
    const obj = first.objects[0];
    expect(obj?.type).toBe('msi');
    expect(props(obj).height).toBe(80);
    expect(props(obj).printInterpretation).toBe(true);
    expect(props(obj).checkDigit).toBe(false);
    expect(props(obj).moduleWidth).toBe(2);
  });

  it('parses ^BM check digit flag correctly', () => {
    const { first } = roundtrip(
      '^XA^PW400^LL200^BY2^FO0,0^BMN,A,100,N,N^FD12345678^FS^XZ',
    );
    expect(props(first.objects[0]).checkDigit).toBe(true);
    expect(props(first.objects[0]).printInterpretation).toBe(false);
  });

  it('survives a full round-trip without changing height or check', () => {
    const { first, second } = roundtrip(
      '^XA^PW784^LL264^CI28^BY2^FO0,0^BMN,N,80,Y,N^FD12345678^FS^XZ',
    );
    expect(props(second.objects[0]).height).toBe(props(first.objects[0]).height);
    expect(props(second.objects[0]).checkDigit).toBe(props(first.objects[0]).checkDigit);
  });

  it('generates ^BY with ratio 2 to match bwip-js 2:1 MSI encoding', () => {
    // MSI standard uses 2:1 wide:narrow ratio; bwip-js hardcodes this.
    // ZPL ^BY defaults to 3:1, so we must emit ^BY{mw},2 to keep Labelary in sync.
    const { regenerated } = roundtrip(
      '^XA^PW784^LL264^CI28^BY2^FO0,0^BMN,N,80,Y,N^FD12345678^FS^XZ',
    );
    expect(regenerated).toContain('^BY2,2');
  });
});

// ── ^FD content with commas ───────────────────────────────────────────────────

describe('round-trip — comma in ^FD content', () => {
  it('preserves commas inside field data (tokenizer splits only on ^ and ~)', () => {
    const { first, second } = roundtrip(
      '^XA^PW640^LL400^FO0,0^A0N,30,0^FDHello, World, 2024^FS^XZ',
    );
    expect(props(first.objects[0]).content).toBe('Hello, World, 2024');
    expect(props(second.objects[0]).content).toBe(props(first.objects[0]).content);
  });
});

// ── real-world Zebra Designer header commands ─────────────────────────────────

describe('parseZPL — real-world structural commands are silently ignored', () => {
  // Labels produced by Zebra Designer / ZPL II tools commonly begin with a
  // block of printer configuration commands that carry no canvas-design info.
  // They must NOT pollute importReport.unknown.
  const ZEBRA_HEADER_ZPL = [
    '^XA',
    '^CI28',          // UTF-8 encoding
    '^PR5',           // print rate
    '^MMT',           // media mode tear-off
    '^MNY',           // media handling
    '^MTT',           // media type
    '^JMA',           // applicator / configuration recall
    '^PON',           // this is unknown – will test it IS in unknown
    '^PW600',
    '^LL400',
    '^FO50,50^A0N,30,0^FDReal Label^FS',
    '^XZ',
  ].join('');

  it('does not add ^CI, ^PR, ^MN, ^JM, ^MT to importReport.unknown', () => {
    const { importReport } = parseZPL(ZEBRA_HEADER_ZPL, 8);
    const noiseInUnknown = importReport.unknown.filter(
      (s) => /^\^(CI|PR|MN|JM|MT|JA)/.test(s),
    );
    expect(noiseInUnknown).toHaveLength(0);
  });

  it('still parses design objects correctly after the header block', () => {
    const { objects } = parseZPL(ZEBRA_HEADER_ZPL, 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('text');
    expect(props(objects[0]).content).toBe('Real Label');
  });

  it('genuinely unknown commands still appear in importReport.unknown', () => {
    const { importReport } = parseZPL(ZEBRA_HEADER_ZPL, 8);
    // ^PO is not in the structural list — should surface as unknown
    expect(importReport.unknown.some((s) => s.startsWith('^PO'))).toBe(true);
  });
});
