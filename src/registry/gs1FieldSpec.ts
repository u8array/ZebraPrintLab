import { GS1_SAMPLE_CONTENT, GS1_EXPANDED_CHARSET, elementStringToContent, parseGs1ToSegments } from '../lib/gs1';
import type { ContentSpec } from './contentSpec';

/** Editor charset for GS1 element strings, with the `(01)…(10)…` paste shortcut.
 *  One instance so the sanitiser/regex WeakMap caches hit across keystrokes and
 *  every GS1-capable symbology shares the same spec identity. */
export const GS1_CONTENT_SPEC: ContentSpec = {
  charset: GS1_EXPANDED_CHARSET,
  normalize: elementStringToContent,
};

/** Props patch when a field's GS1 mode is switched on. Seeds a valid sample only
 *  for an unbound, non-GS1 field so the encoder never throws; a bound field keeps
 *  its variable value. Callers spread any symbology extras (e.g. `quality: 200`). */
export function gs1EnablePatch(content: string, bound: boolean): { gs1: true; content?: string } {
  return !bound && parseGs1ToSegments(content) === null
    ? { gs1: true, content: GS1_SAMPLE_CONTENT }
    : { gs1: true };
}
