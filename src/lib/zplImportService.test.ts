import { describe, it, expect } from 'vitest';
import { importZplText } from './zplImportService';

describe('importZplText — single label', () => {
  it('returns one page with the parsed objects', () => {
    const zpl = '^XA^FO10,20^A0N,30,0^FDHello^FS^XZ';
    const result = importZplText(zpl, 8);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.objects).toHaveLength(1);
  });

  it('reports a single-page notice', () => {
    const zpl = '^XA^FO10,20^A0N,30,0^FDHello^FS^XZ';
    const result = importZplText(zpl, 8);
    expect(result.notice).toContain('1 object');
    expect(result.notice).not.toContain('pages');
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

  it('mentions the page count in the notice', () => {
    const zpl = '^XA^FDOne^FS^XZ\n^XA^FDTwo^FS^XZ';
    const result = importZplText(zpl, 8);
    expect(result.notice).toContain('across 2 pages');
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

  it('flags differing dimensions in the notice', () => {
    const zpl = [
      '^XA^PW800^LL400^FDOne^FS^XZ',
      '^XA^PW400^LL200^FDTwo^FS^XZ',
    ].join('\n');
    const result = importZplText(zpl, 8);
    expect(result.notice).toContain('different dimensions');
  });

  it('does not flag dimensions when they match', () => {
    const zpl = [
      '^XA^PW800^LL400^FDOne^FS^XZ',
      '^XA^PW800^LL400^FDTwo^FS^XZ',
    ].join('\n');
    const result = importZplText(zpl, 8);
    expect(result.notice).not.toContain('different dimensions');
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
    expect(result.notice).toContain('No labels found');
  });
});
