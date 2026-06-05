/**
 * GS1 Databar domain helpers: AI parsing, GTIN check digit, and shared constants.
 *
 * These live outside the rendering layer because the same logic is shared between
 * ZPL generation, bwip-js content prep, and (future) input validation.
 */

/** Symbologies that accept free-form AI content (Expanded, Expanded Stacked). */
export const GS1_DATABAR_EXPANDED_SYMBOLOGIES: ReadonlySet<number> = new Set([6, 7]);

/** Spec-maximum segments-per-row for ^BR Expanded Stacked (must be even, 2–22). */
export const GS1_DATABAR_DEFAULT_SEGMENTS = 22;

/** Fixed-length GS1 Application Identifiers; used to wrap raw input in parens. */
const FIXED_AI_LEN: Record<string, number> = {
  "00": 18, "01": 14, "02": 14, "11": 6, "13": 6, "15": 6, "17": 6, "20": 2,
};

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
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(body[12 - i] ?? "0", 10) * (i % 2 === 0 ? 3 : 1);
  }
  return body + ((10 - (sum % 10)) % 10).toString();
}

/**
 * Wrap a raw GS1 AI sequence (e.g. "0112345678901231") in parens for bwip-js
 * (e.g. "(01)12345678901231"). Already-wrapped input passes through unchanged.
 * Unknown AIs short-circuit and are appended verbatim so bwip-js can surface a
 * helpful parser error.
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
