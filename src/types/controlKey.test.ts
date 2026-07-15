import { describe, it, expect } from 'vitest';
import {
  CONTROL_KEY_NAMES,
  controlKeyBody,
  isControlBody,
  hasControlMarkers,
  resolveControlMarkers,
  controlBytesToMarkers,
} from './controlKey';

describe('control-key markers', () => {
  it('resolve and detokenise are symmetric for every catalogued key', () => {
    for (const key of CONTROL_KEY_NAMES) {
      const marker = `«${controlKeyBody(key)}»`;
      const byte = resolveControlMarkers(marker);
      expect(byte).toHaveLength(1);
      expect(controlBytesToMarkers(byte)).toBe(marker);
    }
  });

  it('resolves chips inline and leaves other markers alone', () => {
    expect(resolveControlMarkers('A«ctrl:TAB»B«name»C')).toBe('A\tB«name»C');
    expect(hasControlMarkers('«ctrl:TAB»')).toBe(true);
    expect(hasControlMarkers('«ctrl:NOPE»')).toBe(false);
  });

  it('isControlBody accepts only catalogued keys', () => {
    expect(isControlBody('ctrl:TAB')).toBe(true);
    expect(isControlBody('ctrl:ESC')).toBe(false);
    expect(isControlBody('clock:Y')).toBe(false);
  });

  it('tokenises only catalogued bytes; other C0 bytes stay raw', () => {
    expect(controlBytesToMarkers('A\tB\x1BC')).toBe('A«ctrl:TAB»B\x1BC');
  });
});
