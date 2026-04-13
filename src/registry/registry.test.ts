import { describe, it, expect } from 'vitest';
import { ObjectRegistry } from './index';
import type { LabelObjectBase } from '../types/ObjectType';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function defined<T>(val: T | undefined | null): T {
  expect(val).toBeDefined();
  return val as T;
}

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

// â”€â”€ text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
});

// â”€â”€ box â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    // filled â†’ thickness = min(200, 100) = 100
    expect(zpl).toContain('^GB200,100,100,B,0');
  });

  it('includes rounding parameter', () => {
    const zpl = def.toZPL(makeObj('box', {
      width: 100, height: 100, thickness: 3, filled: false, color: 'B', rounding: 5,
    }));
    expect(zpl).toContain(',5');
  });
});

// â”€â”€ line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  it('emits ^GD for diagonal angles', () => {
    const zpl = def.toZPL(makeObj('line', {
      angle: 45, length: 200, thickness: 3, color: 'B',
    }));
    expect(zpl).toContain('^GD');
  });
});

// â”€â”€ ellipse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ code128 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  it('does not emit ^BY when moduleWidth is default 2', () => {
    const zpl = def.toZPL(makeObj('code128', {
      content: '123', height: 100, moduleWidth: 2,
      printInterpretation: true, checkDigit: false,
    }));
    expect(zpl).not.toContain('^BY');
  });
});

// â”€â”€ code39 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ qrcode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ datamatrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ pdf417 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ serial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ registry completeness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const validGroups = new Set(['text', 'code', 'shape']);
    for (const def of Object.values(ObjectRegistry)) {
      expect(validGroups.has(def.group)).toBe(true);
    }
  });
});
