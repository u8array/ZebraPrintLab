/**
 * GS1 domain helpers: AI catalog, segment parse/serialize, validation, and
 * check digits. Shared between the GS1 content builder, ZPL generation, and
 * bwip-js content prep. Pure, no UI.
 *
 * Element-string truth (verified via a GS1 decoder against bwip-js): the
 * human-readable `(01)…(10)…` parentheses are display-only; the encoded data
 * stream separates a VARIABLE-length AI from the next AI with a GS character
 * (0x1d). Fixed-length AIs need no separator. The last AI never gets one.
 */

/** Group-separator: the FNC1 separator after a non-last variable-length AI. */
export const GS1_GS = "\x1d";

/** Symbologies that accept free-form AI content (Expanded, Expanded Stacked). */
export const GS1_DATABAR_EXPANDED_SYMBOLOGIES: ReadonlySet<number> = new Set([6, 7]);

/** Spec-maximum segments-per-row for ^BR Expanded Stacked (must be even, 2–22). */
export const GS1_DATABAR_DEFAULT_SEGMENTS = 22;

/** Fixed-length GS1 Application Identifiers; used to wrap raw input in parens. */
const FIXED_AI_LEN: Record<string, number> = {
  "00": 18, "01": 14, "02": 14, "11": 6, "13": 6, "15": 6, "17": 6, "20": 2,
};

export type Gs1Kind = "gtin" | "fixedNum" | "date" | "varNum" | "varAlnum";
export type Gs1Group = "identification" | "date" | "batchQty" | "measures";

export interface Gs1AiSpec {
  ai: string;
  kind: Gs1Kind;
  /** Data length: exact for fixed kinds, maximum for variable kinds. */
  len: number;
  /** Mod-10 check digit is part of the (numeric) data. */
  checkDigit?: boolean;
  group: Gs1Group;
}

/** A built GS1 element: an AI plus its (unwrapped) data value. */
export interface Gs1Segment {
  ai: string;
  value: string;
}

/**
 * Curated AI catalog for the builder (the common AIs, not the full GS1 set).
 * `kind` drives validation; `len` is exact for fixed kinds, max for variable.
 * Longer AI strings come first so raw parsing matches them before 2-digit AIs.
 */
export const AI_CATALOG: readonly Gs1AiSpec[] = [
  { ai: "3103", kind: "fixedNum", len: 6, group: "measures" },
  { ai: "240", kind: "varAlnum", len: 30, group: "identification" },
  { ai: "00", kind: "fixedNum", len: 18, checkDigit: true, group: "identification" },
  { ai: "01", kind: "gtin", len: 14, checkDigit: true, group: "identification" },
  { ai: "10", kind: "varAlnum", len: 20, group: "batchQty" },
  { ai: "11", kind: "date", len: 6, group: "date" },
  { ai: "15", kind: "date", len: 6, group: "date" },
  { ai: "17", kind: "date", len: 6, group: "date" },
  { ai: "20", kind: "fixedNum", len: 2, group: "batchQty" },
  { ai: "21", kind: "varAlnum", len: 20, group: "identification" },
  { ai: "30", kind: "varNum", len: 8, group: "batchQty" },
];

const AI_BY_CODE: ReadonlyMap<string, Gs1AiSpec> = new Map(AI_CATALOG.map((s) => [s.ai, s]));
/** AI codes longest-first, so raw parsing matches 4/3-digit AIs before 2-digit. */
const AI_CODES_BY_LEN: readonly string[] = [...AI_CATALOG].map((s) => s.ai).sort((a, b) => b.length - a.length);

/** Catalog grouped for the builder palette; precomputed so the modal does not
 *  re-filter per render. Every group key is initialized so a group with no AI
 *  is an empty array, never undefined. */
export const AI_BY_GROUP: Record<Gs1Group, Gs1AiSpec[]> = {
  identification: [],
  date: [],
  batchQty: [],
  measures: [],
};
for (const s of AI_CATALOG) AI_BY_GROUP[s.group].push(s);

export function aiSpec(ai: string): Gs1AiSpec | undefined {
  return AI_BY_CODE.get(ai);
}

export function isVariableKind(kind: Gs1Kind): boolean {
  return kind === "varNum" || kind === "varAlnum";
}

/** GS1 mod-10 check digit (weights 3-1 from the right) for a numeric body. */
export function mod10CheckDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = parseInt(body[body.length - 1 - i] ?? "0", 10);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return ((10 - (sum % 10)) % 10).toString();
}

/**
 * Pad to 13 digits and append the GTIN-14 check digit. Used for symbologies 1–5
 * where the user can supply a partial GTIN; bwip-js requires a fully-valid
 * 14-digit number, while Labelary completes it server-side.
 */
export function gtin14WithCheck(content: string): string {
  let digits = content.replace(/\D/g, "");
  if (digits.startsWith("01") && digits.length > 14) digits = digits.slice(2);
  if (digits.length >= 14) return digits.slice(0, 14);
  const body = digits.padStart(13, "0");
  return body + mod10CheckDigit(body);
}

// CSET 82 minus parens: "(" / ")" are valid GS1 chars but make the bwip-js
// element string ambiguous (no escaping strategy yet), so the builder forbids
// them. Re-add once raw-GS1 / escaped input is wired.
const CSET82 = /^[0-9A-Za-z!"%&'*+,\-./:;<=>?_]*$/;

/** Char-class body (for a non-destructive input filter) of valid raw GS1
 *  Expanded content: CSET 82 (no parens) plus the GS separator. Hyphen last. */
export const GS1_EXPANDED_CHARSET = `0-9A-Za-z!"%&'*+,./:;<=>?_${GS1_GS}-`;

/** Valid GS1 seed (raw model form: AI 01 + a check-valid GTIN-14) used when a
 *  symbol switches into GS1 mode and its current content is not GS1, so the
 *  encoder renders a sample instead of throwing. */
export const GS1_SAMPLE_CONTENT = "0109501101530003";

/** Escape-sequence control character we emit for GS1 DataMatrix (^BX g param).
 *  FNC1 is then written as `<escape>1`, both leading and as AI separator. */
export const GS1_DATAMATRIX_ESCAPE = "_";

/** ^FD field data for GS1 DataMatrix: a leading FNC1, each GS separator as the
 *  escape sequence (`_1`), and any literal escape char in the data doubled
 *  (`__`). `_` is a valid GS1 char, so it must be escaped per the ^BX
 *  quality-200 rule, else it would read as a stray FNC. Pairs with `^BX…,,,,_`. */
export function gs1ContentToDataMatrixFd(content: string): string {
  const esc = GS1_DATAMATRIX_ESCAPE;
  const fnc1 = esc + "1";
  // A trailing GS would emit a dangling FNC1 (separator with no data); drop it.
  let body = content;
  while (body.endsWith(GS1_GS)) body = body.slice(0, -1);
  const segments = body.split(GS1_GS).map((s) => s.replaceAll(esc, esc + esc));
  return fnc1 + segments.join(fnc1);
}

/** Inverse of gs1ContentToDataMatrixFd. Returns null when `fd` lacks the leading
 *  FNC1, so the parser keeps non-GS1 field data verbatim. `<esc><esc>` decodes
 *  to a literal escape char, `<esc>1` to a GS separator. */
export function dataMatrixFdToGs1Content(fd: string, escape: string): string | null {
  const fnc1 = escape + "1";
  if (!fd.startsWith(fnc1)) return null;
  let out = "";
  for (let i = fnc1.length; i < fd.length; i++) {
    const c = fd.charAt(i);
    if (c === escape) {
      const next = fd.charAt(i + 1);
      if (next === escape) { out += escape; i++; continue; }
      if (next === "1") { out += GS1_GS; i++; continue; }
    }
    out += c;
  }
  return out;
}

/** AIs that may stand alone; every other AI is a trade-item attribute that
 *  requires a GTIN (01) in the same DataBar Expanded symbol (bwip enforces). */
const GS1_STANDALONE_AIS = new Set(["00", "01"]);

/** Set-level GS1 rule check: an attribute AI needs a (01) GTIN segment. Returns
 *  a stable error key or null. Per-field errors are checked separately. */
export function validateGs1Segments(segments: readonly Gs1Segment[]): string | null {
  if (segments.length === 0) return "empty";
  // bwip rejects a repeated AI with a differing value; the builder forbids any
  // duplicate AI (a same-value repeat is pointless here).
  const seen = new Set<string>();
  for (const s of segments) {
    if (seen.has(s.ai)) return "duplicateAi";
    seen.add(s.ai);
  }
  const needsGtin = segments.some((s) => !GS1_STANDALONE_AIS.has(s.ai));
  if (needsGtin && !segments.some((s) => s.ai === "01")) return "missingGtin";
  return null;
}

/** Bare GTIN body for the non-Expanded symbologies (1-5): the (01) value if the
 *  content is multi-AI, else its digits. Used when switching away from Expanded
 *  so preview and ZPL agree instead of carrying stale multi-AI content. */
export function gtinBodyFromContent(content: string): string {
  const segs = parseGs1ToSegments(content);
  const gtin = segs?.find((s) => s.ai === "01");
  if (gtin) return gtin.value;
  // Unparseable fallback: strip a leading 01 AI prefix so the GTIN isn't
  // truncated with the prefix baked in.
  let digits = content.replace(/\D/g, "");
  if (digits.startsWith("01") && digits.length > 14) digits = digits.slice(2);
  return digits.slice(0, 14);
}

/**
 * Validate a segment's value for its AI. Returns a stable error key (for
 * localized messages) or null when valid. GTIN shorter than 14 is accepted
 * (the check digit is auto-completed downstream), so it returns null.
 */
export function validateGs1Segment(ai: string, value: string): string | null {
  const spec = AI_BY_CODE.get(ai);
  if (!spec) return "unknownAi";
  if (value === "") return "empty";
  switch (spec.kind) {
    case "gtin": {
      if (!/^\d+$/.test(value)) return "digitsOnly";
      if (value.length > 14) return "tooLong";
      // A full 14-digit GTIN must carry a valid check digit; shorter input is
      // auto-completed downstream, so it is accepted here.
      if (value.length === 14 && mod10CheckDigit(value.slice(0, 13)) !== value[13]) return "checkDigit";
      return null;
    }
    case "fixedNum": {
      if (!/^\d+$/.test(value)) return "digitsOnly";
      if (value.length !== spec.len) return "exactLength";
      if (spec.checkDigit && mod10CheckDigit(value.slice(0, -1)) !== value.slice(-1)) return "checkDigit";
      return null;
    }
    case "date": {
      if (!/^\d{6}$/.test(value)) return "dateFormat";
      const mm = Number(value.slice(2, 4));
      const dd = Number(value.slice(4, 6));
      if (mm < 1 || mm > 12) return "dateMonth";
      // 00 = whole month (allowed); otherwise a real calendar day for the month
      // (Feb capped at 29 since the YY century is ambiguous).
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1] ?? 31;
      if (dd !== 0 && dd > maxDay) return "dateDay";
      return null;
    }
    case "varNum": {
      if (!/^\d+$/.test(value)) return "digitsOnly";
      if (value.length > spec.len) return "tooLong";
      return null;
    }
    case "varAlnum": {
      if (!CSET82.test(value)) return "charset";
      if (value.length > spec.len) return "tooLong";
      return null;
    }
  }
}

/** Element string `(01)…(10)…` for display and bwip-js input. GTIN values are
 *  completed to 14 digits so bwip-js accepts them. */
export function segmentsToElementString(segments: readonly Gs1Segment[]): string {
  return segments
    .map((s) => {
      const spec = AI_BY_CODE.get(s.ai);
      const value = spec?.kind === "gtin" ? gtin14WithCheck(s.value) : s.value;
      return `(${s.ai})${value}`;
    })
    .join("");
}

/** Raw model `content`: AI+value concatenated, with a GS separator after a
 *  variable-length AI that is not the last segment. GTIN completed to 14. */
export function segmentsToContent(segments: readonly Gs1Segment[]): string {
  let out = "";
  segments.forEach((s, i) => {
    const spec = AI_BY_CODE.get(s.ai);
    const value = spec?.kind === "gtin" ? gtin14WithCheck(s.value) : s.value;
    out += s.ai + value;
    const variable = spec ? isVariableKind(spec.kind) : false;
    if (variable && i < segments.length - 1) out += GS1_GS;
  });
  return out;
}

/** AI code present at `pos`, longest match first, or null. */
function matchAiAt(content: string, pos: number): string | null {
  for (const code of AI_CODES_BY_LEN) {
    if (content.startsWith(code, pos)) return code;
  }
  return null;
}

/**
 * Parse model `content` (parenthesized OR raw with GS separators) into segments,
 * or null when it is not cleanly GS1 (caller falls back to free-text editing,
 * never corrupting the content). Variable AIs end at a GS char or the next AI's
 * boundary cannot be assumed, so unseparated variable runs return null.
 */
export function parseGs1ToSegments(content: string): Gs1Segment[] | null {
  if (content === "") return [];
  // Element-string form only when it starts with "("; a "(" inside a varAlnum
  // value (valid CSET 82) must not flip raw content into parens parsing.
  if (content.startsWith("(")) {
    const segs: Gs1Segment[] = [];
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    let consumed = 0;
    while ((m = re.exec(content)) !== null) {
      if (m.index !== consumed) return null;
      const ai = m[1] ?? "";
      if (!AI_BY_CODE.has(ai)) return null;
      segs.push({ ai, value: m[2] ?? "" });
      consumed = re.lastIndex;
    }
    return consumed === content.length && segs.length > 0 ? segs : null;
  }
  const segs: Gs1Segment[] = [];
  let pos = 0;
  while (pos < content.length) {
    const ai = matchAiAt(content, pos);
    if (!ai) return null;
    const spec = AI_BY_CODE.get(ai);
    if (!spec) return null;
    pos += ai.length;
    if (isVariableKind(spec.kind)) {
      const gs = content.indexOf(GS1_GS, pos);
      const end = gs === -1 ? content.length : gs;
      segs.push({ ai, value: content.slice(pos, end) });
      pos = gs === -1 ? end : gs + 1;
    } else {
      const value = content.slice(pos, pos + spec.len);
      if (value.length !== spec.len) return null;
      segs.push({ ai, value });
      pos += spec.len;
    }
  }
  return segs.length > 0 ? segs : null;
}

/**
 * Element-string form for bwip-js from raw model content. Prefers a clean
 * segment parse; falls back to the legacy fixed-AI wrapper so existing content
 * still renders, and to verbatim pass-through for already-parenthesized input.
 */
export function gs1ContentToElementString(content: string): string {
  if (content.startsWith("(")) return content;
  const segs = parseGs1ToSegments(content);
  if (segs) return segmentsToElementString(segs);
  return wrapGs1AIs(content);
}

/**
 * If `raw` is a pasted element string `(AI)…(AI)…` (whitespace tolerated), parse
 * it and return the raw model content with GS separators; otherwise null. Lets
 * the input accept pasted GS1 notation instead of silently stripping the parens.
 */
export function elementStringToContent(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("(")) return null;
  const segs = parseGs1ToSegments(trimmed);
  return segs ? segmentsToContent(segs) : null;
}

/**
 * Legacy: wrap a raw fixed-AI sequence in parens for bwip-js. Kept for content
 * that predates the catalog parser. Unknown/variable AIs short-circuit and are
 * appended verbatim so bwip-js can surface a helpful parser error.
 */
export function wrapGs1AIs(content: string): string {
  if (content.includes("(")) return content;
  let out = "";
  let pos = 0;
  while (pos < content.length) {
    const ai = content.slice(pos, pos + 2);
    const len = FIXED_AI_LEN[ai];
    if (len === undefined) {
      out += content.slice(pos);
      break;
    }
    let data = content.slice(pos + 2, pos + 2 + len);
    if (ai === "01" && data.length < 14 && /^\d+$/.test(data)) {
      data = gtin14WithCheck(data);
    }
    out += `(${ai})${data}`;
    pos += 2 + len;
  }
  return out;
}
