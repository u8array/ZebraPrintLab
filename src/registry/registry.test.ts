import { describe, it, expect } from 'vitest';
import { ObjectRegistry } from './index';
import type { LabelObjectBase } from '../types/ObjectType';
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
    expect(zpl).toContain('^FO100,200');
    expect(zpl).toContain('^A0N,30,0');
    expect(zpl).toContain('^FDHello^FS');
  });

  it('uses ^FT when positionType is FT', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Hi', fontHeight: 20, fontWidth: 0, rotation: 'N',
    }, { positionType: 'FT' }));
    expect(zpl).toContain('^FT100,200');
  });

  it('emits ^LRY / ^LRN when reverse is true', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Rev', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: true,
    }));
    expect(zpl).toContain('^LRY');
    expect(zpl).toContain('^LRN');
  });

  it('emits ^FB for field block properties', () => {
    const zpl = def.toZPL(makeObj('text', {
      content: 'Block', fontHeight: 30, fontWidth: 0, rotation: 'N',
      blockWidth: 400, blockLines: 3, blockLineSpacing: 5, blockJustify: 'C',
    }));
    expect(zpl).toContain('^FB400,3,5,C,0');
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

  it('emits ^GE with correct dimensions', () => {
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
});

// ── code128 ───────────────────────────────────────────────────────────────────

describe('code128.toZPL', () => {
  const def = defined(ObjectRegistry['code128']);

  it('emits ^BC and ^FD', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: 'ABCDEF', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false,
    }));
    expect(zpl).toContain('^BCN,100,Y,N,N');
    expect(zpl).toContain('^FDABCDEF^FS');
  });

  it('emits ^BY when moduleWidth is not 2', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: '123', height: 100, moduleWidth: 5,
      printInterpretation: true, checkDigit: false,
    }));
    expect(zpl).toContain('^BY5');
  });

  it('always emits ^BY to prevent ZPL state leaking to subsequent barcodes', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: '123', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false,
    }));
    expect(zpl).toContain('^BY2');
  });
});

// ── code39 ────────────────────────────────────────────────────────────────────

describe('code39.toZPL', () => {
  const def = defined(ObjectRegistry['code39']);

  it('emits ^B3 barcode command', () => {
    const zpl = def.toZPL(makeObj('code39', {
      content: 'ABC', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false,
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
      content: 'https://example.com', magnification: 6, errorCorrection: 'Q',
    }));
    expect(zpl).toContain('^BQN,2,6');
    expect(zpl).toContain('^FDQA,https://example.com^FS');
  });
});

describe('qrcode.normalizeChanges', () => {
  const def = defined(ObjectRegistry['qrcode']);
  const normalize = defined(def.normalizeChanges);
  const baseObj = makeObj('qrcode', {
    content: 'x', magnification: 4, errorCorrection: 'Q',
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
      content: 'DM123', dimension: 8, quality: 200,
    }));
    expect(zpl).toContain('^BXN,8,200');
    expect(zpl).toContain('^FDDM123^FS');
  });
});

// ── pdf417 ────────────────────────────────────────────────────────────────────

describe('pdf417.toZPL', () => {
  const def = defined(ObjectRegistry['pdf417']);

  it('emits ^B7 with row height, security, and columns', () => {
    const zpl = def.toZPL(makeObj('pdf417', {
      content: 'PDF', rowHeight: 10, securityLevel: 2, columns: 4, moduleWidth: 2,
    }));
    expect(zpl).toContain('^B7N,10,2,4,,,');
    expect(zpl).toContain('^FDPDF^FS');
  });

  it('emits ^BY when moduleWidth is not 2', () => {
    const zpl = def.toZPL(makeObj('pdf417', {
      content: 'X', rowHeight: 10, securityLevel: 0, columns: 0, moduleWidth: 3,
    }));
    expect(zpl).toContain('^BY3');
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
      expect(ObjectRegistry[type]).toBeDefined();
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
});
