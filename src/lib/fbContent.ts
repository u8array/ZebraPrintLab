/**
 * `^FB` block-text uses `\&` as the in-payload line-break marker (Zebra
 * spec). The editor stores literal newlines in `content`; encode/decode
 * translates between the two representations and is the single source of
 * truth for both parser (decode) and generator (encode).
 *
 * To round-trip user payloads that happen to contain a literal `\&`
 * sequence, `\` itself is escaped as `\\`. Decode reverses both
 * substitutions in one scanning pass so order matters only inside the
 * helper, not at the call sites.
 */

/** Encode an editor string for emission inside a ^FB payload. */
export function encodeFbContent(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\&";
    else out += ch;
  }
  return out;
}

/** Decode a ^FB payload back to the editor representation. Symmetric
 *  with `encodeFbContent`; unknown `\x` sequences pass through literally
 *  so non-encoded legacy payloads survive without silent corruption. */
export function decodeFbContent(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === "\\") {
        out += "\\";
        i += 2;
        continue;
      }
      if (next === "&") {
        out += "\n";
        i += 2;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}
