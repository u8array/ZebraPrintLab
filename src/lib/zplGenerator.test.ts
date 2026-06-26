import { describe, it, expect } from 'vitest';
import { zlibSync } from 'fflate';
import { generateZPL, generateMultiPageZPL, generateBatchZpl } from './zplGenerator';
import { parseZPL } from './zplParser';
import type { LabelConfig } from '../types/LabelConfig';
import type { GroupObject, LabelObject } from '../types/Group';
import { defined, props } from '../test/helpers';
import { NON_EMITTING_CONFIG_KEYS } from '../store/labelStore.internals';
import { putImage } from '../lib/imageCache';

const BASE_LABEL: LabelConfig = {
  widthMm: 100,
  heightMm: 50,
  dpmm: 8,
};

describe('NON_EMITTING_CONFIG_KEYS tripwire', () => {
  // A config key wrongly listed as non-emitting would skip the overlay drop and
  // export stale config. Lock the membership and prove each member is invariant.
  it('contains only safeAreaMm', () => {
    expect([...NON_EMITTING_CONFIG_KEYS]).toEqual(['safeAreaMm']);
  });

  it('changing safeAreaMm does not change generated ZPL', () => {
    const objs = [
      { id: 'a', type: 'text', x: 10, y: 10, rotation: 0,
        props: { content: 'Hi', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: false } },
    ] as unknown as LabelObject[];
    expect(generateZPL({ ...BASE_LABEL, safeAreaMm: 7 }, objs)).toBe(generateZPL(BASE_LABEL, objs));
  });
});

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

  it('does not emit ^MU when muResampling is unset', () => {
    const zpl = generateZPL(BASE_LABEL, []);
    expect(zpl).not.toContain('^MU');
  });

  it('emits ^MUD,b,c when muResampling is set', () => {
    const zpl = generateZPL(
      { ...BASE_LABEL, muResampling: { formatDpi: 150, outputDpi: 300 } },
      [],
    );
    expect(zpl).toContain('^MUD,150,300');
  });

  it('emits ^MU directly after ^XA so the printer sees the resampling header first', () => {
    const zpl = generateZPL(
      { ...BASE_LABEL, muResampling: { formatDpi: 200, outputDpi: 600 } },
      [],
    );
    const xaIdx = zpl.indexOf('^XA');
    const muIdx = zpl.indexOf('^MUD');
    const pwIdx = zpl.indexOf('^PW');
    expect(xaIdx).toBeGreaterThanOrEqual(0);
    expect(muIdx).toBeGreaterThan(xaIdx);
    expect(muIdx).toBeLessThan(pwIdx);
  });

  it('reverse text round-trips: bare ^FR, no synthesized ^GB', () => {
    // Spec-true reverse: the generator emits ^FR (no background box), so the
    // text round-trips to a single reverse text with its anchor intact. The
    // black background, if any, is the user's own ^GB object.
    const objs = [
      { id: 'r', type: 'text', x: 50, y: 50, rotation: 0,
        props: { content: 'Hi', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: true } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    const zpl = generateZPL(BASE_LABEL, objs);
    expect(zpl).not.toContain('^GB');
    expect(zpl).toContain('^FR^FD');
    expect(zpl).not.toContain('^LRY');
    const { objects } = parseZPL(zpl, 8);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe('text');
    expect(props(objects[0]).reverse).toBe(true);
    expect(props(objects[0]).content).toBe('Hi');
  });

  it.each(['N', 'R', 'I', 'B'])('rotated reverse text round-trips for %s (bare ^FR, no box)', (rot) => {
    // Reverse text emits a bare ^FR with no background, so it round-trips to
    // ONE object for every rotation and position type, anchor preserved.
    for (const positionType of ['FO', 'FT'] as const) {
      const objs = [
        { id: 'r', type: 'text', x: 60, y: 60, rotation: 0, positionType,
          props: { content: 'Hi', fontHeight: 30, fontWidth: 0, rotation: rot, reverse: true } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any;
      const { objects } = parseZPL(generateZPL(BASE_LABEL, objs), 8);
      expect(objects, `${positionType}/${rot}`).toHaveLength(1);
      expect(objects[0]?.type).toBe('text');
      expect(props(objects[0]).reverse).toBe(true);
      expect(props(objects[0]).rotation).toBe(rot);
    }
  });

  it('third-party rotated ^GB+^FR at the bare text anchor stays a separate box', () => {
    // A rotated reverse where the ^GB sits at the same anchor as the ^FR text
    // genuinely prints beside the text (the box does not overlap rotated text),
    // so it must NOT collapse into a faked overlap; it stays box + reverse text.
    const { objects } = parseZPL(
      '^XA^FT100,200^GB30,80,30,B,0^FS^FT100,200^A0R,30,0^FR^FDHi^FS^XZ',
      8,
    );
    expect(objects.length).toBe(2);
  });

  it('omits objects with includeInExport=false', () => {
    const objs = [
      { id: 'a', type: 'text', x: 10, y: 10, rotation: 0, props: { content: 'KEEP', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: false } },
      { id: 'b', type: 'text', x: 20, y: 20, rotation: 0, includeInExport: false, props: { content: 'DROP', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: false } },
    // Casting around the registry's discriminated union; the generator only
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
    // field, analogous to a layer outside the artboard in a design tool.
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

  const ftBox = (y: number, height: number): LabelObject => ({
    id: 'ft', type: 'box', x: 0, y, rotation: 0, positionType: 'FT',
    props: { width: 50, height, thickness: 3, filled: false, color: 'B', rounding: 0 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  it('keeps an ^FT graphic whose top-left dips negative but anchor stays valid', () => {
    // ^FT anchors at the bottom-left: top-left 80 - home 100 = -20, but the
    // emitted ^FT (top-left + height 40) lands at y=20, a valid field.
    const zpl = generateZPL({ ...BASE_LABEL, labelHomeY: 100 }, [ftBox(80, 40)]);
    expect(zpl).toContain('^FT0,20^GB50,40,');
  });

  it('still drops an ^FT graphic whose emitted anchor would be negative', () => {
    // anchor y = top-left 20 + height 40 - home 100 = -40 → off-label, dropped.
    const zpl = generateZPL({ ...BASE_LABEL, labelHomeY: 100 }, [ftBox(20, 40)]);
    expect(zpl).not.toContain('^GB');
  });

  it('keeps a right-justified ^FT image using its byte-padded ^GF width', () => {
    // widthDots 121 emits at 128 (byte boundary); right anchor x = 0 + 128 -
    // home 125 = 3 (valid). The unpadded 121 would read -4 and wrongly drop it.
    const ftImage: LabelObject = {
      id: 'im', type: 'image', x: 0, y: 100, rotation: 0, positionType: 'FT', fieldJustify: 'R',
      props: { imageId: '', widthDots: 121, heightDots: 60, threshold: 128,
        storedAs: { device: 'R', name: 'LOGO', embedInZpl: false } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const zpl = generateZPL({ ...BASE_LABEL, labelHomeX: 125 }, [ftImage]);
    expect(zpl).toContain('^FT3,160,1'); // x 0+128-125=3, y 100+60
    expect(zpl).toContain('^XG');
  });

  it('keeps a cached ^FT image using its aspect height, not a stale heightDots', () => {
    putImage({ id: 'imgC', name: 'c', dataUrl: 'data:,', width: 100, height: 200 });
    const ftImage: LabelObject = {
      id: 'imc', type: 'image', x: 0, y: 10, rotation: 0, positionType: 'FT',
      props: { imageId: 'imgC', widthDots: 120, heightDots: 10, threshold: 128, _gfaCache: '^GFA1,1,1,00' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // aspect height = round(120 * 200/100) = 240; anchor y = 10 + 240 - home 200 = 50
    // (valid). The stale heightDots 10 would read 10 + 10 - 200 = -180 and wrongly drop.
    const zpl = generateZPL({ ...BASE_LABEL, labelHomeY: 200 }, [ftImage]);
    expect(zpl).toContain('^FT0,50');
    expect(zpl).toContain('^GFA'); // kept, not dropped
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
    // Tiny fake TTF; content does not need to be valid for the emit
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
      // ~DYE:EMBED,A,T,4,,0001FFAB: stem strips the extension, ext code
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

  it('emits ~JS before ^XA for backfeed sequence', () => {
    const zpl = generateZPL({ ...BASE_LABEL, backfeedSequence: 'B' }, []);
    expect(zpl).toContain('~JSB');
    expect(zpl.indexOf('~JSB')).toBeLessThan(zpl.indexOf('^XA'));
  });

  it('emits ^PR when only slew or backfeed is set (printSpeed undefined)', () => {
    expect(generateZPL({ ...BASE_LABEL, slewSpeed: 8 }, [])).toContain('^PR8');
    // backfeed-only: ZPL has no positional skip, so slew slot repeats the
    // (defaulted) print speed. Documented asymmetry; see roundtrip test.
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

describe('generateZPL — ^FP field-direction modifier', () => {
  it('omits ^FP for the default horizontal layout', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,0^FDHello^FS^XZ', 8);
    expect(generateZPL(BASE_LABEL, objects)).not.toContain('^FP');
  });

  it('emits ^FPV,0 for vertical text', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,30^FPV^FDABC^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^FPV,0');
    expect(zpl.indexOf('^FPV')).toBeLessThan(zpl.indexOf('^A0'));
  });

  it('emits gap on horizontal layout when only ^FP,g was set', () => {
    const { objects } = parseZPL('^XA^FO10,20^A0N,30,30^FP,4^FDABC^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^FPH,4');
  });

  it('round-trips ^FPV,2 through parser + generator', () => {
    const original = '^XA^FO50,50^A0N,30,30^FPV,2^FDABC^FS^XZ';
    const { objects } = parseZPL(original, 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^FPV,2');
    expect(zpl).toContain('^FDABC');
  });
});

describe('generateZPL — ^TB text block', () => {
  it('emits ^TB{rot},{w},{h} for a text-block object', () => {
    const { objects } = parseZPL('^XA^A0N,30^FO0,0^TBN,400,120^FDText block^FS^XZ', 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    expect(zpl).toContain('^TBN,400,120');
    expect(zpl).not.toContain('^FB');
  });

  it('round-trips ^TB (native, no lossy collapse to ^FB)', () => {
    const original = '^XA^A0N,30^FO0,0^TBN,400,120^FDText block^FS^XZ';
    const { objects } = parseZPL(original, 8);
    const zpl = generateZPL(BASE_LABEL, objects);
    const { objects: reparsed } = parseZPL(zpl, 8);
    expect(props(reparsed[0]).textMode).toBe('tb');
    expect(props(reparsed[0]).blockWidth).toBe(400);
    expect(props(reparsed[0]).blockHeight).toBe(120);
    expect(props(reparsed[0]).content).toBe('Text block');
  });

  it('round-trips an FT-anchored ^TB position (extent uses blockHeight)', () => {
    const original = '^XA^A0N,30^FT400,150^TBN,300,90^FDsample^FS^XZ';
    const a = parseZPL(original, 8);
    const z = generateZPL(BASE_LABEL, a.objects);
    const b = parseZPL(z, 8);
    expect(props(b.objects[0]).blockHeight).toBe(90);
    // Position must survive the FT extent round-trip unchanged.
    expect(b.objects[0]?.x).toBe(a.objects[0]?.x);
    expect(b.objects[0]?.y).toBe(a.objects[0]?.y);
    expect(z).toContain('^FT400,150');
  });

  it('does not re-escape a ^TB clock token when content forces the < time char', () => {
    // A literal `{` makes the clock time-char fall to `<`; the substituted
    // token must survive, not get re-escaped to `<<>` (post-substitution
    // encoding regression).
    const obj: LabelObject = {
      id: 't', type: 'text', x: 0, y: 0, rotation: 0,
      props: { content: '«clock:H»{', fontHeight: 30, fontWidth: 0, rotation: 'N', textMode: 'tb', blockWidth: 300, blockHeight: 60 },
    };
    const zpl = generateZPL(BASE_LABEL, [obj]);
    expect(zpl).toContain('^FC');
    expect(zpl).not.toContain('<<>H');
  });

  it('round-trips ^TBR (R-rotation anchor path)', () => {
    const original = '^XA^A0R,30^FO100,40^TBR,200,90^FDrotated block sample^FS^XZ';
    const a = parseZPL(original, 8);
    const z = generateZPL(BASE_LABEL, a.objects);
    const b = parseZPL(z, 8);
    expect(props(b.objects[0]).textMode).toBe('tb');
    expect(props(b.objects[0]).blockHeight).toBe(90);
    expect(props(b.objects[0]).rotation).toBe('R');
    expect(b.objects[0]?.x).toBe(a.objects[0]?.x);
    expect(b.objects[0]?.y).toBe(a.objects[0]?.y);
  });

  it('escapes < in a bound variable default for ^TB (no field-swallow)', () => {
    const variable = { id: 'v1', name: 'n', fnNumber: 4, defaultValue: 'a<b' };
    const obj: LabelObject = {
      id: 't', type: 'text', x: 0, y: 0, rotation: 0, variableId: 'v1',
      props: { content: '', fontHeight: 30, fontWidth: 0, rotation: 'N', textMode: 'tb', blockWidth: 300, blockHeight: 60 },
    };
    const zpl = generateZPL(BASE_LABEL, [obj], [variable]);
    expect(zpl).toContain('^FN4');
    expect(zpl).toContain('a<<>b');
    expect(zpl).not.toContain('^FDa<b');
    // Round-trip: parser must decode the bound default back to the plain value
    // (not the encoded form) so re-emit is byte-identical (no drift).
    const reparsed = parseZPL(zpl, 8);
    expect(defined(reparsed.variables[0]).defaultValue).toBe('a<b');
    expect(generateZPL(BASE_LABEL, reparsed.objects, reparsed.variables)).toBe(zpl);
  });

  it('round-trips a reverse ^TB (bare ^FR, no box, even h < fontHeight)', () => {
    for (const blockHeight of [90, 5]) {
      const obj: LabelObject = {
        id: 't', type: 'text', x: 10, y: 10, rotation: 0,
        props: { content: 'rev', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: true, textMode: 'tb', blockWidth: 200, blockHeight },
      };
      const zpl = generateZPL(BASE_LABEL, [obj]);
      const { objects } = parseZPL(zpl, 8);
      // ^FR + ^TB emits no background box, so it re-imports as ONE reverse text.
      expect(objects).toHaveLength(1);
      expect(objects[0]?.type).toBe('text');
      expect(props(objects[0]).reverse).toBe(true);
      expect(props(objects[0]).textMode).toBe('tb');
      expect(props(objects[0]).blockHeight).toBe(blockHeight);
    }
  });

  it('round-trips a literal < through the <<> escape', () => {
    const obj = {
      id: 't1', type: 'text' as const, x: 0, y: 0, rotation: 0,
      props: { content: 'A<B', fontHeight: 30, fontWidth: 0, rotation: 'N' as const, textMode: 'tb' as const, blockWidth: 300, blockHeight: 60 },
    };
    const zpl = generateZPL(BASE_LABEL, [obj as unknown as LabelObject]);
    expect(zpl).toContain('^FDA<<>B');
    const { objects } = parseZPL(zpl, 8);
    expect(props(objects[0]).content).toBe('A<B');
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

  it('round-trips ^MU muResampling pair through parser + generator', () => {
    const label = { ...BASE_LABEL, muResampling: { formatDpi: 200, outputDpi: 600 } as const };
    const regenerated = generateZPL(label, []);
    expect(regenerated).toContain('^MUD,200,600');
    const reparsed = parseZPL(regenerated, 8);
    expect(reparsed.labelConfig.muResampling).toEqual({ formatDpi: 200, outputDpi: 600 });
  });

  it('emits gs1databar magnification into both ^BY and ^BR slots', () => {
    const objs = [{
      id: 'g1', type: 'gs1databar', x: 0, y: 0, rotation: 0,
      props: { content: '0112345678901', magnification: 5, symbology: 1 as const, rotation: 'N' as const },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }] as any;
    const zpl = generateZPL(BASE_LABEL, objs);
    expect(zpl).toContain('^BY5');
    expect(zpl).toContain('^BRN,1,5,2,');
    const reparsed = parseZPL(zpl, 8);
    expect(props(reparsed.objects[0]).magnification).toBe(5);
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

  it('parses ^FE inline FN embeds into «name» markers + auto-creates variables', () => {
    // The templated field references FN2 and FN3 inline; the parser
    // auto-creates the Variables when they don't already exist (same
    // bootstrap convention as the single-bind ^FN path).
    const r = parseZPL(
      '^XA^FO50,50^A0N,30,30^FD#2# and then #3#^FS^XZ',
      8,
    );
    expect(r.variables.map((v) => ({ fn: v.fnNumber, n: v.name })).sort((a, b) => a.fn - b.fn))
      .toEqual([
        { fn: 2, n: 'field_2' },
        { fn: 3, n: 'field_3' },
      ]);
    const text = defined(r.objects.find((o) => o.type === 'text'));
    expect(props(text).content).toBe('«field_2» and then «field_3»');
  });

  it('respects a custom ^FE embed character', () => {
    // ^FE@ redefines the embed delimiter, so `@1@` reads as the FN1
    // embed and the literal `#` survives untouched in the output.
    const r = parseZPL(
      '^XA^FE@^FO50,50^A0N,30,30^FDItem #@1@^FS^XZ',
      8,
    );
    const text = defined(r.objects.find((o) => o.type === 'text'));
    expect(props(text).content).toBe('Item #«field_1»');
  });

  it('round-trips a label that uses ^FE inline embeds', () => {
    const src = '^XA^FO50,50^A0N,30,30^FD#1#-#2#^FS^XZ';
    const original = parseZPL(src, 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects, original.variables);
    const reparsed = parseZPL(regenerated, 8);
    const text = defined(reparsed.objects.find((o) => o.type === 'text'));
    expect(props(text).content).toBe('«field_1»-«field_2»');
    expect(reparsed.variables.map((v) => v.fnNumber).sort()).toEqual([1, 2]);
  });

  it('parses ^FD clock tokens into «clock:T» markers', () => {
    const r = parseZPL('^XA^FO50,50^A0N,30,30^FDDate %d/%m/%Y^FS^XZ', 8);
    const text = defined(r.objects.find((o) => o.type === 'text'));
    expect(props(text).content).toBe('Date «clock:d»/«clock:m»/«clock:Y»');
  });

  it('respects a custom ^FC clock char on parse', () => {
    const r = parseZPL('^XA^FC@^FO50,50^A0N,30,30^FDDate @d/@m/@Y^FS^XZ', 8);
    const text = defined(r.objects.find((o) => o.type === 'text'));
    expect(props(text).content).toBe('Date «clock:d»/«clock:m»/«clock:Y»');
  });

  it('round-trips a label with clock tokens (default chars)', () => {
    const src = '^XA^FO50,50^A0N,30,30^FD%d/%m/%Y %H:%M^FS^XZ';
    const original = parseZPL(src, 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    const reparsed = parseZPL(regenerated, 8);
    const text = defined(reparsed.objects.find((o) => o.type === 'text'));
    expect(props(text).content).toBe('«clock:d»/«clock:m»/«clock:Y» «clock:H»:«clock:M»');
    // No ^FC line when defaults work; payload has no `%` `{` or `#`
    // literals beyond the token positions.
    expect(regenerated).not.toMatch(/\^FC/);
  });

  it('resets ^FC and ^FE state between sibling ^XA blocks', () => {
    // Two back-to-back labels: first overrides ^FC/^FE chars, second
    // uses defaults. Without an XA reset, the second label would
    // parse with the leaked chars and misinterpret default tokens.
    const r = parseZPL(
      '^XA^FC@^FE!^FO50,50^A0N,30,30^FD@d !1!^FS^XZ' +
      '^XA^FO50,50^A0N,30,30^FD%d #1#^FS^XZ',
      8,
    );
    // parseZPL flattens pages into one objects array; second label's
    // text is the second text object. Its `%d` should still parse as
    // a clock token; if the leak existed, the parser would have stuck
    // with `@` and left `%d` literal in the content.
    const texts = r.objects.filter((o) => o.type === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(props(defined(texts[1])).content).toContain('«clock:d»');
  });

  it('emits ^FC<alt> when payload contains a literal %', () => {
    const src = '^XA^FO50,50^A0N,30,30^FD100% match %Y^FS^XZ';
    const original = parseZPL(src, 8);
    const regenerated = generateZPL(BASE_LABEL, original.objects);
    expect(regenerated).toMatch(/\^FC\$/);
  });

  it('round-trips ^SO2 offsets via labelConfig.secondaryClockOffset', () => {
    const src = '^XA^SO2,1,0,0,0,0,0^FO10,10^A0N,30,30^FD{Y-{m^FS^XZ';
    const r = parseZPL(src, 8);
    expect(r.labelConfig.secondaryClockOffset).toEqual({ months: 1 });
    const regenerated = generateZPL({ ...BASE_LABEL, ...r.labelConfig }, r.objects);
    expect(regenerated).toMatch(/\^SO2,1,0,0,0,0,0/);
    expect(regenerated).toMatch(/\{Y-\{m/);
  });

  it('round-trips ^SO3 offsets independently of ^SO2', () => {
    const src = '^XA^SO3,0,0,1,0,0,0^FO10,10^A0N,30,30^FD#Y^FS^XZ';
    const r = parseZPL(src, 8);
    expect(r.labelConfig.tertiaryClockOffset).toEqual({ years: 1 });
    expect(r.labelConfig.secondaryClockOffset).toBeUndefined();
    const regenerated = generateZPL({ ...BASE_LABEL, ...r.labelConfig }, r.objects);
    expect(regenerated).toMatch(/\^SO3,0,0,1,0,0,0/);
    expect(regenerated).not.toMatch(/\^SO2/);
  });

  it('drops the ^SO command for an all-zero offset on emit', () => {
    const regenerated = generateZPL(
      { ...BASE_LABEL, secondaryClockOffset: { months: 0, days: 0, years: 0 } },
      [],
    );
    expect(regenerated).not.toMatch(/\^SO/);
  });

  it('parses ^SO2 with all-zero values as a no-op (no offset stored)', () => {
    const r = parseZPL('^XA^SO2,0,0,0,0,0,0^FO10,10^A0N,30,30^FD{Y^FS^XZ', 8);
    expect(r.labelConfig.secondaryClockOffset).toBeUndefined();
  });

  it('rejects ^SO with clock# not in {2,3}', () => {
    const r = parseZPL('^XA^SO1,1,0,0,0,0,0^FO10,10^A0N,30,30^FDx^FS^XZ', 8);
    expect(r.labelConfig.secondaryClockOffset).toBeUndefined();
    expect(r.labelConfig.tertiaryClockOffset).toBeUndefined();
  });

  it('emits ^FE<alt> when payload contains a literal #', () => {
    // Pre-build state via the parser so variable ids are real.
    const r = parseZPL('^XA^FN1^FDfoo^FS^XZ', 8);
    const v = defined(r.variables[0]);
    const generated = generateZPL(BASE_LABEL, [
      {
        id: 'a',
        type: 'text',
        x: 10,
        y: 10,
        rotation: 0,
        props: {
          content: 'Item #«' + v.name + '»',
          fontHeight: 20,
          fontWidth: 0,
          rotation: 'N',
        },
      } as LabelObject,
    ], r.variables);
    // '#' is in the payload literal, so generator must switch to '@'.
    expect(generated).toMatch(/\^FE@/);
    expect(generated).toMatch(/\^FDItem #@1@\^FS/);
  });

  it('GS1 DataMatrix binding emits ^FN with the FNC1-escaped default', () => {
    const variable = { id: 'v1', name: 'gtin', fnNumber: 5, defaultValue: '0109501101530003' };
    const obj: LabelObject = {
      id: 'd',
      type: 'datamatrix',
      x: 10,
      y: 10,
      rotation: 0,
      variableId: 'v1',
      props: { content: '0109501101530003', dimension: 8, quality: 200, rotation: 'N', gs1: true },
    };
    const zpl = generateZPL(BASE_LABEL, [obj], [variable]);
    expect(zpl).toContain('^BXN,8,200,,,,_');
    expect(zpl).toContain('^FN5^FD_10109501101530003^FS');
  });

  it('GS1 DataMatrix keeps the leading FNC1 when content has a template marker', () => {
    const variable = { id: 'v1', name: 'gtin', fnNumber: 5, defaultValue: '0109501101530003' };
    const obj: LabelObject = {
      id: 'd',
      type: 'datamatrix',
      x: 10,
      y: 10,
      rotation: 0,
      props: { content: '«gtin»', dimension: 8, quality: 200, rotation: 'N', gs1: true },
    };
    const zpl = generateZPL(BASE_LABEL, [obj], [variable]);
    // Marker expanded to the inline embed AND still prefixed with FNC1 (_1).
    expect(zpl).toContain('^FD_1#5#^FS');
  });

  it('UPC-E single-bind emits the ^FN default through fdContent (NS-prefixed)', () => {
    const variable = { id: 'v1', name: 'upc', fnNumber: 3, defaultValue: '654321' };
    const obj: LabelObject = {
      id: 'u',
      type: 'upce',
      x: 10,
      y: 10,
      variableId: 'v1',
      props: {
        content: '012345',
        height: 100,
        moduleWidth: 2,
        printInterpretation: true,
        printInterpretationAbove: false,
        checkDigit: false,
        rotation: 'N',
      },
    } as unknown as LabelObject;
    const zpl = generateZPL(BASE_LABEL, [obj], [variable]);
    // The default value is compacted + NS-prefixed (fdContent), not emitted raw.
    expect(zpl).toContain('^FN3^FD0654321');
    expect(zpl).not.toContain('^FN3^FD654321^FS');
  });

  it('UPC-E template field preserves the embed (fdContent skipped, not digit-extracted)', () => {
    const variable = { id: 'v1', name: 'upc', fnNumber: 2, defaultValue: '123456' };
    const obj: LabelObject = {
      id: 'u',
      type: 'upce',
      x: 10,
      y: 10,
      props: {
        content: 'x«upc»', // literal + marker => template, not single-bind
        height: 100, moduleWidth: 2,
        printInterpretation: true, printInterpretationAbove: false, checkDigit: false, rotation: 'N',
      },
    } as unknown as LabelObject;
    const zpl = generateZPL(BASE_LABEL, [obj], [variable]);
    // The embed survives; the digit-only transform must not collapse it.
    expect(zpl).toMatch(/\^FDx#2#/);
  });

  it('single-bind default containing a marker is emitted literally (export == preview, ^FN kept)', () => {
    // outer is single-bound; its default literally contains «inner». Export must
    // NOT expand «inner» to an embed, and must keep outer's own ^FN.
    const outer = { id: 'v1', name: 'outer', fnNumber: 1, defaultValue: '«inner»' };
    const inner = { id: 'v2', name: 'inner', fnNumber: 7, defaultValue: 'L7' };
    const obj: LabelObject = {
      id: 't',
      type: 'text',
      x: 10,
      y: 10,
      variableId: 'v1',
      props: { content: '«inner»', fontHeight: 30, fontWidth: 0, rotation: 'N' },
    } as unknown as LabelObject;
    const zpl = generateZPL(BASE_LABEL, [obj], [outer, inner]);
    expect(zpl).toContain('^FN1^FD«inner»');
    // inner's marker must not be resolved into an embed for this field.
    expect(zpl).not.toMatch(/\^FD#7#/);
  });

  it('QR single-bind keeps the {ec}A, prefix on the ^FN default', () => {
    const variable = { id: 'v1', name: 'url', fnNumber: 4, defaultValue: 'https://x.io' };
    const obj: LabelObject = {
      id: 'q',
      type: 'qrcode',
      x: 10,
      y: 10,
      variableId: 'v1',
      props: { content: 'https://x.io', magnification: 4, errorCorrection: 'Q', rotation: 'N' },
    } as unknown as LabelObject;
    const zpl = generateZPL(BASE_LABEL, [obj], [variable]);
    // Prefix composes with the binding; the default is not emitted raw.
    expect(zpl).toContain('^FN4^FDQA,https://x.io');
    expect(zpl).not.toContain('^FN4^FDhttps://x.io');
  });

  it('does not leak ^B4 mode from one symbol to the next', () => {
    // Two B4 fields back-to-back: first explicit mode=3, second omits
    // the mode parameter. The second must default to 'A' even though
    // the parser variable still holds '3' from the previous handler
    // run; the handler resets it on each B4 via the `?? "A"` fallback.
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
    // instantDarkness adds a `~SD` preamble line before ^XA; a start-
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
    // Raw ^ or ~ in the value must not appear in the recall payload;
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

  it('applies the QR {ec}A, transform to each CSV override (not raw)', () => {
    const variables = [{ id: 'v1', name: 'url', fnNumber: 1, defaultValue: 'https://d' }];
    const qr = {
      id: 'q', type: 'qrcode', x: 10, y: 10, variableId: 'v1',
      props: { content: 'https://d', magnification: 4, errorCorrection: 'Q', rotation: 'N' },
    } as unknown as LabelObject;
    const dataset = { headers: ['url'], rows: [['https://row']] };
    const result = generateBatchZpl(baseLabel, [qr], variables, dataset, { bindings: { v1: 'url' } });
    const recall = result.split('^XFR:LBL.ZPL').slice(1).join('^XFR:LBL.ZPL');
    expect(recall).toContain('^FN1^FDQA,https://row');
    expect(recall).not.toContain('^FN1^FDhttps://row');
  });

  it('applies the UPC-E compaction transform to each CSV override', () => {
    const variables = [{ id: 'v1', name: 'upc', fnNumber: 1, defaultValue: '123456' }];
    const upceObj = {
      id: 'u', type: 'upce', x: 10, y: 10, variableId: 'v1',
      props: {
        content: '123456', height: 100, moduleWidth: 2,
        printInterpretation: true, printInterpretationAbove: false, checkDigit: false, rotation: 'N',
      },
    } as unknown as LabelObject;
    const dataset = { headers: ['upc'], rows: [['654321']] };
    const result = generateBatchZpl(baseLabel, [upceObj], variables, dataset, { bindings: { v1: 'upc' } });
    const recall = result.split('^XFR:LBL.ZPL').slice(1).join('^XFR:LBL.ZPL');
    // NS-prefixed + compacted, not the raw row value.
    expect(recall).toContain('^FN1^FD0654321');
    expect(recall).not.toContain('^FN1^FD654321^FS');
  });
});

describe('generateZPL — ^FT graphic anchors (bottom corner, spec p.205)', () => {
  const mk = (type: string, props: object, extra: object = {}) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [{ id: 'g', type, x: 50, y: 70, rotation: 0, positionType: 'FT', props, ...extra }] as any;

  it('ellipse ^GE: ^FT anchors bottom-left (y + height)', () => {
    const zpl = generateZPL(BASE_LABEL, mk('ellipse',
      { width: 100, height: 80, thickness: 3, filled: false, color: 'B' }));
    expect(zpl).toContain('^FT50,150^GE100,80,3,B^FS'); // 70 + 80
    expect(parseZPL(zpl, 8).objects[0]?.positionType).toBe('FT');
  });

  it('ellipse ^GE right-justified: ^FT,1 anchors bottom-right', () => {
    const zpl = generateZPL(BASE_LABEL, mk('ellipse',
      { width: 100, height: 80, thickness: 3, filled: false, color: 'B' },
      { fieldJustify: 'R' }));
    expect(zpl).toContain('^FT150,150,1^GE100,80,3,B^FS'); // 50+100, 70+80
  });

  it('circle ^GC: ^FT lifts by the diameter', () => {
    const zpl = generateZPL(BASE_LABEL, mk('ellipse',
      { width: 100, height: 100, thickness: 3, filled: false, color: 'B', lockAspect: true }));
    expect(zpl).toContain('^FT50,170^GC100,3,B^FS'); // 70 + 100
  });

  it('image ^GF/^XG: ^FT lifts by heightDots', () => {
    const zpl = generateZPL(BASE_LABEL, mk('image',
      { imageId: '', widthDots: 120, heightDots: 60, threshold: 128,
        storedAs: { device: 'R', name: 'LOGO', embedInZpl: false } }));
    expect(zpl).toContain('^FT50,130^XGR:LOGO.GRF,1,1^FS'); // 70 + 60
  });

  it('diagonal line ^GD: ^FT anchors the bounding box bottom-left', () => {
    // 3-4-5 at start (50,70): dx 80, dy 60 → box top-left (50,70), h 60.
    const zpl = generateZPL(BASE_LABEL, mk('line',
      { angle: Math.round((Math.atan2(60, 80) * 180) / Math.PI), length: 100, thickness: 3, color: 'B' }));
    expect(zpl).toMatch(/\^FT50,130\^GD80,60,3,B,L\^FS/); // 70 + 60
  });

  it('round-trips a ^FT ellipse byte-stably through parse → emit', () => {
    const { objects } = parseZPL('^XA^FT50,150^GE100,80,3,B^FS^XZ', 8);
    expect(generateZPL(BASE_LABEL, objects)).toContain('^FT50,150^GE100,80,3,B^FS');
  });

  it('cached image ^FT: anchor height follows the natural aspect, not stale heightDots', () => {
    // Resize keeps only widthDots in sync; a cached image's true height is
    // widthDots x natural-aspect. The ^FT anchor must use that, not heightDots.
    putImage({ id: 'imgA', name: 'a', dataUrl: 'data:,', width: 100, height: 50 });
    const zpl = generateZPL(BASE_LABEL, mk('image',
      { imageId: 'imgA', widthDots: 120, heightDots: 999, threshold: 128, _gfaCache: '^GFA1,1,1,00' }));
    expect(zpl).toContain('^FT50,130'); // 70 + round(120 * 50/100) = 70 + 60
    expect(zpl).not.toContain('^FT50,1069'); // not 70 + stale 999
  });

  it('keeps a hand-authored ^FT reverse box + ^FR text as two FT objects and round-trips them', () => {
    // Spec-true reverse: the filled ^FT ^GB stays its own box and the ^FR text
    // stays a separate reverse text; neither is collapsed or rewritten to ^FO,
    // so the foreign label round-trips with box, text, and position type intact.
    const src =
      '^XA^FT145,172^GB246,44,44,B,0^FS^FT145,172^A0N,44,34^FR^FDPESO LIQUIDO^FS^XZ';
    const { objects } = parseZPL(src, 8);
    expect(objects).toHaveLength(2);
    const [bar, text] = objects;
    // ^GB246,44,44 (thickness == height) is a filled horizontal bar = line.
    expect(bar?.type).toBe('line');
    expect(bar?.positionType).toBe('FT');
    expect(text?.type).toBe('text');
    expect(text?.positionType).toBe('FT');
    expect(props(text).reverse).toBe(true);
    // Re-emit preserves both FT anchors and the ^FR, no silent ^FO rewrite.
    const out = generateZPL(BASE_LABEL, objects);
    expect(out).toContain('^FT145,172^GB246,44,44,B,0^FS');
    expect(out).toContain('^FR^FD');
    expect(out).not.toContain('^FO');
  });

  it('cached image right-justified ^FT: anchor x uses the byte-padded ^GF width', () => {
    // ^GF rows pad to a byte boundary: widthDots 121 prints (and re-parses) as
    // 128, so the ^FT,1 x must key off 128, not 121, or the round-trip drifts.
    putImage({ id: 'imgB', name: 'b', dataUrl: 'data:,', width: 121, height: 60 });
    const zpl = generateZPL(BASE_LABEL, mk('image',
      { imageId: 'imgB', widthDots: 121, threshold: 128, _gfaCache: '^GFA1,1,1,00' },
      { fieldJustify: 'R' }));
    expect(zpl).toContain('^FT178,130,1'); // x 50 + ceil(121/8)*8 = 178; y 70 + 60
    expect(zpl).not.toContain('^FT171'); // not 50 + raw 121
  });
});
