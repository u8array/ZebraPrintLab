/**
 * Per-symbology content rules. Lives in `types/` so both the registry (input
 * filtering, emit) and the content editor can reference it without inverting
 * the layer direction.
 *
 * Case normalisation is intentionally not done here: the source ZPL is
 * preserved verbatim, and `bwipHelpers` uppercases at the lib call site for the
 * symbologies that require it.
 */
export interface ContentSpec {
  /** Character-class body (no surrounding `[]`), e.g. `0-9` or `0-9A-Z\\-. $/+%`. */
  charset: string;
  maxLength?: number;
  /** Set of exact lengths the symbology accepts (e.g. [2, 5] for
   *  UPC/EAN supplements). Used for soft validation in the
   *  PropertiesPanel; typed input is not blocked (the user has to
   *  pass through 1/3/4 chars to reach 5), but lengths outside the
   *  set surface an inline warning so the user notices before the
   *  printer rejects the field. */
  validLengths?: readonly number[];
  /** Optional paste normaliser run BEFORE charset filtering, only when the input
   *  carries no markers. Converts a recognised paste form (e.g. a GS1 element
   *  string `(01)…(10)…`) into the raw stored payload (with GS separators),
   *  returning null when the input isn't that form so charset filtering applies
   *  instead. Its output is returned verbatim, NOT re-filtered. */
  normalize?: (raw: string) => string | null;
}
