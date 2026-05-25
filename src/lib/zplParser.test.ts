import { describe, it, expect, beforeAll } from 'vitest';
import { zlibSync } from 'fflate';
import { parseZPL } from './zplParser';
import { props } from '../test/helpers';

/** CRC-16/XMODEM — same variant used by the parser to validate
 *  :B64:/:Z64: wrappers (poly 0x1021, init 0x0000). Duplicated here so
 *  tests can build valid CRC values without exporting the parser's
 *  internal helper. */
function testCrc16(s: string): string {
  let crc = 0;
  for (const ch of s) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).padStart(4, '0').toUpperCase();
}

function makeZ64Field(bytes: Uint8Array): string {
  const deflated = zlibSync(bytes);
  let bin = '';
  for (const b of deflated) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return `:Z64:${b64}:${testCrc16(b64)}`;
}

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
    // obj.x/y is the Konva render position (EM-top-left); the parsed ^FO
    // gives the ZPL cap-top anchor. For N/h=30 they differ by
    // (0.234 - 0.08) * 30 = 4.62 dots in Y.
    expect(obj?.x).toBeCloseTo(10);
    expect(obj?.y).toBeCloseTo(20 - 4.62);
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
    // obj.x = (^FO.x + ^LH.x) - zplAnchorDelta.x; obj.y similar.
    // For FO/N h=30: dx=0, dy=4.62.
    expect(objects[0]?.x).toBeCloseTo(50);  // 30 + 20
    expect(objects[0]?.y).toBeCloseTo(50 - 4.62);  // 40 + 10 - shift
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

  it('keeps an unrelated filled box + ^FR text at a different anchor as two objects', () => {
    // Anchor mismatch ⇒ no collapse. Hand-written ZPL where a black box
    // and an ^FR text happen to coexist must round-trip unchanged.
    const { objects } = parseZPL(
      '^XA^FO10,10^GB60,30,60,B,0^FS^FO200,200^A0N,30,0^FR^FDHi^FS^XZ',
      8,
    );
    expect(objects).toHaveLength(2);
    expect(objects[0]?.type).toBe('box');
    expect(objects[1]?.type).toBe('text');
    expect(props(objects[1]).reverse).toBe(true);
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

  it('attaches a single ^FX to the next object as comment', () => {
    const { objects } = parseZPL(
      '^XA^FXTop section^FO10,20^A0N,30,0^FDText^FS^XZ',
      8,
    );
    expect(objects[0]?.comment).toBe('Top section');
  });

  it('joins consecutive ^FX lines with a newline', () => {
    const { objects } = parseZPL(
      '^XA^FXLine 1^FXLine 2^FO10,20^A0N,30,0^FDText^FS^XZ',
      8,
    );
    expect(objects[0]?.comment).toBe('Line 1\nLine 2');
  });

  it('does not bleed comments across ^XA boundaries', () => {
    const { objects } = parseZPL(
      '^XA^FXOnly first^XZ^XA^FO10,20^A0N,30,0^FDText^FS^XZ',
      8,
    );
    expect(objects[0]?.comment).toBeUndefined();
  });

  it('does not reattach a consumed comment to a later object', () => {
    const { objects } = parseZPL(
      '^XA^FXOnly first^FO10,20^A0N,30,0^FDFirst^FS^FO10,60^A0N,30,0^FDSecond^FS^XZ',
      8,
    );
    expect(objects[0]?.comment).toBe('Only first');
    expect(objects[1]?.comment).toBeUndefined();
  });
});

// ── barcode rotation ──────────────────────────────────────────────────────────

describe('parseZPL — barcode rotation', () => {
  it.each([
    ['^XA^BY2^FO0,0^BCR,100,Y,N,N^FD123^FS^XZ', 'R'],
    ['^XA^BY2^FO0,0^BCI,100,Y,N,N^FD123^FS^XZ', 'I'],
    ['^XA^BY2^FO0,0^BCB,100,Y,N,N^FD123^FS^XZ', 'B'],
    ['^XA^FO0,0^BQR,2,4^FDQA,X^FS^XZ', 'R'],
    ['^XA^FO0,0^BXB,5,200^FDX^FS^XZ', 'B'],
    ['^XA^FO0,0^B7I,4,0,0,,,^FDX^FS^XZ', 'I'],
    ['^XA^FO0,0^B0R,4,N,N,N,N^FDX^FS^XZ', 'R'],
  ])('reads orientation from %s', (zpl, expected) => {
    const { objects } = parseZPL(zpl, 8);
    expect((props(objects[0]) as { rotation?: string }).rotation).toBe(expected);
  });

  it('defaults to N when orientation is missing or unrecognised', () => {
    const { objects } = parseZPL('^XA^BY2^FO0,0^BC,100,Y,N,N^FD123^FS^XZ', 8);
    expect((props(objects[0]) as { rotation?: string }).rotation).toBe('N');
  });
});

// ── ^FH hex encoding ──────────────────────────────────────────────────────────

describe('parseZPL — ^FH hex escape', () => {
  it('decodes hex-escaped characters in field data', () => {
    // _41 = hex 41 = 'A'
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_41BC^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('ABC');
  });

  it('decodes UTF-8 multibyte escapes (German umlauts)', () => {
    // _C3_A4 = ä, _C3_B6 = ö, _C3_BC = ü
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_C3_A4_C3_B6_C3_BC^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('äöü');
  });

  it('decodes UTF-8 multibyte escapes (Nordic)', () => {
    // _C3_A6 = æ, _C3_B8 = ø, _C3_A5 = å
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_C3_A6_C3_B8_C3_A5^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('æøå');
  });

  it('decodes 3-byte UTF-8 escapes (Euro sign)', () => {
    // _E2_82_AC = €
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_E2_82_AC^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('€');
  });

  it('decodes mixed ASCII and UTF-8 escapes in one field', () => {
    // _48 = H, _69 = i, then ä
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_48_69 _C3_A4^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('Hi ä');
  });

  it('replaces invalid UTF-8 byte sequences with U+FFFD', () => {
    // _C3 alone is a truncated 2-byte sequence
    const { objects } = parseZPL('^XA^FH_^FO0,0^A0N,30,0^FD_C3^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('�');
  });

  it('decodes ^CI27 (Windows-1252) single-byte escapes', () => {
    // _E4 = 0xE4 = ä in CP1252 (in UTF-8 this would be invalid → U+FFFD)
    const { objects } = parseZPL('^XA^CI27^FH_^FO0,0^A0N,30,0^FD_E4_F6_FC^FS^XZ', 8);
    expect(props(objects[0]).content).toBe('äöü');
  });

  it('switches encoding mid-label on ^CI', () => {
    // first field UTF-8 (default), second field CP1252
    const zpl =
      '^XA^FH_^FO0,0^A0N,30,0^FD_C3_A4^FS' +
      '^CI27^FH_^FO0,50^A0N,30,0^FD_E4^FS^XZ';
    const { objects } = parseZPL(zpl, 8);
    expect(props(objects[0]).content).toBe('ä');
    expect(props(objects[1]).content).toBe('ä');
  });

  it('reports unsupported ^CI N as partial import', () => {
    // ^CI50 is not a real Zebra encoding — falls back to UTF-8 default
    const { importReport } = parseZPL('^XA^CI50^FH_^FO0,0^A0N,30,0^FDx^FS^XZ', 8);
    expect(importReport.partial).toContain('^CI50');
  });

  it('resets decoder to UTF-8 default on unsupported ^CI', () => {
    // After ^CI27 sets CP1252, an unknown ^CI50 must fall back to UTF-8
    // (not keep CP1252) so behaviour is predictable.
    const zpl =
      '^XA^CI27^FH_^FO0,0^A0N,30,0^FD_E4^FS' +
      '^CI50^FH_^FO0,50^A0N,30,0^FD_C3_A4^FS^XZ';
    const { objects } = parseZPL(zpl, 8);
    expect(props(objects[0]).content).toBe('ä');  // CP1252
    expect(props(objects[1]).content).toBe('ä');  // UTF-8 (after reset)
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

  it('preserves the original thickness on filled ^GE (lossless round-trip)', () => {
    const { objects } = parseZPL('^XA^FO0,0^GE100,80,80,B^FS^XZ', 8);
    expect(props(objects[0]).thickness).toBe(80);
  });
});

describe('parseZPL — ^GS graphic symbol', () => {
  it('creates a symbol object with code, dims and rotation', () => {
    const { objects } = parseZPL('^XA^FO30,40^GSR,50,60^FDC^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('symbol');
    expect(props(objects[0]).symbol).toBe('C');
    expect(props(objects[0]).height).toBe(50);
    expect(props(objects[0]).width).toBe(60);
    expect(props(objects[0]).rotation).toBe('R');
  });

  it('falls back to "B" (©) when ^FD payload is not a known code', () => {
    const { objects } = parseZPL('^XA^FO0,0^GSN,30,30^FDZ^FS^XZ', 8);
    expect(props(objects[0]).symbol).toBe('B');
  });

  it('defaults width to height when ^GS width omitted', () => {
    const { objects } = parseZPL('^XA^FO0,0^GSN,40^FDA^FS^XZ', 8);
    expect(props(objects[0]).height).toBe(40);
    expect(props(objects[0]).width).toBe(40);
  });

  it('does not leak symbol state into a following ^FD when ^GS has no payload', () => {
    // Bare ^GS without ^FD is malformed but seen in the wild; the
    // parser must NOT treat the next unrelated ^FD (here: a plain
    // text field) as the symbol payload.
    const { objects } = parseZPL(
      '^XA^FO0,0^GSN,40,40^FS^FO100,100^A0N,30,30^FDhello^FS^XZ',
      8,
    );
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('text');
    expect(props(objects[0]).content).toBe('hello');
  });

  it('round-trips through registry.toZPL for every code + rotation', () => {
    for (const code of ['A','B','C','D','E'] as const) {
      for (const rot of ['N','R','I','B'] as const) {
        const zpl = `^XA^FO10,20^GS${rot},40,40^FD${code}^FS^XZ`;
        const { objects } = parseZPL(zpl, 8);
        expect(props(objects[0]).symbol).toBe(code);
        expect(props(objects[0]).rotation).toBe(rot);
      }
    }
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
    expect(props(objects[0]).lockAspect).toBe(true);
  });

  it('creates a filled circle when thickness >= diameter', () => {
    const { objects } = parseZPL('^XA^FO0,0^GC50,50,B^FS^XZ', 8);
    expect(props(objects[0]).filled).toBe(true);
  });

  it('preserves the original thickness on filled ^GC (lossless round-trip)', () => {
    const { objects } = parseZPL('^XA^FO0,0^GC50,50,B^FS^XZ', 8);
    expect(props(objects[0]).thickness).toBe(50);
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

  it('imports a :B64:-wrapped ^GFA payload as an image (CRC valid)', () => {
    // 8 bytes = [0,0,0,0xFF,0xFF,0,0,0] → base64 "AAAA//8AAAA="
    // CRC-16/CCITT-FALSE over "AAAA//8AAAA=" = 0xDFF8
    const { objects, importReport } = parseZPL(
      '^XA^FO0,0^GFA,8,8,1,:B64:AAAA//8AAAA=:DFF8^FS^XZ',
      8,
    );
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('image');
    expect(props(objects[0]).widthDots).toBe(8);
    expect(importReport.partial).not.toContain('^GF');
  });

  it('still renders a :B64: payload with mismatched CRC but flags as partial', () => {
    const { objects, importReport } = parseZPL(
      '^XA^FO0,0^GFA,8,8,1,:B64:AAAA//8AAAA=:0000^FS^XZ',
      8,
    );
    expect(objects).toHaveLength(1);
    expect(importReport.partial).toContain('^GF');
  });

  it('accepts :B64: wrapper on ^GFB and ^GFC (no raw-binary path needed)', () => {
    for (const fmt of ['B', 'C'] as const) {
      const { objects } = parseZPL(
        `^XA^FO0,0^GF${fmt},8,8,1,:B64:AAAA//8AAAA=:DFF8^FS^XZ`,
        8,
      );
      expect(objects).toHaveLength(1);
      expect(objects[0]?.type).toBe('image');
    }
  });

  it('tolerates embedded whitespace inside a :B64: base64 payload', () => {
    // ZPL generators often line-break long base64 blocks every N chars.
    // Labelary accepts this; we should too.
    const zpl =
      '^XA^FO0,0^GFA,8,8,1,:B64:AAAA\n//8AAAA=:DFF8^FS^XZ';
    const { objects, importReport } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(1);
    expect(importReport.partial).not.toContain('^GF');
  });

  it('tolerates trailing whitespace on wrapped GF payloads', () => {
    // Real-world ZPL is often line-broken between commands; the tokenizer
    // preserves the trailing newline on the field body, so the regex needs
    // to accommodate that.
    const zplWithNewline =
      '^XA\n^FO0,0\n^GFA,8,8,1,:B64:AAAA//8AAAA=:DFF8\n^FS\n^XZ';
    const { objects, importReport } = parseZPL(zplWithNewline, 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('image');
    expect(importReport.browserLimit).toHaveLength(0);
  });

  it('imports a :Z64:-wrapped ^GFC payload by inflating zlib data', () => {
    // 8 bytes = [0,0,0,0xFF,0xFF,0,0,0] → zlib-compressed → base64 → CRC.
    const bytes = new Uint8Array([0, 0, 0, 0xff, 0xff, 0, 0, 0]);
    const field = makeZ64Field(bytes);
    const { objects, importReport } = parseZPL(
      `^XA^FO0,0^GFC,8,8,1,${field}^FS^XZ`,
      8,
    );
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('image');
    expect(props(objects[0]).widthDots).toBe(8);
    expect(importReport.partial).not.toContain('^GF');
  });

  it('records :Z64: with corrupt deflate stream as browserLimit', () => {
    // Valid base64 but garbage bytes that fflate will reject as a deflate
    // stream. CRC must match so we know the failure is in inflate, not the
    // wrapper-shape detection.
    const b64 = btoa('not a valid zlib stream');
    const field = `:Z64:${b64}:${testCrc16(b64)}`;
    const { objects, importReport } = parseZPL(
      `^XA^FO0,0^GFC,8,8,1,${field}^FS^XZ`,
      8,
    );
    expect(objects).toHaveLength(0);
    expect(importReport.browserLimit.some((s) => s.startsWith('^GF'))).toBe(true);
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

// ── ~DY graphic upload + ^XG recall ──────────────────────────────────────────

describe('parseZPL — ~DY + ^XG graphic upload/recall', () => {
  // 1 byte per row × 4 rows → pattern [0x00, 0xFF, 0xFF, 0x00] (horizontal stripe).
  const HEX = '00FFFF00';
  const PATH = 'R:LOGO';

  it('registers a ~DY graphic upload and ^XG instantiates it as an image', () => {
    const zpl =
      `~DY${PATH},A,G,4,1,${HEX}\n` +
      `^XA^FO50,80^XG${PATH}.GRF,1,1^FS^XZ`;
    const { objects, importReport } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('image');
    expect(props(objects[0]).widthDots).toBe(8);
    expect(props(objects[0]).storedAs).toEqual({ device: 'R', name: 'LOGO', embedInZpl: true });
    expect(objects[0]?.x).toBe(50);
    expect(objects[0]?.y).toBe(80);
    expect(importReport.browserLimit).toHaveLength(0);
  });

  it('resolves ^XG even when the .GRF suffix is omitted', () => {
    // Labelary accepts `^XGR:LOGO,1,1` for an upload stored as
    // `R:LOGO.GRF`; the map lookup must normalise both forms.
    const zpl =
      `~DYR:LOGO,A,G,4,1,00FFFF00\n` +
      `^XA^FO50,80^XGR:LOGO,1,1^FS^XZ`;
    const { objects, importReport } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).storedAs).toEqual({ device: 'R', name: 'LOGO', embedInZpl: true });
    expect(importReport.browserLimit).toHaveLength(0);
  });

  it('^XG without a preceding ~DY imports as recall-only image', () => {
    // Admin pre-loaded the file on the printer; we just emit the ^XG
    // reference without ~DY bytes. Object is created so the user can
    // position/edit it; embedInZpl=false stops the emitter from
    // re-uploading bytes we never received.
    const zpl = `^XA^FO0,0^XGR:MISSING.GRF,1,1^FS^XZ`;
    const { objects, importReport } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).storedAs).toEqual({
      device: 'R', name: 'MISSING', embedInZpl: false,
    });
    expect(importReport.partial).toContain('^XG');
  });

  it('accepts :Z64:-wrapped graphic payloads in ~DY (format C)', () => {
    const bytes = new Uint8Array([0, 0xff, 0xff, 0]);
    const field = makeZ64Field(bytes);
    const zpl =
      `~DY${PATH},C,G,4,1,${field}\n` +
      `^XA^FO0,0^XG${PATH}.GRF,1,1^FS^XZ`;
    const { objects, importReport } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).storedAs).toEqual({ device: 'R', name: 'LOGO', embedInZpl: true });
    expect(importReport.partial).not.toContain('~DY');
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

describe('parseZPL — printer params', () => {
  it('parses ^PR print speed within range', () => {
    const { labelConfig } = parseZPL('^XA^PR6^XZ', 8);
    expect(labelConfig.printSpeed).toBe(6);
  });

  it('ignores ^PR with out-of-range value', () => {
    const { labelConfig } = parseZPL('^XA^PR1^XZ', 8);
    expect(labelConfig.printSpeed).toBeUndefined();
  });

  it('parses ^PR with slew and backfeed', () => {
    const { labelConfig } = parseZPL('^XA^PR6,8,4^XZ', 8);
    expect(labelConfig.printSpeed).toBe(6);
    expect(labelConfig.slewSpeed).toBe(8);
    expect(labelConfig.backfeedSpeed).toBe(4);
  });

  it('parses extended ^PQ params', () => {
    const { labelConfig } = parseZPL('^XA^PQ5,2,3,Y^XZ', 8);
    expect(labelConfig.printQuantity).toBe(5);
    expect(labelConfig.pauseCount).toBe(2);
    expect(labelConfig.replicates).toBe(3);
    expect(labelConfig.overridePauseCount).toBe('Y');
  });

  it('parses ^PM mirror', () => {
    expect(parseZPL('^XA^PMY^XZ', 8).labelConfig.mirror).toBe('Y');
    expect(parseZPL('^XA^PMN^XZ', 8).labelConfig.mirror).toBe('N');
  });

  it('parses ^CF width into defaultFontWidth', () => {
    const { labelConfig } = parseZPL('^XA^CFA,30,20^XZ', 8);
    expect(labelConfig.defaultFontId).toBe('A');
    expect(labelConfig.defaultFontHeight).toBe(30);
    expect(labelConfig.defaultFontWidth).toBe(20);
  });

  it('parses ^CW mapping and pins ^A{alias} as the field-level fontId', () => {
    // The ^CW mapping lives in labelConfig.customFonts; the text field
    // only carries the alias char so re-emitting produces the same
    // short ^A{id} form. printerFontName remains undefined — that field
    // is for the long ^A@,…E:NAME.TTF form, not for alias-based refs.
    const { labelConfig, objects } = parseZPL(
      '^XA^CWM,E:ARIAL.TTF^FO10,10^AMN,30,0^FDHi^FS^XZ',
      8,
    );
    expect(labelConfig.customFonts).toEqual([
      { alias: 'M', path: 'E:ARIAL.TTF' },
    ]);
    expect(objects).toHaveLength(1);
    expect(props(objects[0]).fontId).toBe('M');
    expect(props(objects[0]).printerFontName).toBeUndefined();
  });

  it('drops fontId for ^A{id} matching the active ^CF (default semantics)', () => {
    // ^CFM then ^AMN repeats the default font. The model says
    // "field uses the label default" by leaving fontId undefined, and
    // the generator's default-fallback branch restores the ^AM emit.
    const { objects } = parseZPL(
      '^XA^CFM,30,0^FO10,10^AMN,30,0^FDHi^FS^XZ',
      8,
    );
    expect(props(objects[0]).fontId).toBeUndefined();
    expect(props(objects[0]).printerFontName).toBeUndefined();
  });

  it('ignores invalid ^CW arguments', () => {
    const { labelConfig } = parseZPL('^XA^CW,^XZ', 8);
    expect(labelConfig.customFonts).toBeUndefined();
  });

  it('upserts ^CW by alias, keeping the last mapping per alias', () => {
    // Two ^CW lines for the same alias: the second should overwrite
    // the first in customFonts, matching the runtime fontAliases.set
    // last-wins semantics.
    const { labelConfig } = parseZPL(
      '^XA^CWM,E:OLD.TTF^CWM,E:NEW.TTF^XZ',
      8,
    );
    expect(labelConfig.customFonts).toEqual([
      { alias: 'M', path: 'E:NEW.TTF' },
    ]);
  });

  it('keeps separate ^CW mappings that share a path but use different aliases', () => {
    const { labelConfig } = parseZPL(
      '^XA^CWM,E:FOO.TTF^CWN,E:FOO.TTF^XZ',
      8,
    );
    expect(labelConfig.customFonts).toEqual([
      { alias: 'M', path: 'E:FOO.TTF' },
      { alias: 'N', path: 'E:FOO.TTF' },
    ]);
  });

  it('parses ~SD instant darkness', () => {
    expect(parseZPL('~SD07^XA^XZ', 8).labelConfig.instantDarkness).toBe(7);
    expect(parseZPL('~SD30^XA^XZ', 8).labelConfig.instantDarkness).toBe(30);
  });

  it('parses ^MD darkness including 0', () => {
    expect(parseZPL('^XA^MD0^XZ', 8).labelConfig.darkness).toBe(0);
    expect(parseZPL('^XA^MD15^XZ', 8).labelConfig.darkness).toBe(15);
    expect(parseZPL('^XA^MD-10^XZ', 8).labelConfig.darkness).toBe(-10);
  });

  it('ignores ^MD outside the supported range', () => {
    const { labelConfig } = parseZPL('^XA^MD99^XZ', 8);
    expect(labelConfig.darkness).toBeUndefined();
  });

  it('parses ^MT media type', () => {
    expect(parseZPL('^XA^MTT^XZ', 8).labelConfig.mediaType).toBe('T');
    expect(parseZPL('^XA^MTD^XZ', 8).labelConfig.mediaType).toBe('D');
  });

  it('parses ^PO print orientation', () => {
    expect(parseZPL('^XA^PON^XZ', 8).labelConfig.printOrientation).toBe('N');
    expect(parseZPL('^XA^POI^XZ', 8).labelConfig.printOrientation).toBe('I');
  });

  it('parses ^CF into defaultFontId and defaultFontHeight', () => {
    const { labelConfig } = parseZPL('^XA^CF0,40^XZ', 8);
    expect(labelConfig.defaultFontId).toBe('0');
    expect(labelConfig.defaultFontHeight).toBe(40);
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
    // FO/N h=30 → obj.y = 40 - 4.62.
    expect(objects[0]?.x).toBeCloseTo(30);
    expect(objects[0]?.y).toBeCloseTo(40 - 4.62);
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

  it('does not flag built-in ^A{letter} fonts (A-H) as partial', () => {
    // ^AB references the built-in Zebra font B — the parser pins it on
    // the field as fontId="B" and the generator re-emits the short
    // form, so the import is lossless and stays out of partial.
    const { importReport } = parseZPL('^XA^FO0,0^ABN,30,0^FDText^FS^XZ', 8);
    expect(importReport.partial.some((e) => e.startsWith('^A'))).toBe(false);
  });

  it('flags ^A{alias} as partial when the alias has no ^CW mapping', () => {
    // ^AM without a preceding ^CWM is a dangling reference: the model
    // captures fontId="M" so editing stays lossless, but we surface a
    // partial-import warning because the rendered output will fall
    // back to font 0 on the printer.
    const { importReport } = parseZPL('^XA^FO0,0^AMN,30,0^FDText^FS^XZ', 8);
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
    expect(importReport.findings).toHaveLength(0);
  });
});

describe('parseZPL: importReport.findings', () => {
  it('emits one finding per kind with pageIndex=0 (set by service layer later)', () => {
    const zpl = '^XA^FO0,0^A@N,30,0,E:ARIAL.TTF^FDText^FS^IMR:LOGO.GRF^XX99^XZ';
    const { importReport } = parseZPL(zpl, 8);
    const kinds = importReport.findings.map((f) => f.kind);
    expect(kinds).toContain('partial');
    expect(kinds).toContain('browserLimit');
    expect(kinds).toContain('unknown');
    expect(importReport.findings.every((f) => f.pageIndex === 0)).toBe(true);
  });

  it('partial findings are deduplicated by command code', () => {
    // Two ^A@ uses → one partial finding for "^A@".
    const zpl = '^XA^FO0,0^A@N,30,0,E:A.TTF^FDFirst^FS^FO0,50^A@N,30,0,E:B.TTF^FDSecond^FS^XZ';
    const { importReport } = parseZPL(zpl, 8);
    const partialFindings = importReport.findings.filter((f) => f.kind === 'partial');
    expect(partialFindings).toHaveLength(1);
    expect(partialFindings[0]?.command).toBe('^A@');
  });
});

// ── ^FO 3rd parameter (justification) ─────────────────────────────────────────

describe('parseZPL — ^FO with justification parameter', () => {
  it('parses ^FO with a 3rd parameter without errors', () => {
    const { objects } = parseZPL('^XA^FO100,200,1^A0N,30,0^FDJustified^FS^XZ', 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.x).toBeCloseTo(100);
    expect(objects[0]?.y).toBeCloseTo(200 - 4.62);
    expect(props(objects[0]).content).toBe('Justified');
  });
});

describe('^FN / template variables', () => {
  it('creates a Variable for each distinct ^FN and binds the field', () => {
    const zpl = '^XA^FO10,20^A0N,30,30^FN1^FDDefault^FS^XZ';
    const { objects, variables } = parseZPL(zpl);
    expect(variables).toHaveLength(1);
    expect(variables[0]?.fnNumber).toBe(1);
    expect(variables[0]?.defaultValue).toBe('Default');
    expect(variables[0]?.name).toBe('field_1');
    expect(objects[0]?.variableId).toBe(variables[0]?.id);
  });

  it('derives the Variable name from a preceding ^FX comment', () => {
    const zpl = '^XA^FXField: Customer Name^FO10,20^A0N,30,30^FN1^FDJohn^FS^XZ';
    const { variables } = parseZPL(zpl);
    expect(variables[0]?.name).toBe('Customer_Name');
  });

  it('reuses the same Variable when multiple fields share an fnNumber', () => {
    const zpl =
      '^XA' +
      '^FO10,20^A0N,30,30^FN1^FDA^FS' +
      '^FO10,60^A0N,30,30^FN1^FDA^FS' +
      '^XZ';
    const { objects, variables } = parseZPL(zpl);
    expect(variables).toHaveLength(1);
    const [a, b] = objects;
    expect(a?.variableId).toBe(variables[0]?.id);
    expect(b?.variableId).toBe(variables[0]?.id);
  });

  it('ignores out-of-range ^FN numbers and records a partial finding', () => {
    const zpl = '^XA^FO10,20^A0N,30,30^FN0^FDIgnored^FS^XZ';
    const { variables, objects, importReport } = parseZPL(zpl);
    expect(variables).toHaveLength(0);
    expect(objects[0]?.variableId).toBeUndefined();
    expect(importReport.partial).toContain('^FN');
  });
});
