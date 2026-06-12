/**
 * Lightweight ZPL syntax tokenizer for the read-only output preview.
 *
 * A stateful scanner (Monarch-style, but ~one function) rather than a single
 * regex split: ZPL needs context a stateless regex cannot give. A command is
 * the prefix (`^`/`~`) plus exactly two characters, and `^FD`/`^FV` payloads
 * run as opaque field data until the next command, so a digit or capital
 * letter inside the data is content, not a parameter or a new command.
 *
 * Operates per line; the generator never splits a `^FD…^FS` field across real
 * newlines (block line breaks are encoded as `\&`).
 */

export type ZplTokenType =
  | "structural" // ^XA ^XZ: format boundaries
  | "command" // ^FO ^BU ^A0 …
  | "fieldData" // ^FD/^FV payload (the printed content)
  | "comment" // ^FX text
  | "number" // numeric parameter
  | "enum" // letter/flag parameter (N, Y, R, …)
  | "separator" // ,
  | "text"; // whitespace or stray characters

export interface ZplToken {
  type: ZplTokenType;
  value: string;
}

const STRUCTURAL = new Set(["XA", "XZ"]);
const DATA_CMDS = new Set(["FD", "FV"]);
const COMMENT_CMDS = new Set(["FX"]);

const isCmdStart = (ch: string | undefined) => ch === "^" || ch === "~";

// Split a parameter run into numbers, commas, and flag tokens. Field data is
// never passed here, so a comma is always a real separator.
function pushParams(run: string, out: ZplToken[]): void {
  for (const m of run.matchAll(/(\d+(?:\.\d+)?|,|[^,\d]+)/g)) {
    const value = m[0];
    if (value === ",") out.push({ type: "separator", value });
    else if (/^\d/.test(value)) out.push({ type: "number", value });
    else out.push({ type: "enum", value });
  }
}

export function tokenizeZplLine(line: string): ZplToken[] {
  const out: ZplToken[] = [];
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (isCmdStart(line[i])) {
      const code = line.slice(i + 1, i + 3).toUpperCase();
      out.push({
        type: STRUCTURAL.has(code) ? "structural" : "command",
        value: line.slice(i, i + 3),
      });
      i += 3;
      // Everything up to the next command is this command's payload.
      let j = i;
      while (j < n && !isCmdStart(line[j])) j++;
      const run = line.slice(i, j);
      if (run) {
        if (DATA_CMDS.has(code)) out.push({ type: "fieldData", value: run });
        else if (COMMENT_CMDS.has(code)) out.push({ type: "comment", value: run });
        else pushParams(run, out);
      }
      i = j;
    } else {
      let j = i;
      while (j < n && !isCmdStart(line[j])) j++;
      out.push({ type: "text", value: line.slice(i, j) });
      i = j;
    }
  }
  return out;
}
