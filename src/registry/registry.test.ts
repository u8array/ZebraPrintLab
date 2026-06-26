import { describe, it, expect } from 'vitest';
import { ObjectRegistry, getEntry } from './index';
import type { LabelObjectBase } from '../types/LabelObject';
import { defined } from '../test/helpers';

function makeObj<P extends object>(type: string, props: P, overrides?: Partial<LabelObjectBase>): LabelObjectBase & { props: P } {
  return {
    id: 'test-id',
    type,
    x: 100,
    y: 200,
    rotation: 0,
    ...overrides,
    props,
  };
}

// ── text ──────────────────────────────────────────────────────────────────────

describe('text.toZPL', () => {
  const def = defined(ObjectRegistry['text']);

  it('emits ^FO, ^A0, ^FD^FS for basic text', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Hello', fontHeight: 30, fontWidth: 0, rotation: 'N',
    }));
    // obj is at (100, 200), the Konva render position. The emitted ^FO
    // shifts to the ZPL cap-top anchor: for N h=30, dy = 30 * 0.154 = 4.62,
    // rounded to integer dots = 5 ⇒ 200 + 5 = 205.
    expect(zpl).toContain('^FO100,205');
    expect(zpl).toContain('^A0N,30,0');
    expect(zpl).toContain('^FDHello^FS');
  });

  it('uses ^FT when positionType is FT', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Hi', fontHeight: 20, fontWidth: 0, rotation: 'N',
    }, { positionType: 'FT' }));
    // FT shifts to the baseline: for N h=20, dy = 20 * 0.92 = 18.4,
    // rounded to integer dots = 18 ⇒ 200 + 18 = 218.
    expect(zpl).toContain('^FT100,218');
  });

  it('emits a bare ^FR for reverse text (knocks out of a separate box)', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Rev', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: true,
    }));
    // Spec-true reverse: ^FR before ^FD knocks the glyphs out of whatever is
    // drawn behind the field. No synthesized background box, so the field
    // round-trips with its own anchor; the black box is the user's own object.
    expect(zpl).toContain('^FR^FD');
    expect(zpl).not.toContain('^GB');
    expect(zpl).not.toContain('^LRY');
  });

  it('emits ^FB for field block properties', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Block', fontHeight: 30, fontWidth: 0, rotation: 'N',
      blockWidth: 400, blockLines: 3, blockLineSpacing: 5, blockJustify: 'C',
    }));
    expect(zpl).toContain('^FB400,3,5,C,0');
  });

  it('emits ^FB hanging indent in slot e', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Block', fontHeight: 30, fontWidth: 0, rotation: 'N',
      blockWidth: 400, blockLines: 3, blockLineSpacing: 0, blockJustify: 'L',
      blockHangingIndent: 40,
    }));
    expect(zpl).toContain('^FB400,3,0,L,40');
  });

  it('does not emit ^FB when blockWidth is absent', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'No block', fontHeight: 30, fontWidth: 0, rotation: 'N',
    }));
    expect(zpl).not.toContain('^FB');
  });

  it('emits ^A@ with printer font name instead of ^A0', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Custom', fontHeight: 40, fontWidth: 20, rotation: 'N',
      printerFontName: 'ARIAL.TTF',
    }));
    expect(zpl).toContain('^A@N,40,20,E:ARIAL.TTF');
    expect(zpl).not.toContain('^A0');
  });

  it('^A@ preserves rotation', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Rot', fontHeight: 30, fontWidth: 0, rotation: 'R',
      printerFontName: 'HELVETICA.TTF',
    }));
    expect(zpl).toContain('^A@R,30,0,E:HELVETICA.TTF');
  });

  it('emits ^A{fontId} short form when fontId is set', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'A', fontHeight: 30, fontWidth: 0, rotation: 'N', fontId: 'M',
    }));
    expect(zpl).toContain('^AMN,30,0');
    expect(zpl).not.toContain('^A0');
    expect(zpl).not.toContain('^A@');
  });

  it('fontId wins over printerFontName when both are set', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'A', fontHeight: 30, fontWidth: 0, rotation: 'N',
      fontId: 'M', printerFontName: 'ARIAL.TTF',
    }));
    expect(zpl).toContain('^AMN,30,0');
    expect(zpl).not.toContain('^A@');
  });

  it('uses label.defaultFontId as fallback when no field-level font is set', () => {
    const labelWithDefault: Parameters<typeof def.toZPL>[1] = {
      label: { widthMm: 100, heightMm: 60, dpmm: 8, defaultFontId: 'M' },
    };
    const zpl = def.toZPL(
      makeObj('text', { content: 'A', fontHeight: 30, fontWidth: 0, rotation: 'N' }),
      labelWithDefault,
    );
    expect(zpl).toContain('^AMN,30,0');
    expect(zpl).not.toContain('^A0');
  });

  it('keeps ^A0 fallback when neither field nor label sets a font', () => {
    const zpl = def.toZPL(
      makeObj('text', { content: 'A', fontHeight: 30, fontWidth: 0, rotation: 'N' }),
      { label: { widthMm: 100, heightMm: 60, dpmm: 8 } },
    );
    expect(zpl).toContain('^A0N,30,0');
  });
});

// ── box ───────────────────────────────────────────────────────────────────────

describe('box.toZPL', () => {
  const def = defined(ObjectRegistry['box']);

  it('emits ^GB with correct dimensions for an unfilled box', () => {
    const zpl = def.toZPL(makeObj('box', {
      width: 200, height: 100, thickness: 3, filled: false, color: 'B', rounding: 0,
    }));
    expect(zpl).toContain('^GB200,100,3,B,0');
  });

  it('uses min(w,h) as thickness for a filled box', () => {
    const zpl = def.toZPL(makeObj('box', {
      width: 200, height: 100, thickness: 3, filled: true, color: 'B', rounding: 0,
    }));
    // filled → thickness = min(200, 100) = 100
    expect(zpl).toContain('^GB200,100,100,B,0');
  });

  it('includes rounding parameter', () => {
    const zpl = def.toZPL(makeObj('box', {
      width: 100, height: 100, thickness: 3, filled: false, color: 'B', rounding: 5,
    }));
    expect(zpl).toContain(',5');
  });
});

// ── line ──────────────────────────────────────────────────────────────────────

describe('line.toZPL', () => {
  const def = defined(ObjectRegistry['line']);

  it('emits horizontal ^GB for angle 0', () => {
    const zpl = def.toZPL(makeObj('line', {
      angle: 0, length: 500, thickness: 3, color: 'B',
    }));
    expect(zpl).toContain('^GB500,3,3,B,0');
  });

  it('emits vertical ^GB for angle 90', () => {
    const zpl = def.toZPL(makeObj('line', {
      angle: 90, length: 300, thickness: 5, color: 'B',
    }));
    expect(zpl).toContain('^GB5,300,5,B,0');
  });

  it('emits horizontal ^GB shifted left for angle 180', () => {
    // obj.x=100, angle=180, length=500 → box must start at x=100-500=-400
    const zpl = def.toZPL(makeObj('line', {
      angle: 180, length: 500, thickness: 3, color: 'B',
    }));
    expect(zpl).toContain('^FO-400,200');
    expect(zpl).toContain('^GB500,3,3,B,0');
  });

  it('emits vertical ^GB shifted up for angle 270', () => {
    // obj.y=200, angle=270, length=300 → box must start at y=200-300=-100
    const zpl = def.toZPL(makeObj('line', {
      angle: 270, length: 300, thickness: 5, color: 'B',
    }));
    expect(zpl).toContain('^FO100,-100');
    expect(zpl).toContain('^GB5,300,5,B,0');
  });

  it('emits ^GD for diagonal angles', () => {
    const zpl = def.toZPL(makeObj('line', {
      angle: 45, length: 200, thickness: 3, color: 'B',
    }));
    expect(zpl).toContain('^GD');
  });
});

// ── ellipse ───────────────────────────────────────────────────────────────────

describe('ellipse.toZPL', () => {
  const def = defined(ObjectRegistry['ellipse']);

  it('emits ^GE with correct dimensions for non-square axes', () => {
    const zpl = def.toZPL(makeObj('ellipse', {
      width: 150, height: 100, thickness: 3, filled: false, color: 'B',
    }));
    expect(zpl).toContain('^GE150,100,3,B');
  });

  it('uses min(w,h) as thickness when filled', () => {
    const zpl = def.toZPL(makeObj('ellipse', {
      width: 150, height: 100, thickness: 3, filled: true, color: 'B',
    }));
    expect(zpl).toContain('^GE150,100,100,B');
  });

  it('collapses to ^GC when width equals height', () => {
    const zpl = def.toZPL(makeObj('ellipse', {
      width: 80, height: 80, thickness: 3, filled: false, color: 'B',
    }));
    expect(zpl).toContain('^GC80,3,B');
    expect(zpl).not.toContain('^GE');
  });
});

// ── ellipse (lockAspect) ─────────────────────────────────────────────────────

describe('ellipse with lockAspect (former circle)', () => {
  const def = defined(ObjectRegistry['ellipse']);

  it('keeps width === height via min(sx, sy) on commitTransform', () => {
    const result = def.commitTransform!(
      makeObj('ellipse', {
        width: 100, height: 100, thickness: 3, filled: false, color: 'B', lockAspect: true,
      }),
      { sx: 2, sy: 1.5, snap: (n) => n, nodeHeight: 0, anchor: null },
    );
    expect(result).toEqual({ width: 150, height: 150 });
  });

  it('clamps diameter to at least 1 when scaled to zero', () => {
    const result = def.commitTransform!(
      makeObj('ellipse', {
        width: 100, height: 100, thickness: 3, filled: false, color: 'B', lockAspect: true,
      }),
      { sx: 0, sy: 0, snap: (n) => n, nodeHeight: 0, anchor: null },
    );
    expect(result).toEqual({ width: 1, height: 1 });
  });
});

// ── code128 ───────────────────────────────────────────────────────────────────

describe('code128.toZPL', () => {
  const def = defined(ObjectRegistry['code128']);

  it('emits ^BC and ^FD', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: 'ABCDEF', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false, rotation: 'N',
    }));
    expect(zpl).toContain('^BCN,100,Y,N,N');
    expect(zpl).toContain('^FDABCDEF^FS');
  });

  it('emits ^BY when moduleWidth is not 2', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: '123', height: 100, moduleWidth: 5,
      printInterpretation: true, checkDigit: false, rotation: 'N',
    }));
    expect(zpl).toContain('^BY5');
  });

  it('always emits ^BY to prevent ZPL state leaking to subsequent barcodes', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: '123', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false, rotation: 'N',
    }));
    expect(zpl).toContain('^BY2');
  });
});

// ── rotation ──────────────────────────────────────────────────────────────────

describe('barcode rotation in ZPL output', () => {
  type Rot = 'N' | 'R' | 'I' | 'B';
  it.each<[string, string, Rot, Record<string, unknown>]>([
    ['code128',    '^BCR,', 'R', { height: 100, moduleWidth: 2, printInterpretation: true, checkDigit: false }],
    ['code39',     '^B3I,', 'I', { height: 100, moduleWidth: 2, printInterpretation: true, checkDigit: false }],
    ['ean13',      '^BEB,', 'B', { height: 100, moduleWidth: 2, printInterpretation: true }],
    ['qrcode',     '^BQR,', 'R', { magnification: 4, errorCorrection: 'Q' }],
    ['datamatrix', '^BXI,', 'I', { dimension: 5, quality: 200, gs1: false }],
    ['pdf417',     '^B7B,', 'B', { rowHeight: 4, securityLevel: 0, columns: 0, moduleWidth: 2 }],
    ['aztec',      '^B0R,', 'R', { magnification: 4, ecLevel: 0 }],
    ['codabar',    '^BKR,', 'R', { height: 100, moduleWidth: 2, printInterpretation: true, checkDigit: false }],
  ])('%s emits orientation in command param', (type, expected, rotation, baseProps) => {
    const def = defined(getEntry(type));
    const content = type === 'ean13' ? '590123412345' : 'X';
    const zpl = def.toZPL(makeObj(type, { content, ...baseProps, rotation }));
    expect(zpl).toContain(expected);
  });
});

// ── code39 ────────────────────────────────────────────────────────────────────

describe('code39.toZPL', () => {
  const def = defined(ObjectRegistry['code39']);

  it('emits ^B3 barcode command', () => {
    const zpl = def.toZPL(makeObj('code39', {
      content: 'ABC', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false, rotation: 'N',
    }));
    expect(zpl).toContain('^B3');
    expect(zpl).toContain('^FDABC^FS');
  });
});

// ── qrcode ────────────────────────────────────────────────────────────────────

describe('qrcode.toZPL', () => {
  const def = defined(ObjectRegistry['qrcode']);

  it('emits ^BQ with magnification and ^FD with error correction prefix', () => {
    const zpl = def.toZPL(makeObj('qrcode', {
      content: 'https://example.com', magnification: 6, errorCorrection: 'Q', model: 2, rotation: 'N',
    }));
    expect(zpl).toContain('^BQN,2,6');
    expect(zpl).toContain('^FDQA,https://example.com^FS');
  });

  it('emits the model (^BQ b) so Model 1 is not silently changed to 2', () => {
    const zpl = def.toZPL(makeObj('qrcode', {
      content: 'x', magnification: 4, errorCorrection: 'Q', model: 1, rotation: 'N',
    }));
    expect(zpl).toContain('^BQN,1,4');
  });
});

describe('qrcode.normalizeChanges', () => {
  const def = defined(ObjectRegistry['qrcode']);
  const normalize = defined(def.normalizeChanges);
  const baseObj = makeObj('qrcode', {
    content: 'x', magnification: 4, errorCorrection: 'Q', rotation: 'N',
  });

  it('clamps negative y to 0 for ^FO', () => {
    expect(normalize(baseObj, { y: -10 })).toEqual({ y: 0 });
    expect(normalize(baseObj, { y: -1 })).toEqual({ y: 0 });
  });

  it('passes through y >= 0 unchanged', () => {
    expect(normalize(baseObj, { y: 0 })).toEqual({ y: 0 });
    expect(normalize(baseObj, { y: 50 })).toEqual({ y: 50 });
  });

  it('passes through changes without y', () => {
    const changes = { x: 100 };
    expect(normalize(baseObj, changes)).toBe(changes);
  });

  it('does not clamp when positionType is FT (different firmware quirk)', () => {
    const ftObj = { ...baseObj, positionType: 'FT' as const };
    expect(normalize(ftObj, { y: -10 })).toEqual({ y: -10 });
  });

  it('respects positionType in incoming changes (FO → FT switch)', () => {
    const ftObj = { ...baseObj, positionType: 'FT' as const };
    expect(normalize(ftObj, { y: -10, positionType: 'FO' })).toEqual({ y: 0, positionType: 'FO' });
  });

  it('preserves other change fields when clamping', () => {
    expect(normalize(baseObj, { y: -10, x: 50, rotation: 90 }))
      .toEqual({ y: 0, x: 50, rotation: 90 });
  });
});

// ── datamatrix ────────────────────────────────────────────────────────────────

describe('datamatrix.toZPL', () => {
  const def = defined(ObjectRegistry['datamatrix']);

  it('emits ^BX with dimension and quality', () => {
    const zpl = def.toZPL(makeObj('datamatrix', {
      content: 'DM123', dimension: 8, quality: 200, rotation: 'N', gs1: false,
    }));
    expect(zpl).toContain('^BXN,8,200');
    expect(zpl).toContain('^FDDM123^FS');
  });

  it('GS1 mode sets the escape param and FNC1-escaped field data', () => {
    const zpl = def.toZPL(makeObj('datamatrix', {
      content: `010950110153000310ABC123\x1d2112345`,
      dimension: 8, quality: 200, rotation: 'N', gs1: true,
    }));
    expect(zpl).toContain('^BXN,8,200,,,,_');
    expect(zpl).toContain('^FD_1010950110153000310ABC123_12112345^FS');
  });
});

// ── pdf417 ────────────────────────────────────────────────────────────────────

describe('pdf417.toZPL', () => {
  const def = defined(ObjectRegistry['pdf417']);

  it('emits ^B7 with row height, security, and columns', () => {
    const zpl = def.toZPL(makeObj('pdf417', {
      content: 'PDF', rowHeight: 10, securityLevel: 2, columns: 4, moduleWidth: 2, rotation: 'N',
    }));
    expect(zpl).toContain('^B7N,10,2,4,,,');
    expect(zpl).toContain('^FDPDF^FS');
  });

  it('emits ^BY when moduleWidth is not 2', () => {
    const zpl = def.toZPL(makeObj('pdf417', {
      content: 'X', rowHeight: 10, securityLevel: 0, columns: 0, moduleWidth: 3, rotation: 'N',
    }));
    expect(zpl).toContain('^BY3');
  });
});

// ── symbol (^GS) ──────────────────────────────────────────────────────────────

describe('symbol.toZPL', () => {
  const def = defined(ObjectRegistry['symbol']);

  it('emits ^GS with rotation, height, width and ^FD with symbol code', () => {
    const zpl = def.toZPL(makeObj('symbol', {
      symbol: 'A', height: 50, width: 50, rotation: 'N',
    }));
    expect(zpl).toBe('^FO100,200^GSN,50,50^FDA^FS');
  });

  it('round-trips all five canonical codes', () => {
    for (const code of ['A', 'B', 'C', 'D', 'E'] as const) {
      const zpl = def.toZPL(makeObj('symbol', {
        symbol: code, height: 30, width: 30, rotation: 'N',
      }));
      expect(zpl).toContain(`^FD${code}^FS`);
    }
  });

  it('preserves rotation letter in ^GS first parameter', () => {
    for (const rot of ['N', 'R', 'I', 'B'] as const) {
      const zpl = def.toZPL(makeObj('symbol', {
        symbol: 'B', height: 30, width: 30, rotation: rot,
      }));
      expect(zpl).toContain(`^GS${rot},30,30`);
    }
  });
});

// ── serial ────────────────────────────────────────────────────────────────────

describe('serial.toZPL', () => {
  const def = defined(ObjectRegistry['serial']);

  it('emits ^SN for SN mode', () => {
    const zpl = def.toZPL(makeObj('serial', {
      content: '001', increment: 1, fontHeight: 30, fontWidth: 0, rotation: 'N', zplMode: 'SN',
    }));
    expect(zpl).toContain('^FD001^FS');
    expect(zpl).toContain('^SN001,1,Y');
  });

  it('emits ^SF for SF mode', () => {
    const zpl = def.toZPL(makeObj('serial', {
      content: '001', increment: 1, fontHeight: 30, fontWidth: 0, rotation: 'N', zplMode: 'SF',
    }));
    expect(zpl).toContain('^SF1,3,Y');
    expect(zpl).toContain('^FD001^FS');
  });

  it('honours label.defaultFontId in the ^A fallback', () => {
    const zpl = def.toZPL(
      makeObj('serial', {
        content: '001', increment: 1, fontHeight: 30, fontWidth: 0, rotation: 'N', zplMode: 'SN',
      }),
      { label: { widthMm: 100, heightMm: 60, dpmm: 8, defaultFontId: 'M' } },
    );
    expect(zpl).toContain('^AMN,30,0');
    expect(zpl).not.toContain('^A0');
  });

  it('strips ^/~ and other non-charset chars from ZPL-imported content', () => {
    // contentSpec restricts to alphanumerics at input; toZPL re-applies the
    // filter so ZPL-imported designs can't smuggle ^ (command), ~ (format),
    // or , (parameter separator) into the ^SN start parameter or FD payload.
    const zpl = def.toZPL(makeObj('serial', {
      content: 'a^b,c', increment: 1, fontHeight: 30, fontWidth: 0, rotation: 'N', zplMode: 'SN',
    }));
    expect(zpl).toContain('^SNabc,1,Y^FDabc^FS');
  });

  it('uses sanitized length for ^SF pad-digits', () => {
    // Pad-digits must match the actually-emitted FD payload, not the raw
    // (pre-sanitisation) content length.
    const zpl = def.toZPL(makeObj('serial', {
      content: 'ab^cd', increment: 1, fontHeight: 30, fontWidth: 0, rotation: 'N', zplMode: 'SF',
    }));
    // 'ab^cd' → 'abcd' (4 chars after stripping ^)
    expect(zpl).toContain('^SF1,4,Y^FDabcd^FS');
  });
});

// ── registry completeness ─────────────────────────────────────────────────────

describe('ObjectRegistry', () => {
  const expectedTypes = [
    'text', 'code128', 'code39', 'ean13', 'upca', 'ean8', 'upce',
    'interleaved2of5', 'code93', 'qrcode', 'datamatrix', 'pdf417',
    'box', 'ellipse', 'line', 'serial', 'image',
  ];

  it('contains all expected object types', () => {
    for (const type of expectedTypes) {
      expect(getEntry(type)).toBeDefined();
    }
  });

  it('every registered type has a toZPL function', () => {
    for (const [key, def] of Object.entries(ObjectRegistry)) {
      expect(typeof def.toZPL).toBe('function');
      expect(key).toBeTruthy();
    }
  });

  it('every registered type has a valid group', () => {
    const validGroups = new Set(['text', 'code-1d', 'code-2d', 'code-postal', 'shape']);
    for (const def of Object.values(ObjectRegistry)) {
      expect(validGroups.has(def.group)).toBe(true);
    }
  });

  // The palette swaps the mnemonic glyph for `zplCmd` in power-user mode; a
  // missing one silently falls back to the glyph, so guard every type has it.
  it('every registered type has a non-empty zplCmd', () => {
    for (const [key, def] of Object.entries(ObjectRegistry)) {
      expect(def.zplCmd, `${key} is missing zplCmd`).toMatch(/^\^[A-Z0-9]{1,2}$/);
    }
  });

  // Without commitTransform or uniformScaleProp the drag is a silent
  // no-op (was the aztec regression). heightLocked types skip the
  // transformer entirely so they're exempt.
  it('every resizable code-2d type can commit a resize', () => {
    for (const [key, def] of Object.entries(ObjectRegistry)) {
      if (def.group !== 'code-2d') continue;
      if (def.heightLocked) continue;
      const hasCommit = !!def.commitTransform || !!def.uniformScaleProp;
      expect(hasCommit, `${key} is missing commitTransform or uniformScaleProp`).toBe(true);
    }
  });
});
