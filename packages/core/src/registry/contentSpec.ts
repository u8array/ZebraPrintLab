import { mapLiteralSpans } from "../lib/fnTemplate";
import type { ContentSpec } from "../types/contentSpec";

export type { ContentSpec } from "../types/contentSpec";

const rejectCache = new WeakMap<ContentSpec, RegExp>();

function rejectPattern(spec: ContentSpec): RegExp {
  let re = rejectCache.get(spec);
  if (!re) {
    re = new RegExp(`[^${spec.charset}]`, 'g');
    rejectCache.set(spec, re);
  }
  return re;
}

/** True when `text` contains a character outside the spec's charset. */
export function violatesCharset(text: string, spec: ContentSpec): boolean {
  const re = rejectPattern(spec);
  re.lastIndex = 0; // shared /g regex is stateful
  return re.test(text);
}

export function filterContent(raw: string, spec?: ContentSpec): string {
  if (!spec) return raw;
  const filtered = raw.replace(rejectPattern(spec), '');
  return spec.maxLength ? filtered.slice(0, spec.maxLength) : filtered;
}

/** Resolve a panel entry's `contentSpec` (static rule or props-dependent
 *  function) against an object's props. */
export function resolveContentSpec(
  spec: ContentSpec | ((props: object) => ContentSpec | undefined) | undefined,
  props: object,
): ContentSpec | undefined {
  return typeof spec === "function" ? spec(props) : spec;
}

const sanitiserCache = new WeakMap<ContentSpec, (raw: string) => string>();

/** Marker-aware charset filter for the content editor: filters literal slices
 *  to the spec's charset while leaving `«…»` markers intact (so inserted
 *  variable/clock chips survive). Length is enforced separately via the
 *  editor's maxLength, so only the charset applies here. Cached per spec. */
export function contentSanitiser(spec: ContentSpec): (raw: string) => string {
  let fn = sanitiserCache.get(spec);
  if (!fn) {
    const charsetOnly: ContentSpec = { charset: spec.charset };
    fn = (raw) => {
      // Paste shortcut (e.g. GS1 "(01)…(10)…"), only with no markers present (a
      // chip means editing, not pasting). Output is the raw payload, verbatim.
      if (spec.normalize && !raw.includes("«")) {
        const normalized = spec.normalize(raw);
        if (normalized !== null) return normalized;
      }
      return mapLiteralSpans(raw, (slice) => filterContent(slice, charsetOnly));
    };
    sanitiserCache.set(spec, fn);
  }
  return fn;
}

/** True when `content`'s length matches one of `spec.validLengths`,
 *  or when `validLengths` is unset (no length constraint). Empty
 *  string is treated as "not yet committed" and returns true so the
 *  Properties panel doesn't warn on a fresh field. */
export function hasValidLength(content: string, spec?: ContentSpec): boolean {
  if (!spec?.validLengths || content === '') return true;
  return spec.validLengths.includes(content.length);
}
