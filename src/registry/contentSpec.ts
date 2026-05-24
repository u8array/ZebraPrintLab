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
  /** Set of exact lengths the symbology accepts (e.g. [2, 5] for
   *  UPC/EAN supplements). Used for soft validation in the
   *  PropertiesPanel — typed input is not blocked (the user has to
   *  pass through 1/3/4 chars to reach 5), but lengths outside the
   *  set surface an inline warning so the user notices before the
   *  printer rejects the field. */
  validLengths?: readonly number[];
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

/** True when `content`'s length matches one of `spec.validLengths`,
 *  or when `validLengths` is unset (no length constraint). Empty
 *  string is treated as "not yet committed" and returns true so the
 *  Properties panel doesn't warn on a fresh field. */
export function hasValidLength(content: string, spec?: ContentSpec): boolean {
  if (!spec?.validLengths || content === '') return true;
  return spec.validLengths.includes(content.length);
}
