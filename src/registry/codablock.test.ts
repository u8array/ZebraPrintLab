import { describe, it, expect } from 'vitest';
import { generateZPL } from '@zplab/core/lib/zplGenerator';
import { parseZPL } from '@zplab/core/lib/zplParser';
import { clampCodablockColumns, type CodablockProps } from '@zplab/core/registry/codablock';
import type { LabelConfig } from '@zplab/core/types/LabelConfig';
import type { LabelObject } from '@zplab/core/types/Group';

const BASE_LABEL: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 };

const cbObjects = (overrides: Partial<CodablockProps> = {}): LabelObject[] =>
  [
    {
      id: 'cb',
      type: 'codablock',
      x: 10,
      y: 10,
      rotation: 0,
      props: {
        content: '1234567890',
        moduleWidth: 2,
        rowHeight: 2,
        columns: 6,
        securityLevel: 'Y',
        rotation: 'N',
        ...overrides,
      },
    },
  ] as unknown as LabelObject[];

const codablockOf = (zpl: string) =>
  parseZPL(zpl).objects.find((o) => o.type === 'codablock') as
    | (LabelObject & { props: CodablockProps })
    | undefined;

describe('clampCodablockColumns', () => {
  it('backfills undefined / non-finite to the default', () => {
    expect(clampCodablockColumns(undefined)).toBe(6);
    expect(clampCodablockColumns(NaN)).toBe(6);
  });

  it('clamps into the spec c range 2-62 (kept faithful for round-trip)', () => {
    expect(clampCodablockColumns(1)).toBe(2);
    expect(clampCodablockColumns(99)).toBe(62);
    expect(clampCodablockColumns(10)).toBe(10);
  });
});

describe('codablock ^BB emit', () => {
  it('emits chars-per-row (c) so the printer stacks; rows (r) stay empty', () => {
    // Verified on a ZD230: r alone does not stack, c does. c drives the row
    // count from the data; mode is pinned to F to match the codablockf preview.
    expect(generateZPL(BASE_LABEL, cbObjects())).toContain('^BBN,2,Y,6,,F');
  });

  it('clamps columns into the spec c range on emit', () => {
    expect(generateZPL(BASE_LABEL, cbObjects({ columns: 99 }))).toContain(',62,,F');
    expect(generateZPL(BASE_LABEL, cbObjects({ columns: 1 }))).toContain(',2,,F');
  });

  it('backfills legacy codablock objects saved before columns existed', () => {
    const legacy = cbObjects();
    delete (legacy[0] as unknown as { props: Record<string, unknown> }).props.columns;
    expect(generateZPL(BASE_LABEL, legacy)).toContain(',6,,F');
  });
});

describe('codablock ^BB parse / round-trip', () => {
  it('reads the chars-per-row field and round-trips columns', () => {
    const obj = codablockOf('^XA^FO10,10^BY2^BBN,2,Y,10,,F^FD1234567890^FS^XZ');
    expect(obj?.props.columns).toBe(10);
  });

  it('preserves an imported c below the preview floor (round-trip faithful)', () => {
    // c=2 is spec-valid; the model/emit keep it even though the preview floors
    // at 4, so a re-export prints the same barcode as the source.
    const obj = codablockOf('^XA^FO10,10^BY2^BBN,2,Y,2,,F^FD1234567890^FS^XZ');
    expect(obj?.props.columns).toBe(2);
    expect(generateZPL(BASE_LABEL, [obj as LabelObject])).toContain(',2,,F');
  });

  it('defaults columns when ^BB omits the c field (legacy single-row)', () => {
    const obj = codablockOf('^XA^FO10,10^BY2^BBN,2,Y^FD1234567890^FS^XZ');
    expect(obj?.props.columns).toBe(6);
  });

  it('defaults columns when c is present but empty (e.g. r set, c blank)', () => {
    // int('') is 0, which must fall back to the default, not clamp to the floor.
    const obj = codablockOf('^XA^FO10,10^BY2^BBN,2,Y,,3,F^FD1234567890^FS^XZ');
    expect(obj?.props.columns).toBe(6);
  });

  it('survives a generate → parse → generate round-trip', () => {
    const first = generateZPL(BASE_LABEL, cbObjects({ columns: 10 }));
    const reparsed = parseZPL(first).objects.filter((o) => o.type === 'codablock');
    const second = generateZPL(BASE_LABEL, reparsed as LabelObject[]);
    expect(second).toContain(',10,,F');
  });
});
