import { describe, it, expect, beforeAll } from 'vitest';
import { parseZPL } from './zplParser';
import { props } from '../test/helpers';

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
    expect(obj?.type).toBe('text');
    expect(obj?.x).toBe(10);
    expect(obj?.y).toBe(20);
    expect(props(obj).content).toBe('Hello');
    expect(props(obj).fontHeight).toBe(30);
    expect(props(obj).rotation).toBe('N');
  });

  it('parses rotation from ^A0', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0R,20,0^FDTilt^FS^XZ', 8);
    expect(props(objects[0]).rotation).toBe('R');
  });
});

describe('parseZPL — text via ^CF (implicit field)', () => {
  it('creates text from ^CF + ^FD without an explicit ^A', () => {
    const { objects } = parseZPL('^XA^CF0,60^FO50,50^FDIntershipping, Inc.^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj?.type).toBe('text');
    expect(props(obj).content).toBe('Intershipping, Inc.');
    expect(props(obj).fontHeight).toBe(60);
  });

  it('updates fontHeight when ^CF changes between fields', () => {
    const zpl = '^XA^CF0,60^FO0,0^FDFirst^FS^CF0,30^FO0,50^FDSecond^FS^XZ';
    const { objects } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(2);
    expect(props(objects[0]).fontHeight).toBe(60);
    expect(props(objects[1]).fontHeight).toBe(30);
  });

  it('uses ^CFA font command (non-zero font name) to set height', () => {
    // ^CFA,30 → cmd='CF', rest='A,30' → height=30
    const { objects } = parseZPL('^XA^CFA,30^FO0,0^FDText^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).fontHeight).toBe(30);
  });
});

describe('parseZPL — text field position', () => {
  it('records positionType FO for ^FO fields', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,0^FDHi^FS^XZ', 8);
    expect(objects[0]?.positionType).toBe('FO');
  });

  it('records positionType FT for ^FT fields', () => {
    const { objects } = parseZPL('^XA^FT10,20^A0N,30,0^FDHi^FS^XZ', 8);
    expect(objects[0]?.positionType).toBe('FT');
  });
});

describe('parseZPL — ^LH label home offset', () => {
  it('adds ^LH offset to all field positions', () => {
    const { objects } = parseZPL('^XA^LH20,10^FO30,40^A0N,30,0^FDText^FS^XZ', 8);
    expect(objects[0]?.x).toBe(50);  // 30 + 20
    expect(objects[0]?.y).toBe(50);  // 40 + 10
  });
});

// ── ^FR field reverse ─────────────────────────────────────────────────────────

describe('parseZPL — ^FR field reverse', () => {
  it('sets reverse on a text field when ^FR precedes ^FD', () => {
    const { objects } = parseZPL('^XA^FO0,0^FR^A0N,30,0^FDReversed^FS^XZ', 8);
    expect(props(objects[0]).reverse).toBe(true);
  });

  it('does not set reverse without ^FR', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,30,0^FDNormal^FS^XZ', 8);
    expect(props(objects[0]).reverse).toBeFalsy();
  });
});

// ── shapes ────────────────────────────────────────────────────────────────────

describe('parseZPL — ^GB box', () => {
  it('creates an unfilled box when thickness < min dimension', () => {
    const { objects } = parseZPL('^XA^FO10,20^GB200,100,3,B,0^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj?.type).toBe('box');
    expect(obj?.x).toBe(10);
    expect(obj?.y).toBe(20);
    expect(props(obj).width).toBe(200);
    expect(props(obj).height).toBe(100);
    expect(props(obj).thickness).toBe(3);
    expect(props(obj).filled).toBe(false);
    expect(props(obj).color).toBe('B');
    expect(props(obj).rounding).toBe(0);
  });

  it('creates a filled box when thickness equals the smallest dimension', () => {
    const { objects } = parseZPL('^XA^FO0,0^GB100,100,100^FS^XZ', 8);
    expect(objects[0]?.type).toBe('box');
    expect(props(objects[0]).filled).toBe(true);
  });

  it('creates a box with rounding', () => {
    const { objects } = parseZPL('^XA^FO0,0^GB100,50,3,B,5^FS^XZ', 8);
    expect(props(objects[0]).rounding).toBe(5);
  });
});

describe('parseZPL — ^GB line', () => {
  it('creates a horizontal line when height equals thickness', () => {
    const { objects } = parseZPL('^XA^FO50,100^GB700,3,3^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj?.type).toBe('line');
    expect(props(obj).angle).toBe(0);
    expect(props(obj).length).toBe(700);
    expect(props(obj).thickness).toBe(3);
  });

  it('creates a vertical line when width equals thickness', () => {
    const { objects } = parseZPL('^XA^FO100,50^GB3,250,3^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj?.type).toBe('line');
    expect(props(obj).angle).toBe(90);
    expect(props(obj).length).toBe(250);
  });
});

// ── barcodes ──────────────────────────────────────────────────────────────────

describe('parseZPL — ^BC Code 128', () => {
  it('creates a code128 object from ^BC^FD', () => {
    const { objects } = parseZPL('^XA^FO100,50^BCN,200,Y,N,N^FD12345678^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    const [obj] = objects;
    expect(obj?.type).toBe('code128');
    expect(props(obj).content).toBe('12345678');
    expect(props(obj).height).toBe(200);
    expect(props(obj).printInterpretation).toBe(true);
    expect(props(obj).checkDigit).toBe(false);
  });

  it('inherits height from ^BY when ^BC has no explicit height', () => {
    const { objects } = parseZPL('^XA^BY5,2,270^FO100,50^BC^FD12345678^FS^XZ', 8);
    expect(props(objects[0]).height).toBe(270);
    expect(props(objects[0]).moduleWidth).toBe(5);
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
    expect(props(objects[0]).content).toBe('ABC');
  });
});

// ── ^FB field block ───────────────────────────────────────────────────────────

describe('parseZPL — ^FB field block', () => {
  it('creates a text object with block properties', () => {
    const { objects } = parseZPL(
      '^XA^FO10,20^A0N,30,0^FB400,3,5,C,0^FDMulti-line text^FS^XZ',
      8,
    );
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).blockWidth).toBe(400);
    expect(props(objects[0]).blockLines).toBe(3);
    expect(props(objects[0]).blockLineSpacing).toBe(5);
    expect(props(objects[0]).blockJustify).toBe('C');
  });

  it('resets ^FB state after use (next text has no block)', () => {
    const zpl = '^XA^FO0,0^A0N,30,0^FB400,2,0,L,0^FDFirst^FS^FO0,100^A0N,30,0^FDSecond^FS^XZ';
    const { objects } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(2);
    expect(props(objects[0]).blockWidth).toBe(400);
    expect(props(objects[1]).blockWidth).toBeUndefined();
  });

  it('^FB without ^A creates text using ^CF defaults', () => {
    const { objects } = parseZPL('^XA^CF0,25^FO0,0^FB300,2,0,R,0^FDBlock text^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).fontHeight).toBe(25);
    expect(props(objects[0]).blockWidth).toBe(300);
    expect(props(objects[0]).blockJustify).toBe('R');
  });
});

// ── ^TB text block ────────────────────────────────────────────────────────────

describe('parseZPL — ^TB text block', () => {
  it('creates a text object with ^FB-like properties derived from ^TB', () => {
    const { objects } = parseZPL('^XA^CF0,30^FO0,0^TBN,400,120^FDText block^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).content).toBe('Text block');
    expect(props(objects[0]).blockWidth).toBe(400);
    // 120 / 30 = 4 lines
    expect(props(objects[0]).blockLines).toBe(4);
  });
});

// ── additional barcode types ──────────────────────────────────────────────────

describe('parseZPL — ^B3 Code 39', () => {
  it('creates a code39 object', () => {
    const { objects } = parseZPL('^XA^FO0,0^B3N,N,100,Y,N^FDABC^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('code39');
    expect(props(objects[0]).content).toBe('ABC');
    expect(props(objects[0]).height).toBe(100);
    expect(props(objects[0]).printInterpretation).toBe(true);
  });
});

describe('parseZPL — ^BQ QR Code', () => {
  it('creates a qrcode object with error correction and content', () => {
    const { objects } = parseZPL('^XA^FO0,0^BQN,2,6^FDQA,https://example.com^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('qrcode');
    expect(props(objects[0]).content).toBe('https://example.com');
    expect(props(objects[0]).magnification).toBe(6);
    expect(props(objects[0]).errorCorrection).toBe('Q');
  });
});

describe('parseZPL — ^BX DataMatrix', () => {
  it('creates a datamatrix object', () => {
    const { objects } = parseZPL('^XA^FO0,0^BXN,8,200^FD1234567890^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('datamatrix');
    expect(props(objects[0]).content).toBe('1234567890');
    expect(props(objects[0]).dimension).toBe(8);
    expect(props(objects[0]).quality).toBe(200);
  });
});

describe('parseZPL — ^BU UPC-A', () => {
  it('creates a upca object', () => {
    const { objects } = parseZPL('^XA^FO0,0^BUN,80,Y,N,N^FD01234567890^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('upca');
    expect(props(objects[0]).content).toBe('01234567890');
    expect(props(objects[0]).height).toBe(80);
  });
});

describe('parseZPL — ^B8 EAN-8', () => {
  it('creates an ean8 object', () => {
    const { objects } = parseZPL('^XA^FO0,0^B8N,80,Y^FD12345670^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('ean8');
  });
});

describe('parseZPL — ^B9 UPC-E', () => {
  it('creates a upce object', () => {
    const { objects } = parseZPL('^XA^FO0,0^B9N,80,Y^FD01234565^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('upce');
  });
});

describe('parseZPL — ^B2 Interleaved 2 of 5', () => {
  it('creates an interleaved2of5 object', () => {
    const { objects } = parseZPL('^XA^FO0,0^B2N,100,Y,N,Y^FD12345678^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('interleaved2of5');
    expect(props(objects[0]).checkDigit).toBe(true);
  });
});

describe('parseZPL — ^BA Code 93', () => {
  it('creates a code93 object', () => {
    const { objects } = parseZPL('^XA^FO0,0^BAN,100,Y,N,N^FDABC123^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('code93');
  });
});

describe('parseZPL — ^B7 PDF417', () => {
  it('creates a pdf417 object', () => {
    const { objects } = parseZPL('^XA^FO0,0^B7N,15,3,5,,,^FDTest Data^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('pdf417');
    expect(props(objects[0]).content).toBe('Test Data');
    expect(props(objects[0]).rowHeight).toBe(15);
    expect(props(objects[0]).securityLevel).toBe(3);
    expect(props(objects[0]).columns).toBe(5);
  });
});

describe('parseZPL — ^BE EAN-13', () => {
  it('creates an ean13 object', () => {
    const { objects } = parseZPL('^XA^FO0,0^BEN,100,Y^FD5901234123457^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('ean13');
    expect(props(objects[0]).content).toBe('5901234123457');
  });
});

// ── additional shape types ────────────────────────────────────────────────────

describe('parseZPL — ^GE ellipse', () => {
  it('creates an unfilled ellipse', () => {
    const { objects } = parseZPL('^XA^FO0,0^GE200,100,3,B^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('ellipse');
    expect(props(objects[0]).width).toBe(200);
    expect(props(objects[0]).height).toBe(100);
    expect(props(objects[0]).filled).toBe(false);
  });

  it('detects a filled ellipse when thickness >= min dimension', () => {
    const { objects } = parseZPL('^XA^FO0,0^GE100,80,80,B^FS^XZ', 8);
    expect(props(objects[0]).filled).toBe(true);
  });
});

describe('parseZPL — ^GC circle', () => {
  it('creates an ellipse with equal width and height from ^GC', () => {
    const { objects } = parseZPL('^XA^FO0,0^GC100,3,B^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('ellipse');
    expect(props(objects[0]).width).toBe(100);
    expect(props(objects[0]).height).toBe(100);
    expect(props(objects[0]).filled).toBe(false);
  });

  it('creates a filled circle when thickness >= diameter', () => {
    const { objects } = parseZPL('^XA^FO0,0^GC50,50,B^FS^XZ', 8);
    expect(props(objects[0]).filled).toBe(true);
  });
});

describe('parseZPL — ^GD diagonal line', () => {
  it('creates a line object from a diagonal ^GD command', () => {
    const { objects } = parseZPL('^XA^FO10,20^GD200,100,3,B,L^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('line');
    expect(props(objects[0]).thickness).toBe(3);
    expect(props(objects[0]).color).toBe('B');
    // Length should be ~sqrt(200²+100²) ≈ 224
    const len = props(objects[0]).length as number;
    expect(len).toBeGreaterThan(220);
    expect(len).toBeLessThan(225);
  });
});

// ── ^GFA graphic field ────────────────────────────────────────────────────────

describe('parseZPL — ^GFA graphic field', () => {
  it('creates an image object from a ^GFA command with uncompressed hex', () => {
    // 1 byte per row, 2 rows → 2 bytes total, simple hex data
    const hexData = 'FF00';
    const { objects } = parseZPL(`^XA^FO0,0^GFA,2,2,1,${hexData}^FS^XZ`, 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('image');
    expect(props(objects[0]).widthDots).toBe(8); // 1 byte per row Ã— 8 bits
    expect(props(objects[0])._gfaCache).toContain('^GFA,');
  });

  it('creates an image object from compressed ^GFA data', () => {
    // G=1 repeat → "GF" = repeat 'F' once, basically just 'F'
    // bytesPerRow=1, so we need 2 nibbles per row
    // "GF" = 1Ã—F = "F" → only one nibble, padded to "F0"
    // Two rows: "GF,GF" should give us 2 rows → totalBytes=2
    const { objects } = parseZPL('^XA^FO0,0^GFA,2,2,1,FF,:^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('image');
  });
});

// ── ^LR label reverse ─────────────────────────────────────────────────────────

describe('parseZPL — ^LR label reverse', () => {
  it('sets reverse on text when ^LRY is active', () => {
    const { objects } = parseZPL('^XA^LRY^FO0,0^A0N,30,0^FDReversed^FS^LRN^XZ', 8);
    expect(props(objects[0]).reverse).toBe(true);
  });

  it('disables reverse after ^LRN', () => {
    const zpl = '^XA^LRY^FO0,0^A0N,30,0^FDFirst^FS^LRN^FO0,50^A0N,30,0^FDSecond^FS^XZ';
    const { objects } = parseZPL(zpl, 8);
    expect(props(objects[0]).reverse).toBe(true);
    expect(props(objects[1]).reverse).toBeFalsy();
  });
});

// ── ^FW field default rotation ────────────────────────────────────────────────

describe('parseZPL — ^FW field default rotation', () => {
  it('applies default rotation to implicit text fields', () => {
    const { objects } = parseZPL('^XA^FWR^CF0,30^FO0,0^FDRotated^FS^XZ', 8);
    expect(props(objects[0]).rotation).toBe('R');
  });
});

// ── ^MM media mode and ^LS label shift ────────────────────────────────────────

describe('parseZPL — ^MM and ^LS', () => {
  it('parses media mode', () => {
    const { labelConfig } = parseZPL('^XA^MMT^XZ', 8);
    expect(labelConfig.mediaMode).toBe('T');
  });

  it('parses label shift', () => {
    const { labelConfig } = parseZPL('^XA^LS10^XZ', 8);
    expect(labelConfig.labelShift).toBe(10);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe('parseZPL — edge cases', () => {
  it('returns empty results for empty ZPL', () => {
    const { objects, skipped } = parseZPL('', 8);
    expect(objects).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it('handles ^XA^XZ (empty label)', () => {
    const { objects, skipped } = parseZPL('^XA^XZ', 8);
    expect(objects).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it('handles multiple ^FO without ^FD (bare origins are benign)', () => {
    const { objects } = parseZPL('^XA^FO10,20^FO30,40^A0N,30,0^FDText^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.x).toBe(30);
    expect(objects[0]?.y).toBe(40);
  });

  it('supports different dpmm values (12 dpmm / 300 DPI)', () => {
    const { labelConfig } = parseZPL('^XA^PW1200^LL600^XZ', 12);
    expect(labelConfig.widthMm).toBe(100);
    expect(labelConfig.heightMm).toBe(50);
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
  let objects: ReturnType<typeof parseZPL>['objects'];
  let skipped: ReturnType<typeof parseZPL>['skipped'];

  beforeAll(() => {
    const result = parseZPL(EXAMPLE_ZPL, 8);
    objects = result.objects;
    skipped = result.skipped;
  });

  it('produces exactly 23 objects', () => {
    expect(objects).toHaveLength(23);
  });

  it('produces 14 text objects', () => {
    expect(objects.filter((o) => o.type === 'text')).toHaveLength(14);
  });

  it('produces 5 box objects', () => {
    expect(objects.filter((o) => o.type === 'box')).toHaveLength(5);
  });

  it('produces 3 line objects', () => {
    expect(objects.filter((o) => o.type === 'line')).toHaveLength(3);
  });

  it('produces 1 code128 barcode', () => {
    expect(objects.filter((o) => o.type === 'code128')).toHaveLength(1);
  });

  it('has no skipped commands', () => {
    expect(skipped).toHaveLength(0);
  });

  it('parses the header text with fontHeight 60 (from ^CF0,60)', () => {
    const textObjs = objects.filter((o) => o.type === 'text');
    expect(props(textObjs[0]).content).toBe('Intershipping, Inc.');
    expect(props(textObjs[0]).fontHeight).toBe(60);
  });

  it('parses subsequent text with fontHeight 30 (after ^CF0,30)', () => {
    const textObjs = objects.filter((o) => o.type === 'text');
    expect(props(textObjs[1]).fontHeight).toBe(30);
    expect(props(textObjs[1]).content).toBe('1000 Shipping Lane');
  });

  it('parses the Code 128 barcode with height from ^BY', () => {
    const barcode = objects.find((o) => o.type === 'code128');
    expect(barcode).toBeDefined();
    expect(props(barcode).content).toBe('12345678');
    expect(props(barcode).height).toBe(270);
    expect(props(barcode).moduleWidth).toBe(5);
  });

  it('parses the logo filled boxes at the correct positions', () => {
    const boxes = objects.filter((o) => o.type === 'box');
    expect(props(boxes[0]).filled).toBe(true);
    expect(boxes[0]?.x).toBe(50);
    expect(boxes[0]?.y).toBe(50);
  });

  it('marks the second logo box as reversed (^FR)', () => {
    const boxes = objects.filter((o) => o.type === 'box');
    expect(props(boxes[1]).reverse).toBe(true);
  });

  it('parses the permit box as unfilled', () => {
    const boxes = objects.filter((o) => o.type === 'box');
    // permit box: ^FO600,300^GB150,150,3 — thickness=3 < min(150,150) → unfilled
    const permitBox = boxes.find((b) => b.x === 600 && b.y === 300);
    expect(permitBox).toBeDefined();
    expect(props(permitBox).filled).toBe(false);
    expect(props(permitBox).width).toBe(150);
    expect(props(permitBox).height).toBe(150);
  });

  it('parses the bottom container box', () => {
    const bottomBox = objects.find((o) => o.type === 'box' && o.y === 900);
    expect(bottomBox).toBeDefined();
    expect(props(bottomBox).width).toBe(700);
    expect(props(bottomBox).height).toBe(250);
  });

  it('parses "CA" text with fontHeight 190', () => {
    const ca = objects.find((o) => o.type === 'text' && props(o).content === 'CA');
    expect(ca).toBeDefined();
    expect(props(ca).fontHeight).toBe(190);
  });
});

// ── ^SN serialization (appears AFTER ^FD) ─────────────────────────────────────

describe('parseZPL — ^SN serialization', () => {
  it('converts a text field to serial when ^SN follows ^FD', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,0^FD001^FS\n^SN001,1,Y^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('serial');
    expect(props(objects[0]).content).toBe('001');
    expect(props(objects[0]).increment).toBe(1);
    expect(props(objects[0]).zplMode).toBe('SN');
  });

  it('picks up increment from ^SN parameters', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,25,0^FD100^FS\n^SN100,5,Y^XZ', 8);
    expect(props(objects[0]).increment).toBe(5);
    expect(props(objects[0]).fontHeight).toBe(25);
  });

  it('preserves font rotation from ^A0', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0R,30,0^FD001^FS\n^SN001,1,Y^XZ', 8);
    expect(props(objects[0]).rotation).toBe('R');
  });
});

// ── ^SF serialization (appears BEFORE ^FD) ────────────────────────────────────

describe('parseZPL — ^SF serialization', () => {
  it('creates a serial object when ^SF precedes ^FD', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,30,0^SF1,3,Y^FD001^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('serial');
    expect(props(objects[0]).content).toBe('001');
    expect(props(objects[0]).increment).toBe(1);
    expect(props(objects[0]).zplMode).toBe('SF');
  });

  it('picks up increment from ^SF parameters', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,30,0^SF3,3,Y^FD100^FS^XZ', 8);
    expect(props(objects[0]).increment).toBe(3);
  });
});

// ── ~ commands (tilde) ────────────────────────────────────────────────────────

describe('parseZPL — ~ tilde commands', () => {
  it('tokenizes ~DG as a known command (skipped)', () => {
    const { skipped } = parseZPL('^XA~DGR:LOGO.GRF,1024,10,FF^XZ', 8);
    expect(skipped.some((s) => s.startsWith('~DG'))).toBe(true);
  });

  it('does not create objects for ~DG', () => {
    const { objects } = parseZPL('^XA~DGR:LOGO.GRF,1024,10,FF^XZ', 8);
    expect(objects).toHaveLength(0);
  });

  it('handles mixed ^ and ~ commands', () => {
    const { objects, skipped } = parseZPL('^XA~DGR:TEST.GRF,10,1,FF^FO10,20^A0N,30,0^FDHello^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('text');
    expect(skipped.some((s) => s.startsWith('~DG'))).toBe(true);
  });
});

// ── ^IM image reference ───────────────────────────────────────────────────────

describe('parseZPL — ^IM image reference', () => {
  it('adds ^IM to skipped (cannot load printer images)', () => {
    const { objects, skipped } = parseZPL('^XA^FO0,0^IMR:LOGO.GRF^FS^XZ', 8);
    expect(objects).toHaveLength(0);
    expect(skipped.some((s) => s.startsWith('^IM'))).toBe(true);
  });
});

// ── \\& line break in ^FB ─────────────────────────────────────────────────────

describe('parseZPL — \\& line break in ^FB', () => {
  it('decodes \\& as newline in field block text', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,30,0^FB400,3,0,L,0^FDLine 1\\&Line 2\\&Line 3^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).content).toBe('Line 1\nLine 2\nLine 3');
  });

  it('does not decode \\& outside of ^FB blocks', () => {
    const { objects } = parseZPL('^XA^FO0,0^A0N,30,0^FDNo\\&Break^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('No\\&Break');
  });
});

// ── ^A@ TrueType font fallback ───────────────────────────────────────────────

describe('parseZPL — ^A@ TrueType font fallback', () => {
  it('imports ^A@ as text with specified height instead of skipping', () => {
    const { objects, skipped } = parseZPL('^XA^FO10,20^A@N,40,30,E:ARIAL.TTF^FDTrueType^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('text');
    expect(props(objects[0]).content).toBe('TrueType');
    expect(props(objects[0]).fontHeight).toBe(40);
    // Should NOT be in skipped list
    expect(skipped.some((s) => s.startsWith('^A@'))).toBe(false);
  });

  it('falls back to ^CF defaults when ^A@ has no height', () => {
    const { objects } = parseZPL('^XA^CF0,50^FO0,0^A@N,0,0,E:FONT.TTF^FDFallback^FS^XZ', 8);
    expect(props(objects[0]).fontHeight).toBe(50);
  });
});

// ── importReport ─────────────────────────────────────────────────────────────

describe('parseZPL — importReport.partial', () => {
  it('records ^A@ in importReport.partial (font face not imported)', () => {
    const { importReport } = parseZPL('^XA^FO0,0^A@N,30,0,E:ARIAL.TTF^FDText^FS^XZ', 8);
    expect(importReport.partial).toContain('^A@');
  });

  it('deduplicates ^A@ entries when used multiple times', () => {
    const zpl = '^XA^FO0,0^A@N,30,0,E:A.TTF^FDFirst^FS^FO0,50^A@N,30,0,E:B.TTF^FDSecond^FS^XZ';
    const { importReport } = parseZPL(zpl, 8);
    expect(importReport.partial.filter((e) => e === '^A@')).toHaveLength(1);
  });

  it('records general ^A{x} font commands (e.g. ^AB) in importReport.partial', () => {
    const { importReport } = parseZPL('^XA^FO0,0^ABN,30,0^FDText^FS^XZ', 8);
    expect(importReport.partial.some((e) => e.startsWith('^A'))).toBe(true);
  });

  it('does not put fully-supported ^A0 in importReport.partial', () => {
    const { importReport } = parseZPL('^XA^FO0,0^A0N,30,0^FDText^FS^XZ', 8);
    expect(importReport.partial).toHaveLength(0);
  });
});

describe('parseZPL — importReport.browserLimit', () => {
  it('records ^IM in importReport.browserLimit', () => {
    const { importReport } = parseZPL('^XA^FO0,0^IMR:LOGO.GRF^FS^XZ', 8);
    expect(importReport.browserLimit.some((s) => s.startsWith('^IM'))).toBe(true);
  });

  it('records ~DG in importReport.browserLimit', () => {
    const { importReport } = parseZPL('^XA~DGR:LOGO.GRF,1024,10,FF^XZ', 8);
    expect(importReport.browserLimit.some((s) => s.startsWith('~DG'))).toBe(true);
  });

  it('also keeps ^IM in skipped for backward compatibility', () => {
    const { skipped, importReport } = parseZPL('^XA^FO0,0^IMR:LOGO.GRF^FS^XZ', 8);
    expect(skipped.some((s) => s.startsWith('^IM'))).toBe(true);
    expect(importReport.browserLimit.some((s) => s.startsWith('^IM'))).toBe(true);
  });
});

describe('parseZPL — importReport.unknown', () => {
  it('records unrecognised commands in importReport.unknown', () => {
    const { importReport } = parseZPL('^XA^XX99^FO0,0^A0N,30,0^FDText^FS^XZ', 8);
    expect(importReport.unknown.some((s) => s.startsWith('^XX'))).toBe(true);
  });

  it('also keeps unknown commands in skipped for backward compatibility', () => {
    const { skipped, importReport } = parseZPL('^XA^XX99^FO0,0^A0N,30,0^FDText^FS^XZ', 8);
    expect(skipped.some((s) => s.startsWith('^XX'))).toBe(true);
    expect(importReport.unknown.some((s) => s.startsWith('^XX'))).toBe(true);
  });

  it('records ^GFB (unsupported GF format) in importReport.browserLimit', () => {
    const { importReport } = parseZPL('^XA^FO0,0^GFB,32,32,4,AABBCCDD^FS^XZ', 8);
    expect(importReport.browserLimit.some((s) => s.startsWith('^GF'))).toBe(true);
    expect(importReport.unknown.some((s) => s.startsWith('^GF'))).toBe(false);
  });

  it('returns empty importReport for a fully supported label', () => {
    const { importReport } = parseZPL('^XA^PW800^LL600^FO50,50^A0N,30,0^FDHello^FS^XZ', 8);
    expect(importReport.partial).toHaveLength(0);
    expect(importReport.browserLimit).toHaveLength(0);
    expect(importReport.unknown).toHaveLength(0);
  });
});

// ── ^FO 3rd parameter (justification) ─────────────────────────────────────────

describe('parseZPL — ^FO with justification parameter', () => {
  it('parses ^FO with a 3rd parameter without errors', () => {
    const { objects } = parseZPL('^XA^FO100,200,1^A0N,30,0^FDJustified^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.x).toBe(100);
    expect(objects[0]?.y).toBe(200);
    expect(props(objects[0]).content).toBe('Justified');
  });
});
