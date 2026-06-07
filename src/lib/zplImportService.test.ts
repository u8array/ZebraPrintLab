import { describe, it, expect } from 'vitest';
import { importZplText } from './zplImportService';
import { generateSetupScript } from './zplSetupScript';
import type { PrinterProfile } from '../types/PrinterProfile';

describe('importZplText — single label', () => {
  it('returns one page with the parsed objects', () => {
    const zpl = '^XA^FO10,20^A0N,30,0^FDHello^FS^XZ';
    const result = importZplText(zpl, 8);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.objects).toHaveLength(1);
  });

});

describe('importZplText — multi-label', () => {
  it('splits into one page per ^XA...^XZ block', () => {
    const zpl = [
      '^XA^FO10,20^A0N,30,0^FDOne^FS^XZ',
      '^XA^FO50,60^A0N,30,0^FDTwo^FS^XZ',
      '^XA^FO80,90^A0N,30,0^FDThree^FS^XZ',
    ].join('\n');
    const result = importZplText(zpl, 8);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]?.objects).toHaveLength(1);
    expect(result.pages[1]?.objects).toHaveLength(1);
    expect(result.pages[2]?.objects).toHaveLength(1);
  });

  it('uses the first block\'s label dimensions', () => {
    const zpl = [
      '^XA^PW800^LL400^FDOne^FS^XZ',
      '^XA^PW400^LL200^FDTwo^FS^XZ',
    ].join('\n');
    const result = importZplText(zpl, 8);
    expect(result.labelConfig.widthMm).toBe(100); // 800 dots / 8 dpmm
    expect(result.labelConfig.heightMm).toBe(50);
  });

  it('discards content before the first ^XA', () => {
    const zpl = 'garbage text before\n^XA^FDOne^FS^XZ';
    const result = importZplText(zpl, 8);
    expect(result.pages).toHaveLength(1);
  });

  it('handles mixed-case ^XA delimiters', () => {
    const zpl = '^xa^FDone^FS^xz\n^XA^FDtwo^FS^XZ';
    const result = importZplText(zpl, 8);
    expect(result.pages).toHaveLength(2);
  });
});

describe('importZplText — empty / malformed', () => {
  it('returns no pages when no ^XA is present', () => {
    const result = importZplText('not zpl at all', 8);
    expect(result.pages).toHaveLength(0);
  });

  it('returns an empty findings list with empty buckets', () => {
    const result = importZplText('not zpl at all', 8);
    expect(result.report.findings).toEqual([]);
    expect(result.report.partial).toEqual([]);
  });
});

describe('importZplText: findings.pageIndex', () => {
  it('stamps page 0 on findings from the first block', () => {
    const zpl = '^XA^FO0,0^A@N,30,0,E:A.TTF^FDx^FS^XZ';
    const { report } = importZplText(zpl, 8);
    const partial = report.findings.filter((f) => f.kind === 'partial');
    expect(partial).toHaveLength(1);
    expect(partial[0]?.pageIndex).toBe(0);
  });

  it('stamps the correct page index across multiple blocks', () => {
    // Page 0: clean. Page 1: ^A@ partial. Page 2: ^IM browser-limit + ^XX unknown.
    const zpl = [
      '^XA^FO0,0^A0N,30,0^FDclean^FS^XZ',
      '^XA^FO0,0^A@N,30,0,E:A.TTF^FDfont^FS^XZ',
      '^XA^IMR:LOGO.GRF^XX99^XZ',
    ].join('\n');
    const { report } = importZplText(zpl, 8);
    const byPage = (idx: number) =>
      report.findings.filter((f) => f.pageIndex === idx).map((f) => f.kind);
    expect(byPage(0)).toEqual([]);
    expect(byPage(1)).toContain('partial');
    expect(byPage(2)).toContain('browserLimit');
    expect(byPage(2)).toContain('unknown');
  });

  it('per-page partial dedup is preserved (one partial per page even with two ^A@)', () => {
    // Inside page 1, ^A@ appears twice but is deduped per-block.
    const zpl = [
      '^XA^FO0,0^A0N,30,0^FDclean^FS^XZ',
      '^XA^FO0,0^A@N,30,0,E:A.TTF^FDa^FS^FO0,50^A@N,30,0,E:B.TTF^FDb^FS^XZ',
    ].join('\n');
    const { report } = importZplText(zpl, 8);
    const onPage1 = report.findings.filter(
      (f) => f.kind === 'partial' && f.pageIndex === 1,
    );
    expect(onPage1).toHaveLength(1);
    expect(onPage1[0]?.command).toBe('^A@');
  });

  it('folds printerProfile across multiple ^XA blocks (last-write-wins per key, non-overlapping preserved)', () => {
    // Block 1 sets reprintAfterError=N + setRealtimeClock.
    // Block 2 overrides reprintAfterError to Y.
    // Result must carry Y from block 2 AND the clock from block 1:
    // a per-block fold mid-pipeline; a refactor that collapsed the
    // fold to one end-of-stream pass would lose one of the two.
    const zpl = [
      '^XA^JZN^ST05,20,2026,12,00,00^XZ',
      '^XA^JZY^XZ',
    ].join('\n');
    const { printerProfile } = importZplText(zpl, 8);
    expect(printerProfile.reprintAfterError).toBe('Y');
    expect(printerProfile.setRealtimeClock).toBeDefined();
  });
});

describe('importZplText — ~DY font scope (setup vs design)', () => {
  // Hex for bytes [01,02,03,04]; loadFontBytesSync caches without
  // validating, so any byte string decodes through the parser.
  const HEX = '01020304';

  it('routes a setup ~DY (no ^CW) before ^XA into printerProfile.setupFonts', () => {
    const zpl = `~DYE:SETUP,A,T,4,,${HEX}\n^XA^JZY^XZ`;
    const { printerProfile, pages } = importZplText(zpl, 8);
    expect(printerProfile.setupFonts).toEqual([{ path: 'E:SETUP.TTF' }]);
    // The ^XA block still yields its (object-less) page.
    expect(pages).toHaveLength(1);
  });

  it('keeps the block objects while routing the preamble font to setupFonts', () => {
    const zpl =
      `~DYE:SETUP,A,T,4,,${HEX}\n` +
      `^XA^FO10,10^A0N,20,0^FDhi^FS^XZ`;
    const { printerProfile, pages } = importZplText(zpl, 8);
    expect(printerProfile.setupFonts).toEqual([{ path: 'E:SETUP.TTF' }]);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.objects).toHaveLength(1);
  });

  it('parses a fonts-only stream with no ^XA: setupFonts set, no page', () => {
    const zpl = `~DYE:ONLY,A,T,4,,${HEX}`;
    const { printerProfile, pages } = importZplText(zpl, 8);
    expect(printerProfile.setupFonts).toEqual([{ path: 'E:ONLY.TTF' }]);
    expect(pages).toHaveLength(0);
  });

  it('routes a design ~DY claimed by ^CW into customFonts, not setupFonts', () => {
    const zpl = `~DYE:DSGN,A,T,4,,${HEX}\n^XA^CWM,E:DSGN.TTF^XZ`;
    const { labelConfig, printerProfile } = importZplText(zpl, 8);
    expect(printerProfile.setupFonts).toBeUndefined();
    expect(labelConfig.customFonts).toEqual([
      expect.objectContaining({ alias: 'M', path: 'E:DSGN.TTF', embedInZpl: true }),
    ]);
  });

  it('splits a mixed stream: ^CW-claimed is design, unclaimed is setup', () => {
    const zpl =
      `~DYE:DSGN,A,T,4,,${HEX}\n~DYE:SETUP,A,T,4,,${HEX}\n` +
      `^XA^CWM,E:DSGN.TTF^XZ`;
    const { labelConfig, printerProfile } = importZplText(zpl, 8);
    expect(labelConfig.customFonts?.map((m) => m.path)).toEqual(['E:DSGN.TTF']);
    expect(printerProfile.setupFonts).toEqual([{ path: 'E:SETUP.TTF' }]);
  });

  it('treats a case-mismatched ^CW path as the same design font', () => {
    const zpl = `~DYE:DSGN,A,T,4,,${HEX}\n^XA^CWM,e:dsgn.ttf^XZ`;
    const { printerProfile } = importZplText(zpl, 8);
    expect(printerProfile.setupFonts).toBeUndefined();
  });

  it('round-trips generateSetupScript setupFonts back into the profile', async () => {
    const { loadFontBytes } = await import('./fontCache');
    await loadFontBytes(new Uint8Array([1, 2, 3, 4]), 'RTFONT.TTF');
    const script = generateSetupScript({
      setupFonts: [{ path: 'E:RTFONT.TTF' }],
    } as PrinterProfile);
    const { printerProfile } = importZplText(script, 8);
    expect(printerProfile.setupFonts).toEqual([{ path: 'E:RTFONT.TTF' }]);
  });
});
