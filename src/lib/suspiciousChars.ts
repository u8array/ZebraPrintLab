/** Code points that print or scan differently than they look: invisible or
 *  ambiguous whitespace and control/format chars, including the bidi marks that
 *  silently reorder a payload. Tab/newline/CR and normal space are legitimate,
 *  and U+00AD is the ^FB soft hyphen we emit on purpose, so those stay excluded. */
function isSuspicious(cp: number): boolean {
  if (cp === 9 || cp === 10 || cp === 13) return false; // tab, newline, CR
  if (cp <= 0x1f) return true; // C0 controls
  if (cp >= 0x7f && cp <= 0x9f) return true; // DEL + C1 controls
  if (cp === 0xa0) return true; // NBSP
  if (cp === 0x061c) return true; // Arabic letter mark
  if (cp === 0x1680) return true; // ogham space
  if (cp >= 0x2000 && cp <= 0x200f) return true; // en/em spaces, zero-width, LRM/RLM
  if (cp >= 0x202a && cp <= 0x202e) return true; // bidi embeddings / overrides
  if (cp === 0x2028 || cp === 0x2029) return true; // line / paragraph separator
  if (cp === 0x202f || cp === 0x205f) return true; // narrow / medium math space
  if (cp === 0x2060) return true; // word joiner
  if (cp >= 0x2066 && cp <= 0x2069) return true; // bidi isolates
  if (cp === 0x3000) return true; // ideographic space
  if (cp === 0xfeff) return true; // BOM / zero-width no-break space
  return false;
}

const NAMED: Record<number, string> = {
  0x00a0: "NBSP",
  0x200b: "ZWSP",
  0x200c: "ZWNJ",
  0x200d: "ZWJ",
  0x2060: "WJ",
  0xfeff: "BOM",
};

function label(cp: number): string {
  return NAMED[cp] ?? `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Compact summary of suspicious code points in `content`, or undefined when
 *  clean. e.g. "NBSP x31, U+2028 x1". Pure; the preflight producer stamps it
 *  as the finding's detail. */
export function suspiciousCharDetail(content: string): string | undefined {
  const counts = new Map<number, number>();
  for (const ch of content) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isSuspicious(cp)) counts.set(cp, (counts.get(cp) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  return [...counts.entries()].map(([cp, n]) => `${label(cp)} x${n}`).join(", ");
}
