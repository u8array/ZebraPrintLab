/**
 * `^TB` text-block payload encoding. Verified against Labelary.
 *
 * `<…>` is an escape sequence and `<<>` prints a literal `<`. A lone `<`
 * with no closing `>` swallows the rest of the field, so any literal `<` the
 * user typed must be emitted as `<<>`. A `>` outside an escape prints
 * literally, so only `<` needs escaping. `^TB` has no `\&` line break (it
 * prints `\&` raw), so embedded newlines cannot be represented and collapse
 * to a space on emit.
 *
 * The editor stores plain text in `content`; encode/decode is the single
 * source of truth for parser (decode) and generator (encode).
 */

const ESCAPED_LT = "<<>";
// Any `<…>` is a ^TB escape sequence; this matches one whole token so an
// imported escape (e.g. `<2C>`) is preserved verbatim instead of having its
// `<` re-escaped into `<<…>` on emit, which would corrupt the round-trip.
const ESCAPE_TOKEN = /^<[^<>]*>/;

/** Encode an editor string for emission inside a ^TB payload. */
export function encodeTbContent(s: string): string {
  const flat = s.replace(/\n/g, " ");
  let out = "";
  for (let i = 0; i < flat.length; ) {
    if (flat[i] === "<") {
      const token = ESCAPE_TOKEN.exec(flat.slice(i));
      if (token) {
        out += token[0];
        i += token[0].length;
        continue;
      }
      out += ESCAPED_LT;
      i += 1;
      continue;
    }
    out += flat[i];
    i += 1;
  }
  return out;
}

/** Decode a ^TB payload back to the editor representation. `<<>` becomes a
 *  literal `<`; other `<…>` escapes are left as-is so they re-emit unchanged. */
export function decodeTbContent(s: string): string {
  return s.split(ESCAPED_LT).join("<");
}
