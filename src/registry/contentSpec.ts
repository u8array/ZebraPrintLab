/**
 * Per-symbology content rules. Applied on input so the canvas preview
 * (bwip-js) does not throw on characters the renderer rejects.
 *
 * Case normalisation is intentionally not done here: the source ZPL
 * is preserved verbatim, and `bwipHelpers` uppercases at the lib call
 * site for the symbologies that require it.
 */
export interface ContentSpec {
  /** Character-class body (no surrounding `[]`), e.g. `0-9` or `0-9A-Z\\-. $/+%`. */
  charset: string;
  maxLength?: number;
}

const rejectCache = new WeakMap<ContentSpec, RegExp>();

function rejectPattern(spec: ContentSpec): RegExp {
  let re = rejectCache.get(spec);
  if (!re) {
    re = new RegExp(`[^${spec.charset}]`, 'g');
    rejectCache.set(spec, re);
  }
  return re;
}

export function filterContent(raw: string, spec?: ContentSpec): string {
  if (!spec) return raw;
  const filtered = raw.replace(rejectPattern(spec), '');
  return spec.maxLength ? filtered.slice(0, spec.maxLength) : filtered;
}
