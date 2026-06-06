import { describe, it, expect } from 'vitest';
import { SE_PATH_PATTERN } from './sePathPattern';

/** HTML5 anchors the `pattern` attribute as `^(?:...)$` when the
 *  browser validates form input. The test mirrors that anchoring
 *  so the JS-side check matches the DOM behaviour exactly. */
const re = new RegExp(`^(?:${SE_PATH_PATTERN})$`);

describe('SE_PATH_PATTERN — ^SE encoding-table soft-validation', () => {
  it('accepts canonical Zebra paths', () => {
    expect(re.test('E:UHANGUL.DAT')).toBe(true);
    expect(re.test('R:FONT.DAT')).toBe(true);
    expect(re.test('B:CONFIG.DAT')).toBe(true);
    expect(re.test('A:STORE.DAT')).toBe(true);
    expect(re.test('Z:ROM_FW.DAT')).toBe(true);
  });

  it('accepts lowercase drives, extensions, and stems', () => {
    expect(re.test('e:hello.dat')).toBe(true);
    expect(re.test('z:rom_fw.Dat')).toBe(true);
  });

  it('accepts stems with space, underscore, or hyphen', () => {
    expect(re.test('R:MY FILE.DAT')).toBe(true);
    expect(re.test('E:U_HANGUL.DAT')).toBe(true);
    expect(re.test('E:U-HANG.DAT')).toBe(true);
  });

  it('accepts the optional comma-separated second param', () => {
    expect(re.test('E:UHANGUL.DAT,1')).toBe(true);
    expect(re.test('Z:FW.DAT,foo')).toBe(true);
  });

  it('rejects paths missing the drive letter', () => {
    expect(re.test('UHANGUL.DAT')).toBe(false);
    expect(re.test(':UHANGUL.DAT')).toBe(false);
  });

  it('rejects unknown drive letters', () => {
    expect(re.test('X:UHANGUL.DAT')).toBe(false);
    // C: is the Windows-convention slip-up users are most likely
    // to type; pinning it makes the negative case match real
    // user-error patterns instead of an arbitrary "unknown".
    expect(re.test('C:UHANGUL.DAT')).toBe(false);
  });

  it('rejects non-DAT extensions', () => {
    expect(re.test('E:UHANGUL.DDD')).toBe(false);
    expect(re.test('E:UHANGUL.ATA')).toBe(false);
    expect(re.test('E:UHANGUL.TXT')).toBe(false);
  });

  it('rejects stems at the 9-char boundary and when empty', () => {
    // 9 chars pins the exact off-by-one; a hypothetical regex
    // tweak to `{1,12}` or `{1,9}` would slip past a 12-char-only
    // test, this one catches it.
    expect(re.test('E:NINECHARS.DAT')).toBe(false);
    expect(re.test('E:VERYLONGNAME.DAT')).toBe(false);
    expect(re.test('E:.DAT')).toBe(false);
  });

  it('rejects control chars and newlines in the path', () => {
    // The schema + parser already reject these as ZPL-injection
    // chars; pin them here too so the UI :invalid hint stays
    // aligned with the security boundary one layer deeper.
    expect(re.test('E:FOO\nBAR.DAT')).toBe(false);
    expect(re.test('E:FOO\rBAR.DAT')).toBe(false);
    expect(re.test('E:FOO\tBAR.DAT')).toBe(false);
  });

  it('rejects free-form non-paths', () => {
    expect(re.test('not_a_path')).toBe(false);
    expect(re.test('')).toBe(false);
  });
});
