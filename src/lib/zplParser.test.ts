import { describe, it, expect } from 'vitest';
import { parseZPL } from './zplParser';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Narrow props to a plain record for assertion without depending on registry types. */
const props = (obj: { props: unknown }): Record<string, unknown> =>
  obj.props as unknown as Record<string, unknown>;

// ── label config ──────────────────────────────────────────────────────────────

describe('parseZPL — label config', () => {
  it('parses ^PW and ^LL into mm dimensions at 8 dpmm', () => {
    const { labelConfig } = parseZPL('^XA^PW800^LL600^XZ', 8);
    expect(labelConfig.widthMm).toBe(100);   // 800 dots / 8 dpmm
    expect(labelConfig.heightMm).toBe(75);   // 600 dots / 8 dpmm
  });

  it('ignores ^PW / ^LL with zero value', () => {
    const { labelConfig } = parseZPL('^XA^PW0^LL0^XZ', 8);
    expect(labelConfig.widthMm).toBeUndefined();
    expect(labelConfig.heightMm).toBeUndefined();
  });

  it('parses ^PQ print quantity', () => {
    const { labelConfig } = parseZPL('^XA^PQ3^XZ', 8);
    expect(labelConfig.printQuantity).toBe(3);
  });

  it('ignores ^PQ with 0', () => {
    const { labelConfig } = parseZPL('^XA^PQ0^XZ', 8);
    expect(labelConfig.printQuantity).toBeUndefined();
  });
});

// ── text ──────────────────────────────────────────────────────────────────────

describe('parseZPL — text via ^A0', () => {
  it('creates a text object from an explicit ^A0 command', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,0^FDHello^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj!.type).toBe('text');
    expect(obj!.x).toBe(10);
    expect(obj!.y).toBe(20);
    expect(props(obj!).content).toBe('Hello');
    expect(props(obj!).fontHeight).toBe(30);
    expect(props(obj!).rotation).toBe('N');
  });

  it('parses rotation from ^A0', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0R,20,0^FDTilt^FS^XZ', 8);
    expect(props(objects[0]!).rotation).toBe('R');
  });
});

describe('parseZPL — text via ^CF (implicit field)', () => {
  it('creates text from ^CF + ^FD without an explicit ^A', () => {
    const { objects } = parseZPL('^XA^CF0,60^FO50,50^FDIntershipping, Inc.^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj!.type).toBe('text');
    expect(props(obj!).content).toBe('Intershipping, Inc.');
    expect(props(obj!).fontHeight).toBe(60);
  });

  it('updates fontHeight when ^CF changes between fields', () => {
    const zpl = '^XA^CF0,60^FO0,0^FDFirst^FS^CF0,30^FO0,50^FDSecond^FS^XZ';
    const { objects } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(2);
    expect(props(objects[0]!).fontHeight).toBe(60);
    expect(props(objects[1]!).fontHeight).toBe(30);
  });

  it('uses ^CFA font command (non-zero font name) to set height', () => {
    // ^CFA,30 → cmd='CF', rest='A,30' → height=30
    const { objects } = parseZPL('^XA^CFA,30^FO0,0^FDText^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]!).fontHeight).toBe(30);
  });
});

describe('parseZPL — text field position', () => {
  it('records positionType FO for ^FO fields', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,0^FDHi^FS^XZ', 8);
    expect(objects[0]!.positionType).toBe('FO');
  });

  it('records positionType FT for ^FT fields', () => {
    const { objects } = parseZPL('^XA^FT10,20^A0N,30,0^FDHi^FS^XZ', 8);
    expect(objects[0]!.positionType).toBe('FT');
  });
});

describe('parseZPL — ^LH label home offset', () => {
  it('adds ^LH offset to all field positions', () => {
    const { objects } = parseZPL('^XA^LH20,10^FO30,40^A0N,30,0^FDText^FS^XZ', 8);
    expect(objects[0]!.x).toBe(50);  // 30 + 20
    expect(objects[0]!.y).toBe(50);  // 40 + 10
  });
});

// ── ^FR field reverse ─────────────────────────────────────────────────────────

describe('parseZPL — ^FR field reverse', () => {
  it('sets reverse on a text field when ^FR precedes ^FD', () => {
    const { objects } = parseZPL('^XA^FO0,0^FR^A0N,30,0^FDReversed^FS^XZ', 8);
    expect(props(objects[0]!).reverse).toBe(true);
  });

  it('does not set reverse without ^FR', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,30,0^FDNormal^FS^XZ', 8);
    expect(props(objects[0]!).reverse).toBeFalsy();
  });
});

// ── shapes ────────────────────────────────────────────────────────────────────

describe('parseZPL — ^GB box', () => {
  it('creates an unfilled box when thickness < min dimension', () => {
    const { objects } = parseZPL('^XA^FO10,20^GB200,100,3,B,0^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj!.type).toBe('box');
    expect(obj!.x).toBe(10);
    expect(obj!.y).toBe(20);
    expect(props(obj!).width).toBe(200);
    expect(props(obj!).height).toBe(100);
    expect(props(obj!).thickness).toBe(3);
    expect(props(obj!).filled).toBe(false);
    expect(props(obj!).color).toBe('B');
    expect(props(obj!).rounding).toBe(0);
  });

  it('creates a filled box when thickness equals the smallest dimension', () => {
    const { objects } = parseZPL('^XA^FO0,0^GB100,100,100^FS^XZ', 8);
    expect(objects[0]!.type).toBe('box');
    expect(props(objects[0]!).filled).toBe(true);
  });

  it('creates a box with rounding', () => {
    const { objects } = parseZPL('^XA^FO0,0^GB100,50,3,B,5^FS^XZ', 8);
    expect(props(objects[0]!).rounding).toBe(5);
  });
});

describe('parseZPL — ^GB line', () => {
  it('creates a horizontal line when height equals thickness', () => {
    const { objects } = parseZPL('^XA^FO50,100^GB700,3,3^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj!.type).toBe('line');
    expect(props(obj!).angle).toBe(0);
    expect(props(obj!).length).toBe(700);
    expect(props(obj!).thickness).toBe(3);
  });

  it('creates a vertical line when width equals thickness', () => {
    const { objects } = parseZPL('^XA^FO100,50^GB3,250,3^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj!.type).toBe('line');
    expect(props(obj!).angle).toBe(90);
    expect(props(obj!).length).toBe(250);
  });
});

// ── barcodes ──────────────────────────────────────────────────────────────────

describe('parseZPL — ^BC Code 128', () => {
  it('creates a code128 object from ^BC^FD', () => {
    const { objects } = parseZPL('^XA^FO100,50^BCN,200,Y,N,N^FD12345678^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj!.type).toBe('code128');
    expect(props(obj!).content).toBe('12345678');
    expect(props(obj!).height).toBe(200);
    expect(props(obj!).printInterpretation).toBe(true);
    expect(props(obj!).checkDigit).toBe(false);
  });

  it('inherits height from ^BY when ^BC has no explicit height', () => {
    const { objects } = parseZPL('^XA^BY5,2,270^FO100,50^BC^FD12345678^FS^XZ', 8);
    expect(props(objects[0]!).height).toBe(270);
    expect(props(objects[0]!).moduleWidth).toBe(5);
  });
});

// ── ^FX comment ───────────────────────────────────────────────────────────────

describe('parseZPL — ^FX comment', () => {
  it('does not produce objects or skips for ^FX lines', () => {
    const { objects, skipped } = parseZPL(
      '^XA^FX This is a comment^FO10,20^A0N,30,0^FDText^FS^XZ',
      8,
    );
    expect(objects).toHaveLength(1);
    expect(skipped.some((s) => s.startsWith('^FX'))).toBe(false);
  });
});

// ── ^FH hex encoding ──────────────────────────────────────────────────────────

describe('parseZPL — ^FH hex escape', () => {
  it('decodes hex-escaped characters in field data', () => {
    // _41 = hex 41 = 'A'
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_41BC^FS^XZ', 8);
    expect(props(objects[0]!).content).toBe('ABC');
  });
});

// ── integration: the example shipping label ───────────────────────────────────

const EXAMPLE_ZPL = `
^XA

^FX Top section with logo, name and address.
^CF0,60
^FO50,50^GB100,100,100^FS
^FO75,75^FR^GB100,100,100^FS
^FO93,93^GB40,40,40^FS
^FO220,50^FDIntershipping, Inc.^FS
^CF0,30
^FO220,115^FD1000 Shipping Lane^FS
^FO220,155^FDShelbyville TN 38102^FS
^FO220,195^FDUnited States (USA)^FS
^FO50,250^GB700,3,3^FS

^FX Second section with recipient address and permit information.
^CFA,30
^FO50,300^FDJohn Doe^FS
^FO50,340^FD100 Main Street^FS
^FO50,380^FDSpringfield TN 39021^FS
^FO50,420^FDUnited States (USA)^FS
^CFA,15
^FO600,300^GB150,150,3^FS
^FO638,340^FDPermit^FS
^FO638,390^FD123456^FS
^FO50,500^GB700,3,3^FS

^FX Third section with bar code.
^BY5,2,270
^FO100,550^BC^FD12345678^FS

^FX Fourth section (the two boxes on the bottom).
^FO50,900^GB700,250,3^FS
^FO400,900^GB3,250,3^FS
^CF0,40
^FO100,960^FDCtr. X34B-1^FS
^FO100,1010^FDREF1 F00B47^FS
^FO100,1060^FDREF2 BL4H8^FS
^CF0,190
^FO470,955^FDCA^FS

^XZ
`.trim();

describe('parseZPL — example shipping label (integration)', () => {
  it('produces exactly 23 objects', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    expect(objects).toHaveLength(23);
  });

  it('produces 14 text objects', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    expect(objects.filter((o) => o.type === 'text')).toHaveLength(14);
  });

  it('produces 5 box objects', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    expect(objects.filter((o) => o.type === 'box')).toHaveLength(5);
  });

  it('produces 3 line objects', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    expect(objects.filter((o) => o.type === 'line')).toHaveLength(3);
  });

  it('produces 1 code128 barcode', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    expect(objects.filter((o) => o.type === 'code128')).toHaveLength(1);
  });

  it('has no skipped commands', () => {
    const { skipped } = parseZPL(EXAMPLE_ZPL, 8);
    expect(skipped).toHaveLength(0);
  });

  it('parses the header text with fontHeight 60 (from ^CF0,60)', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const textObjs = objects.filter((o) => o.type === 'text');
    const header = textObjs[0]!;
    expect(props(header).content).toBe('Intershipping, Inc.');
    expect(props(header).fontHeight).toBe(60);
  });

  it('parses subsequent text with fontHeight 30 (after ^CF0,30)', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const textObjs = objects.filter((o) => o.type === 'text');
    expect(props(textObjs[1]!).fontHeight).toBe(30);
    expect(props(textObjs[1]!).content).toBe('1000 Shipping Lane');
  });

  it('parses the Code 128 barcode with height from ^BY', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const barcode = objects.find((o) => o.type === 'code128')!;
    expect(props(barcode).content).toBe('12345678');
    expect(props(barcode).height).toBe(270);   // from ^BY5,2,270
    expect(props(barcode).moduleWidth).toBe(5); // from ^BY5
  });

  it('parses the logo filled boxes at the correct positions', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const boxes = objects.filter((o) => o.type === 'box');
    // First two logo squares are filled
    expect(props(boxes[0]!).filled).toBe(true);
    expect(boxes[0]!.x).toBe(50);
    expect(boxes[0]!.y).toBe(50);
  });

  it('marks the second logo box as reversed (^FR)', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const boxes = objects.filter((o) => o.type === 'box');
    expect(props(boxes[1]!).reverse).toBe(true);
  });

  it('parses the permit box as unfilled', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const boxes = objects.filter((o) => o.type === 'box');
    // permit box: ^FO600,300^GB150,150,3 — thickness=3 < min(150,150) → unfilled
    const permitBox = boxes.find((b) => b.x === 600 && b.y === 300)!;
    expect(permitBox).toBeDefined();
    expect(props(permitBox).filled).toBe(false);
    expect(props(permitBox).width).toBe(150);
    expect(props(permitBox).height).toBe(150);
  });

  it('parses the bottom container box', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const bottomBox = objects.find((o) => o.type === 'box' && o.y === 900)!;
    expect(bottomBox).toBeDefined();
    expect(props(bottomBox).width).toBe(700);
    expect(props(bottomBox).height).toBe(250);
  });

  it('parses "CA" text with fontHeight 190', () => {
    const { objects } = parseZPL(EXAMPLE_ZPL, 8);
    const ca = objects.find((o) => o.type === 'text' && (o.props as unknown as Record<string, unknown>)['content'] === 'CA')!;
    expect(ca).toBeDefined();
    expect(props(ca).fontHeight).toBe(190);
  });
});
