import type { Handler } from "../types";

/** Handlers for commands the parser intentionally ignores or surfaces
 *  as "needs printer hardware".
 *
 *  - **noops** (FV, FM, FP, JA, JM, JC, JD, JE, JI, JR, JS, JU, PP):
 *    parsed and dropped. They have no design impact in a browser-only
 *    editor; consuming them keeps the dispatch map exhaustive so the
 *    final "unknown command" fallback doesn't fire.
 *  - **browser-limit** (FL, HT, LF, IM, ~DG): commands that need
 *    printer-resident storage / hardware. Recorded into the
 *    `browserLimit` finding bucket so the import report can surface
 *    them as "not loaded but intentionally skipped". */
export function createUnsupportedHandlers(
  { skipped, browserLimit }: { skipped: string[]; browserLimit: string[] },
): Record<string, Handler> {
  const noop: Handler = () => void 0;
  const mkBrowserLimit =
    (prefix: string, delimiter = "^"): Handler =>
    (_, rest) => {
      const tok = `${delimiter}${prefix}${rest}`;
      skipped.push(tok);
      browserLimit.push(tok);
    };

  return {
    // Noops — present in stream, no design impact.
    FV: noop,
    FM: noop,
    FP: noop,
    JA: noop,
    JM: noop,
    JC: noop,
    JD: noop,
    JE: noop,
    JI: noop,
    JR: noop,
    JS: noop,
    JU: noop,
    PP: noop,
    // Browser-limit factories — surface as "not loaded" findings.
    FL: mkBrowserLimit("FL"),
    HT: mkBrowserLimit("HT"),
    LF: mkBrowserLimit("LF"),
    IM: mkBrowserLimit("IM"),
    DG: mkBrowserLimit("DG", "~"),
  };
}
