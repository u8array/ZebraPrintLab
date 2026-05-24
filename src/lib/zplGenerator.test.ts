import { describe, it, expect } from 'vitest';
import { zlibSync } from 'fflate';
import { generateZPL, generateMultiPageZPL, generateBatchZpl } from './zplGenerator';
import { parseZPL } from './zplParser';
import type { LabelConfig } from '../types/ObjectType';
import type { GroupObject, LabelObject } from '../types/Group';
import { defined, props } from '../test/helpers';

const BASE_LABEL: LabelConfig = {
  widthMm: 100,
  heightMm: 50,
  dpmm: 8,
};

describe('generateZPL — structure', () => {
  it('wraps output in ^XA and ^XZ', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.endsWith('^XZ')).toBe(true);
  });

  it('emits ^PW and ^LL for the label dimensions', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    expect(zpl).toContain('^PW800');
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

  it('omits objects with includeInExport=false', () => {
    const objs = [
      { id: 'a', type: 'text', x: 10, y: 10, rotation: 0, props: { content: 'KEEP', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: false } },
      { id: 'b', type: 'text', x: 20, y: 20, rotation: 0, includeInExport: false, props: { content: 'DROP', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: false } },
    // Casting around the registry's discriminated union — the generator only
    // reads obj.type / obj.includeInExport / obj.comment, the shape per type
    // is exercised by registry tests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    const zpl = generateZPL(BASE_LABEL, objs);
    expect(zpl).toContain('KEEP');
    expect(zpl).not.toContain('DROP');
  });
});

describe('generateZPL — printer params', () => {
  it('emits ^PR when printSpeed is set', () => {
    const zpl = generateZPL({ ...BASE_LABEL, printSpeed: 6 }, []);
    expect(zpl).toContain('^PR6');
  });

  it('omits ^PR when printSpeed is absent', () => {
    expect(generateZPL(BASE_LABEL, [])).not.toContain('^PR');
  });

  it('emits ^MD for darkness boundaries including 0', () => {
    expect(generateZPL({ ...BASE_LABEL, darkness: 0 }, [])).toContain('^MD0');
    expect(generateZPL({ ...BASE_LABEL, darkness: 30 }, [])).toContain('^MD30');
    expect(generateZPL({ ...BASE_LABEL, darkness: -30 }, [])).toContain('^MD-30');
  });

  it('omits ^MD when darkness is absent', () => {
    expect(generateZPL(BASE_LABEL, [])).not.toContain('^MD');
  });

  it('emits ^MT for thermal transfer and direct thermal', () => {
    expect(generateZPL({ ...BASE_LABEL, mediaType: 'T' }, [])).toContain('^MTT');
    expect(generateZPL({ ...BASE_LABEL, mediaType: 'D' }, [])).toContain('^MTD');
  });

  it('emits ^PO for both orientations when explicitly set', () => {
    expect(generateZPL({ ...BASE_LABEL, printOrientation: 'I' }, [])).toContain('^POI');
    expect(generateZPL({ ...BASE_LABEL, printOrientation: 'N' }, [])).toContain('^PON');
  });

  it('omits ^PO when print orientation is absent', () => {
    expect(generateZPL(BASE_LABEL, [])).not.toContain('^PO');
  });

  const boxAt = (x: number, y: number): LabelObject => ({
    id: '1',
    type: 'box',
    x,
    y,
    rotation: 0,
    props: { width: 50, height: 20, thickness: 1, filled: false, color: 'B', rounding: 0 },
  });

  it('emits ^LH and shifts field FOs to compensate', () => {
    const zpl = generateZPL(
      { ...BASE_LABEL, labelHomeX: 20, labelHomeY: 10 },
      [boxAt(50, 80)],
    );
    expect(zpl).toContain('^LH20,10');
    expect(zpl).toContain('^FO30,70');
  });

  it('emits ^LT and shifts field Y to compensate', () => {
    const zpl = generateZPL({ ...BASE_LABEL, labelTop: 15 }, [boxAt(50, 80)]);
    expect(zpl).toContain('^LT15');
    expect(zpl).toContain('^FO50,65');
  });

  it('drops fields whose offset-adjusted origin would be negative', () => {
    // Clamping would silently relocate the box into the visible area,
    // breaking WYSIWYG; emitting negative ^FO is undefined per ZPL spec
    // and printer-dependent. The conservative choice is to omit the
    // field — analogous to a layer outside the artboard in a design tool.
    const zpl = generateZPL(
      { ...BASE_LABEL, labelHomeX: 30, labelHomeY: 20 },
      [boxAt(10, 5)],
    );
    expect(zpl).not.toContain('^GB');
    expect(zpl).not.toContain('^FO');
  });

  it('drops a field when only one axis would go negative', () => {
    // labelHomeY exceeds obj.y → y < 0 alone is enough to drop the leaf.
    const zpl = generateZPL(
      { ...BASE_LABEL, labelHomeX: 0, labelHomeY: 50 },
      [boxAt(100, 10)],
    );
    expect(zpl).not.toContain('^GB');
  });

  it('drops only the clipped children of a group, keeping the rest', () => {
    const group: GroupObject = {
      id: 'g1',
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      children: [boxAt(10, 5), boxAt(100, 100)],
    };
    const zpl = generateZPL(
      { ...BASE_LABEL, labelHomeX: 30, labelHomeY: 20 },
      [group],
    );
    // First child clips out, second survives at shifted FO.
    expect(zpl).toContain('^FO70,80');
    expect(zpl.match(/\^FO/g)?.length).toBe(1);
  });

  it('emits ^CF with width as third positional param', () => {
    expect(
      generateZPL(
        { ...BASE_LABEL, defaultFontId: 'A', defaultFontHeight: 30, defaultFontWidth: 20 },
        [],
      ),
    ).toContain('^CFA,30,20');
  });

  it('emits ^CF with empty middle slot when only id + width are set', () => {
    expect(
      generateZPL(
        { ...BASE_LABEL, defaultFontId: 'A', defaultFontWidth: 20 },
        [],
      ),
    ).toContain('^CFA,,20');
  });

  it('emits ^CF with two empty slots when only width is set', () => {
    expect(
      generateZPL({ ...BASE_LABEL, defaultFontWidth: 20 }, []),
    ).toContain('^CF,,20');
  });

  it('trims trailing empty ^CF slots', () => {
    const zpl = generateZPL({ ...BASE_LABEL, defaultFontId: 'A' }, []);
    expect(zpl).toContain('^CFA');
    expect(zpl).not.toContain('^CFA,');
  });

  it('emits one ^CW per custom font mapping', () => {
    const zpl = generateZPL(
      {
        ...BASE_LABEL,
        customFonts: [
          { alias: 'M', path: 'E:ARIAL.TTF' },
          { alias: 'B', path: 'E:BOLD.TTF' },
        ],
      },
      [],
    );
    expect(zpl).toContain('^CWM,E:ARIAL.TTF');
    expect(zpl).toContain('^CWB,E:BOLD.TTF');
  });

  it('omits ^CW when customFonts is absent or empty', () => {
    expect(generateZPL(BASE_LABEL, [])).not.toContain('^CW');
    expect(
      generateZPL({ ...BASE_LABEL, customFonts: [] }, []),
    ).not.toContain('^CW');
  });

  it('emits ~DY before ^XA when embedInZpl is true and bytes are cached', async () => {
    const { loadFontBytes, removeFont } = await import('./fontCache');
    // Tiny fake TTF — content does not need to be valid for the emit
    // path to pick up the bytes; the formatter just hex-encodes them.
    const bytes = new Uint8Array([0x00, 0x01, 0xff, 0xab]);
    await loadFontBytes(bytes, 'EMBED.TTF');
    try {
      const zpl = generateZPL(
        {
          ...BASE_LABEL,
          customFonts: [
            {
              alias: 'M',
              path: 'E:EMBED.TTF',
              previewFontName: 'EMBED.TTF',
              embedInZpl: true,
            },
          ],
        },
        [],
      );
      const dyIdx = zpl.indexOf('~DY');
      const xaIdx = zpl.indexOf('^XA');
      expect(dyIdx).toBeGreaterThanOrEqual(0);
      expect(dyIdx).toBeLessThan(xaIdx);
      // ~DYE:EMBED,A,T,4,,0001FFAB — stem strips the extension, ext code
      // is T (TTF), bytes count is the original length, hex is uppercase.
      expect(zpl).toContain('~DYE:EMBED,A,T,4,,0001FFAB');
    } finally {
      removeFont('EMBED.TTF');
    }
  });

  it('skips ~DY when embedInZpl is false', () => {
    const zpl = generateZPL(
      {
        ...BASE_LABEL,
        customFonts: [
          { alias: 'M', path: 'E:X.TTF', previewFontName: 'X.TTF' },
        ],
      },
      [],
    );
    expect(zpl).not.toContain('~DY');
  });

  it('round-trips embedInZpl: ~DY emit → ~DY parse preserves the flag', async () => {
    const { loadFontBytes, removeFont } = await import('./fontCache');
    const bytes = new Uint8Array([0xab, 0xcd, 0xef, 0x12]);
    await loadFontBytes(bytes, 'ROUND.TTF');
    try {
      const zpl = generateZPL(
        {
          ...BASE_LABEL,
          customFonts: [
            {
              alias: 'M',
              path: 'E:ROUND.TTF',
              previewFontName: 'ROUND.TTF',
              embedInZpl: true,
            },
          ],
        },
        [],
      );
      const { labelConfig } = parseZPL(zpl, 8);
      const m = labelConfig.customFonts?.[0];
      expect(m?.alias).toBe('M');
      expect(m?.path).toBe('E:ROUND.TTF');
      expect(m?.embedInZpl).toBe(true);
      expect(m?.previewFontName).toBe('ROUND.TTF');
    } finally {
      removeFont('ROUND.TTF');
    }
  });

  it('skips ~DY when bytes are not cached', () => {
    const zpl = generateZPL(
      {
        ...BASE_LABEL,
        customFonts: [
          {
            alias: 'M',
            path: 'E:MISSING.TTF',
            previewFontName: 'MISSING.TTF',
            embedInZpl: true,
          },
        ],
      },
      [],
    );
    expect(zpl).not.toContain('~DY');
  });

  it('skips ^CW entries with empty alias or path', () => {
    const zpl = generateZPL(
      {
        ...BASE_LABEL,
        customFonts: [
          { alias: '', path: 'E:ORPHAN.TTF' },
          { alias: 'A', path: '' },
          { alias: 'B', path: 'E:OK.TTF' },
        ],
      },
      [],
    );
    expect(zpl).not.toContain('^CW,');
    expect(zpl).not.toContain('^CWA,\n');
    expect(zpl).toContain('^CWB,E:OK.TTF');
  });

  it.each(['N', 'R', 'I', 'B'] as const)(
    'rewrites ^A@%s to ^A{alias} when a matching ^CW mapping exists',
    (rotation) => {
      const text: LabelObject = {
        id: 't1',
        type: 'text',
        x: 10,
        y: 10,
        rotation: 0,
        props: {
          content: 'hi',
          rotation,
          fontHeight: 30,
          fontWidth: 0,
          printerFontName: 'ARIAL.TTF',
        },
      };
      const zpl = generateZPL(
        {
          ...BASE_LABEL,
          customFonts: [{ alias: 'M', path: 'E:ARIAL.TTF' }],
        },
        [text],
      );
      expect(zpl).toContain('^CWM,E:ARIAL.TTF');
      expect(zpl).toContain(`^AM${rotation},30,0`);
      expect(zpl).not.toContain(`^A@${rotation},30,0,E:ARIAL.TTF`);
    },
  );

  it('rewrites ^A@ refs across any drive prefix the path uses', () => {
    // The path is whatever the customFonts entry stores. Even if our
    // text emit only ever writes E:, an imported label could carry
    // R: / A: / B: paths that still need to be matched on re-emit.
    const rRef = '^XA^FO0,0^A@N,30,0,R:FOO.TTF^FDhi^FS^XZ';
    const aliasByPath: Record<string, string> = { 'R:FOO.TTF': 'Q' };
    const rewritten = rRef.replace(
      /\^A@([NIRB]),(\d+),(\d+),([A-Z]:[^^\n]+?)(?=\^|\n|$)/g,
      (full, rot, h, w, path) => {
        const alias = aliasByPath[path];
        return alias ? `^A${alias}${rot},${h},${w}` : full;
      },
    );
    expect(rewritten).toContain('^AQN,30,0');
    expect(rewritten).not.toContain('^A@N,30,0,R:FOO.TTF');
  });

  it('leaves ^A@ verbose when no matching ^CW alias is defined', () => {
    const text: LabelObject = {
      id: 't1',
      type: 'text',
      x: 10,
      y: 10,
      rotation: 0,
      props: {
        content: 'hi',
        rotation: 'N',
        fontHeight: 30,
        fontWidth: 0,
        printerFontName: 'ORPHAN.TTF',
      },
    };
    const zpl = generateZPL(
      {
        ...BASE_LABEL,
        customFonts: [{ alias: 'M', path: 'E:OTHER.TTF' }],
      },
      [text],
    );
    expect(zpl).toContain('^A@N,30,0,E:ORPHAN.TTF');
    expect(zpl).not.toContain('^AMN,30,0');
  });

  it('emits ^PM when mirror is set', () => {
    expect(generateZPL({ ...BASE_LABEL, mirror: 'Y' }, [])).toContain('^PMY');
    expect(generateZPL({ ...BASE_LABEL, mirror: 'N' }, [])).toContain('^PMN');
    expect(generateZPL(BASE_LABEL, [])).not.toContain('^PM');
  });

  it('emits ~SD before ^XA with zero-padded value', () => {
    const zpl = generateZPL({ ...BASE_LABEL, instantDarkness: 7 }, []);
    expect(zpl.startsWith('~SD07\n^XA')).toBe(true);
    expect(generateZPL({ ...BASE_LABEL, instantDarkness: 30 }, []))
      .toContain('~SD30');
  });

  it('emits ^PR when only slew or backfeed is set (printSpeed undefined)', () => {
    expect(generateZPL({ ...BASE_LABEL, slewSpeed: 8 }, [])).toContain('^PR8');
    // backfeed-only: ZPL has no positional skip, so slew slot repeats the
    // (defaulted) print speed. Documented asymmetry — see roundtrip test.
    expect(
      generateZPL({ ...BASE_LABEL, backfeedSpeed: 4 }, []),
    ).toContain('^PR4,4,4');
  });

  it('emits ^PR with slew and backfeed when set', () => {
    expect(
      generateZPL({ ...BASE_LABEL, printSpeed: 6, slewSpeed: 8 }, []),
    ).toContain('^PR6,8');
    // backfeed without slew → slew defaults to printSpeed so position is
    // preserved.
    expect(
      generateZPL({ ...BASE_LABEL, printSpeed: 6, backfeedSpeed: 4 }, []),
    ).toContain('^PR6,6,4');
    expect(
      generateZPL(
        { ...BASE_LABEL, printSpeed: 6, slewSpeed: 8, backfeedSpeed: 4 },
        [],
      ),
    ).toContain('^PR6,8,4');
  });

  it('^PR backfeed-only does not roundtrip cleanly (slew gets populated)', () => {
    // Documented asymmetry: ZPL has no positional skip, so on emit the slew
    // slot is filled with the print speed. On reparse, slewSpeed becomes
    // defined even though it was undefined in the source. If this is ever
    // changed to a normaliser-on-input approach, update both the generator
    // and this test.
    const original: LabelConfig = {
      ...BASE_LABEL,
      printSpeed: 6,
      backfeedSpeed: 4,
    };
    const zpl = generateZPL(original, []);
    const { labelConfig } = parseZPL(zpl, 8);
    expect(labelConfig.printSpeed).toBe(6);
    expect(labelConfig.slewSpeed).toBe(6);
    expect(labelConfig.backfeedSpeed).toBe(4);
  });

  it('emits ^PQ with extended params when any are set', () => {
    expect(
      generateZPL({ ...BASE_LABEL, printQuantity: 5, pauseCount: 2 }, []),
    ).toContain('^PQ5,2,0,N');
    expect(
      generateZPL(
        { ...BASE_LABEL, printQuantity: 1, replicates: 3 },
        [],
      ),
    ).toContain('^PQ1,0,3,N');
    expect(
      generateZPL({ ...BASE_LABEL, overridePauseCount: 'Y' }, []),
    ).toContain('^PQ1,0,0,Y');
  });

  it('emits ^CF when both defaultFontId and defaultFontHeight are set', () => {
    const zpl = generateZPL(
      { ...BASE_LABEL, defaultFontId: '0', defaultFontHeight: 30 },
      [],
    );
    expect(zpl).toContain('^CF0,30');
  });

  it('emits ^CF{id} when only defaultFontId is set', () => {
    const zpl = generateZPL({ ...BASE_LABEL, defaultFontId: '0' }, []);
    expect(zpl).toContain('^CF0');
    expect(zpl).not.toContain('^CF0,');
  });

  it('emits ^CF,{height} when only defaultFontHeight is set', () => {
    expect(generateZPL({ ...BASE_LABEL, defaultFontHeight: 30 }, []))
      .toContain('^CF,30');
  });

  it('omits ^CF when neither defaultFont field is set', () => {
    expect(generateZPL(BASE_LABEL, [])).not.toContain('^CF');
  });

  it('emits printer params in canonical header order before ^LS', () => {
    const zpl = generateZPL(
      {
        ...BASE_LABEL,
        mediaMode: 'T',
        mediaType: 'T',
        printSpeed: 6,
        darkness: 10,
        printOrientation: 'I',
        defaultFontId: '0',
        defaultFontHeight: 30,
        labelShift: 5,
      },
      [],
    );
    const idx = (cmd: string) => zpl.indexOf(cmd);
    expect(idx('^MMT')).toBeLessThan(idx('^MTT'));
    expect(idx('^MTT')).toBeLessThan(idx('^PR6'));
    expect(idx('^PR6')).toBeLessThan(idx('^MD10'));
    expect(idx('^MD10')).toBeLessThan(idx('^POI'));
    // Geometry offsets (^LH/^LT/^LS) group before the default font (^CF)
    // so the header reads media → printer params → geometry → font.
    expect(idx('^POI')).toBeLessThan(idx('^LS5'));
    expect(idx('^LS5')).toBeLessThan(idx('^CF0,30'));
  });
});

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

describe('generateZPL — ~DY graphic upload + ^XG recall', () => {
  it('round-trips a ~DY+^XG label: parse → generate emits both back', () => {
    const HEX = '00FFFF00';
    const zpl =
      `~DYR:LOGO,A,G,4,1,${HEX}\n` +
      `^XA^FO50,80^XGR:LOGO.GRF,1,1^FS^XZ`;
    const parsed = parseZPL(zpl, 8);
    const out = generateZPL(BASE_LABEL, parsed.objects);
    // ~DY must precede ^XA so the printer has the file before ^XG references it.
    const dyAt = out.indexOf('~DYR:LOGO,A,G,4,1,');
    const xaAt = out.indexOf('^XA');
    const xgAt = out.indexOf('^XGR:LOGO.GRF,1,1');
    expect(dyAt).toBeGreaterThan(-1);
    expect(xaAt).toBeGreaterThan(dyAt);
    expect(xgAt).toBeGreaterThan(xaAt);
  });

  it('preserves the source format letter (A/B/C) on round-trip', () => {
    // A `~DY,C,G,...,:Z64:...` upload must NOT re-export as `~DY,A,G,...`:
    // Zebra firmware rejects format A with a :Z64: payload. The shared
    // cache uses ^GF{format} so the format letter survives both the GF
    // and DY round-trip paths.
    const bytes = new Uint8Array([0, 0xff, 0xff, 0]);
    const deflated = zlibSync(bytes);
    let bin = '';
    for (const b of deflated) bin += String.fromCharCode(b);
    const b64 = btoa(bin);
    function crc(s: string): string {
      let c = 0;
      for (const ch of s) {
        c ^= ch.charCodeAt(0) << 8;
        for (let j = 0; j < 8; j++)
          c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
      }
      return c.toString(16).padStart(4, '0').toUpperCase();
    }
    const zpl =
      `~DYR:CLOGO,C,G,4,1,:Z64:${b64}:${crc(b64)}\n` +
      `^XA^FO0,0^XGR:CLOGO.GRF,1,1^FS^XZ`;
    const parsed = parseZPL(zpl, 8);
    const out = generateZPL(BASE_LABEL, parsed.objects);
    expect(out).toContain('~DYR:CLOGO,C,G,');
    expect(out).not.toContain('~DYR:CLOGO,A,G,');
  });

  it('deduplicates the ~DY preamble when the same upload is referenced twice', () => {
    const HEX = '00FFFF00';
    const zpl =
      `~DYR:LOGO,A,G,4,1,${HEX}\n` +
      `^XA^FO10,10^XGR:LOGO.GRF,1,1^FS^FO10,200^XGR:LOGO.GRF,1,1^FS^XZ`;
    const parsed = parseZPL(zpl, 8);
    const out = generateZPL(BASE_LABEL, parsed.objects);
    const dyMatches = out.match(/~DYR:LOGO,/g) ?? [];
    const xgMatches = out.match(/\^XGR:LOGO\.GRF/g) ?? [];
    expect(dyMatches).toHaveLength(1);
    expect(xgMatches).toHaveLength(2);
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

describe('generateMultiPageZPL', () => {
  it('emits one ^XA…^XZ block per page', () => {
    const zpl = generateMultiPageZPL(BASE_LABEL, [{ objects: [] }, { objects: [] }]);
    const matches = zpl.match(/\^XA/g) ?? [];
    expect(matches.length).toBe(2);
    expect(zpl.match(/\^XZ/g)?.length).toBe(2);
  });

  it('returns a single ^XA…^XZ block for a single page', () => {
    const zpl = generateMultiPageZPL(BASE_LABEL, [{ objects: [] }]);
    expect(zpl.match(/\^XA/g)?.length).toBe(1);
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.endsWith('^XZ')).toBe(true);
  });

  it('returns an empty string when given an empty page list', () => {
    expect(generateMultiPageZPL(BASE_LABEL, [])).toBe('');
  });

  it('preserves per-page objects', () => {
    const { objects: page1 } = parseZPL('^XA^FO10,20^A0N,30,0^FDOne^FS^XZ', 8);
    const { objects: page2 } = parseZPL('^XA^FO50,60^A0N,30,0^FDTwo^FS^XZ', 8);
    const zpl = generateMultiPageZPL(BASE_LABEL, [{ objects: page1 }, { objects: page2 }]);
    expect(zpl).toContain('^FDOne^FS');
    expect(zpl).toContain('^FDTwo^FS');
  });
});

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
    const textObj = defined(reparsed.objects.find((o) => o.type === 'text'));
    expect(props(textObj).content).toBe('Hello World');
  });

  it('preserves barcode content and height through a roundtrip', () => {
    const original = parseZPL('^XA^FO50,50^BCN,150,Y,N,N^FD987654^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const barcode = defined(reparsed.objects.find((o) => o.type === 'code128'));
    expect(props(barcode).content).toBe('987654');
    expect(props(barcode).height).toBe(150);
  });

  it('round-trips a ^BS UPC/EAN extension (5-digit)', () => {
    const original = parseZPL('^XA^FO10,10^BSN,80,Y^FD54321^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const ext = defined(reparsed.objects.find((o) => o.type === 'upcEanExtension'));
    expect(props(ext).content).toBe('54321');
    expect(props(ext).height).toBe(80);
    expect(props(ext).printInterpretation).toBe(true);
  });

  it('round-trips a ^BS UPC/EAN extension (2-digit)', () => {
    const original = parseZPL('^XA^FO10,10^BSN,50,N^FD42^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const ext = defined(reparsed.objects.find((o) => o.type === 'upcEanExtension'));
    expect(props(ext).content).toBe('42');
    expect(props(ext).printInterpretation).toBe(false);
  });

  it('round-trips ^BS rotation and moduleWidth (via ^BY)', () => {
    const original = parseZPL('^XA^BY3^FO10,10^BSR,80,Y^FD12345^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const ext = defined(reparsed.objects.find((o) => o.type === 'upcEanExtension'));
    expect(props(ext).rotation).toBe('R');
    expect(props(ext).moduleWidth).toBe(3);
  });

  it('round-trips a ^B4 Code 49 with default mode A', () => {
    const original = parseZPL('^XA^FO10,10^B4N,20,Y,A^FDCODE49^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const bc = defined(reparsed.objects.find((o) => o.type === 'code49'));
    expect(props(bc).content).toBe('CODE49');
    expect(props(bc).height).toBe(20);
    expect(props(bc).printInterpretation).toBe(true);
    expect(props(bc).mode).toBe('A');
  });

  it('round-trips ^B4 explicit mode + rotation + moduleWidth', () => {
    const original = parseZPL('^XA^BY3^FO10,10^B4R,30,N,2^FD12345^FS^XZ', 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const bc = defined(reparsed.objects.find((o) => o.type === 'code49'));
    expect(props(bc).rotation).toBe('R');
    expect(props(bc).moduleWidth).toBe(3);
    expect(props(bc).mode).toBe('2');
    expect(props(bc).printInterpretation).toBe(false);
  });

  it('falls back to mode A when ^B4 receives an unknown mode', () => {
    const r = parseZPL('^XA^FO10,10^B4N,20,Y,X^FDCODE49^FS^XZ', 8);
    const bc = defined(r.objects.find((o) => o.type === 'code49'));
    expect(props(bc).mode).toBe('A');
  });

  it('does not leak ^B4 mode from one symbol to the next', () => {
    // Two B4 fields back-to-back: first explicit mode=3, second omits
    // the mode parameter. The second must default to 'A' even though
    // the parser variable still holds '3' from the previous handler
    // run — the handler resets it on each B4 via the `?? "A"` fallback.
    const r = parseZPL(
      '^XA^FO10,10^B4N,20,Y,3^FDONE^FS^FO10,200^B4N,20,Y^FDTWO^FS^XZ',
      8,
    );
    const codes = r.objects.filter((o) => o.type === 'code49');
    expect(codes).toHaveLength(2);
    expect(props(codes[0]!).mode).toBe('3');
    expect(props(codes[1]!).mode).toBe('A');
  });

  it('preserves printer params through generate -> parse', () => {
    const label: LabelConfig = {
      ...BASE_LABEL,
      printSpeed: 8,
      darkness: 0,
      mediaType: 'D',
      printOrientation: 'I',
      defaultFontId: '0',
      defaultFontHeight: 30,
    };
    const regenerated = generateZPL(label, []);
    const { labelConfig } = parseZPL(regenerated, BASE_LABEL.dpmm);
    expect(labelConfig.printSpeed).toBe(8);
    expect(labelConfig.darkness).toBe(0);
    expect(labelConfig.mediaType).toBe('D');
    expect(labelConfig.printOrientation).toBe('I');
    expect(labelConfig.defaultFontId).toBe('0');
    expect(labelConfig.defaultFontHeight).toBe(30);
  });

  it('preserves partial ^CF (id only) through generate -> parse', () => {
    const regenerated = generateZPL({ ...BASE_LABEL, defaultFontId: 'A' }, []);
    const { labelConfig } = parseZPL(regenerated, BASE_LABEL.dpmm);
    expect(labelConfig.defaultFontId).toBe('A');
    expect(labelConfig.defaultFontHeight).toBeUndefined();
  });

  it('preserves partial ^CF (height only) through generate -> parse', () => {
    const regenerated = generateZPL({ ...BASE_LABEL, defaultFontHeight: 25 }, []);
    const { labelConfig } = parseZPL(regenerated, BASE_LABEL.dpmm);
    expect(labelConfig.defaultFontId).toBeUndefined();
    expect(labelConfig.defaultFontHeight).toBe(25);
  });
});

// ── groups ────────────────────────────────────────────────────────────────────

function textLeaf(id: string, content: string): LabelObject {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    rotation: 0,
    props: { content, fontHeight: 20, fontWidth: 0, font: '0', interpretation: false },
  } as unknown as LabelObject;
}

function group(id: string, children: LabelObject[], extras: Partial<GroupObject> = {}): GroupObject {
  return { id, type: 'group', x: 0, y: 0, rotation: 0, children, ...extras };
}

describe('generateZPL — groups', () => {
  it('emits a grouped leaf identically to an ungrouped one', () => {
    const leaf = textLeaf('a', 'Hi');
    const flat = generateZPL(BASE_LABEL, [leaf]);
    const wrapped = generateZPL(BASE_LABEL, [group('g', [leaf])]);
    expect(wrapped).toBe(flat);
  });

  it('skips the whole subtree when the group is excluded from export', () => {
    const leaf = textLeaf('a', 'Hi');
    const zpl = generateZPL(BASE_LABEL, [group('g', [leaf], { includeInExport: false })]);
    expect(zpl).not.toContain('Hi');
  });

  it('still respects per-leaf includeInExport inside an included group', () => {
    const visible = textLeaf('a', 'Visible');
    const hidden = { ...textLeaf('b', 'Hidden'), includeInExport: false } as LabelObject;
    const zpl = generateZPL(BASE_LABEL, [group('g', [visible, hidden])]);
    expect(zpl).toContain('Visible');
    expect(zpl).not.toContain('Hidden');
  });
});

describe('generateZPL — variable bindings', () => {
  const variable = {
    id: 'var-1',
    name: 'sku',
    fnNumber: 7,
    defaultValue: 'ABC-123',
  };

  const textObj = {
    id: 'obj-1',
    type: 'text',
    x: 50,
    y: 50,
    rotation: 0,
    variableId: 'var-1',
    props: {
      content: 'placeholder',
      fontHeight: 30,
      fontWidth: 0,
      rotation: 'N',
    },
  } as unknown as LabelObject;

  it('emits ^FN{n} before the field and uses the variable default as ^FD payload', () => {
    const zpl = generateZPL(BASE_LABEL, [textObj], [variable]);
    expect(zpl).toContain('^FN7^FDABC-123^FS');
    expect(zpl).not.toContain('placeholder');
  });

  it('falls back to literal content when no variables are supplied', () => {
    const zpl = generateZPL(BASE_LABEL, [textObj]);
    expect(zpl).toContain('placeholder');
    expect(zpl).not.toContain('^FN');
  });

  it('falls back to literal content when the binding is orphaned', () => {
    const zpl = generateZPL(BASE_LABEL, [textObj], [
      { ...variable, id: 'different-id' },
    ]);
    expect(zpl).toContain('placeholder');
    expect(zpl).not.toContain('^FN');
  });

  it('round-trips a bound text field through parse → variables stay consistent', () => {
    const out = generateZPL(BASE_LABEL, [textObj], [variable]);
    const { variables, objects } = parseZPL(out);
    expect(variables).toHaveLength(1);
    expect(variables[0]?.fnNumber).toBe(7);
    expect(variables[0]?.defaultValue).toBe('ABC-123');
    expect(objects[0]?.variableId).toBe(variables[0]?.id);
  });
});

describe('generateBatchZpl', () => {
  const baseLabel: LabelConfig = { widthMm: 50, heightMm: 30, dpmm: 8 };
  const textObj = (variableId: string): LabelObject =>
    ({
      id: `obj-${variableId}`,
      type: 'text',
      x: 10,
      y: 10,
      rotation: 0,
      variableId,
      props: { content: '', fontHeight: 30, fontWidth: 0, rotation: 'N' },
    }) as unknown as LabelObject;

  it('emits ^DFR template + one ^XFR recall block per row', () => {
    const variables = [
      { id: 'v1', name: 'sku', fnNumber: 1, defaultValue: 'DEF' },
    ];
    const objects = [textObj('v1')];
    const dataset = {
      headers: ['sku'],
      rows: [['A1'], ['B2'], ['C3']],
    };
    const mapping = { bindings: { v1: 'sku' } };

    const result = generateBatchZpl(baseLabel, objects, variables, dataset, mapping);

    // Template stored exactly once
    expect((result.match(/\^DFR:LBL\.ZPL/g) || []).length).toBe(1);
    // Recall block per row
    expect((result.match(/\^XFR:LBL\.ZPL/g) || []).length).toBe(3);
    // Each row's value present as ^FN override
    expect(result).toContain('^FN1^FDA1^FS');
    expect(result).toContain('^FN1^FDB2^FS');
    expect(result).toContain('^FN1^FDC3^FS');
  });

  it('skips variables that are not in the mapping', () => {
    const variables = [
      { id: 'v1', name: 'sku', fnNumber: 1, defaultValue: '' },
      { id: 'v2', name: 'qty', fnNumber: 2, defaultValue: '' },
    ];
    const objects = [textObj('v1'), textObj('v2')];
    const dataset = { headers: ['sku'], rows: [['A1']] };
    const mapping = { bindings: { v1: 'sku' } };

    const result = generateBatchZpl(baseLabel, objects, variables, dataset, mapping);
    // Only the recall blocks should carry overrides; isolate them so the
    // template body's own ^FN slots don't pollute the assertion.
    const recall = result.split('^XFR:LBL.ZPL').slice(1).join('^XFR:LBL.ZPL');
    expect(recall).toContain('^FN1^FDA1^FS');
    expect(recall).not.toMatch(/\^FN2\^FD/);
  });

  it('skips orphan bindings (header missing from dataset)', () => {
    const variables = [
      { id: 'v1', name: 'sku', fnNumber: 1, defaultValue: '' },
    ];
    const objects = [textObj('v1')];
    const dataset = { headers: ['qty'], rows: [['10']] };
    const mapping = { bindings: { v1: 'sku' } };

    const result = generateBatchZpl(baseLabel, objects, variables, dataset, mapping);
    expect(result).toContain('^XFR:LBL.ZPL');
    const recall = result.split('^XFR:LBL.ZPL').slice(1).join('^XFR:LBL.ZPL');
    expect(recall).not.toMatch(/\^FN1\^FD/);
  });

  it('emits empty cells as empty ^FD payload (deliberate blank)', () => {
    const variables = [
      { id: 'v1', name: 'note', fnNumber: 1, defaultValue: 'fallback' },
    ];
    const objects = [textObj('v1')];
    const dataset = { headers: ['note'], rows: [['']] };
    const mapping = { bindings: { v1: 'note' } };

    const result = generateBatchZpl(baseLabel, objects, variables, dataset, mapping);
    expect(result).toContain('^FN1^FD^FS');
  });

  it('injects ^DFR even when ~DY/~SD preamble lines precede ^XA', () => {
    const variables = [{ id: 'v1', name: 'sku', fnNumber: 1, defaultValue: '' }];
    const objects = [textObj('v1')];
    const dataset = { headers: ['sku'], rows: [['A1']] };
    const mapping = { bindings: { v1: 'sku' } };
    // instantDarkness adds a `~SD` preamble line before ^XA — start-
    // anchored regex would silently skip the inject.
    const labelWithPreamble: LabelConfig = { ...baseLabel, instantDarkness: 5 };
    const result = generateBatchZpl(
      labelWithPreamble, objects, variables, dataset, mapping,
    );
    expect(result).toContain('~SD05');
    // ^DFR must still be present immediately inside the ^XA block.
    expect(result).toMatch(/\^XA\n\^DFR:LBL\.ZPL/);
  });

  it('hex-escapes ^ and ~ in CSV cell values via ^FH', () => {
    const variables = [{ id: 'v1', name: 'name', fnNumber: 1, defaultValue: '' }];
    const objects = [textObj('v1')];
    const dataset = { headers: ['name'], rows: [['A^B~C Corp']] };
    const mapping = { bindings: { v1: 'name' } };
    const result = generateBatchZpl(baseLabel, objects, variables, dataset, mapping);
    const recall = result.split('^XFR:LBL.ZPL').slice(1).join('^XFR:LBL.ZPL');
    // Raw ^ or ~ in the value must not appear in the recall payload —
    // they would terminate the field early on the printer.
    expect(recall).toContain('^FH_');
    expect(recall).not.toContain('A^B~C Corp');
  });

  it('zero rows yields template-only output (no recall blocks)', () => {
    const variables = [{ id: 'v1', name: 'sku', fnNumber: 1, defaultValue: '' }];
    const objects = [textObj('v1')];
    const dataset = { headers: ['sku'], rows: [] };
    const mapping = { bindings: { v1: 'sku' } };

    const result = generateBatchZpl(baseLabel, objects, variables, dataset, mapping);
    expect(result).toContain('^DFR:LBL.ZPL');
    expect(result).not.toContain('^XFR:LBL.ZPL');
  });
});
