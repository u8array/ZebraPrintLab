import type { CustomFontMapping } from "../types/ObjectType";

/** Characters NOT allowed in a ^CW alias. Used as a strip-pattern on
 *  user input so a single source of truth feeds both UI surfaces (the
 *  Custom Fonts editor and the Fonts-tab inline alias). The schema
 *  regex (`/^[A-Z0-9]$/`) is the inverse and lives next to the schema. */
export const ALIAS_CHAR_RE = /[^A-Z0-9]/g;

/** Drive prefix used when surfacing a browser-uploaded font as a
 *  printer path suggestion. E: (flash) is the most common storage on
 *  Zebra hardware; users who target a different drive can edit the
 *  Custom Fonts row directly. */
export const DEFAULT_FONT_DRIVE = "E:";

/** Standard Zebra storage drive prefixes for path suggestions:
 *  E = flash, R = volatile RAM, A = removable (PCMCIA/CF), B = optional
 *  on-board flash. The first entry matches `DEFAULT_FONT_DRIVE`. */
export const ZPL_DRIVE_PREFIXES = ["E:", "R:", "A:", "B:"] as const;

/** Built-in alphanumeric font IDs the Zebra firmware ships with.
 *  Used as default-font suggestions and excluded from the auto-pick
 *  range in `nextFreeAlias` so users do not accidentally override the
 *  built-ins. */
export const ZPL_BUILTIN_FONT_IDS = [
  "0",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
] as const;

/** The printer-storage path emitted for a browser-uploaded font. */
export function uploadedFontPath(name: string): string {
  return `${DEFAULT_FONT_DRIVE}${name}`;
}

/** Normalise raw user input into a valid ^CW alias char (or empty
 *  string if no usable character is present). */
export function normalizeAlias(raw: string): string {
  return raw.toUpperCase().replace(ALIAS_CHAR_RE, "").slice(0, 1);
}

/** Upsert (or remove) a mapping by path. A non-empty `alias` replaces
 *  the entry for `path`; an empty `alias` removes it. Order is
 *  preserved for existing entries; a new entry is appended. */
export function upsertCustomFontMapping(
  list: readonly CustomFontMapping[] | undefined,
  path: string,
  alias: string,
): CustomFontMapping[] {
  const withoutPath = (list ?? []).filter((m) => m.path !== path);
  if (!alias) return withoutPath;
  return [...withoutPath, { alias, path }];
}

const ZPL_BUILTIN_FONT_LETTERS = '0ABCDEFGH';
const ALIAS_PREFERRED_ORDER = 'IJKLMNOPQRSTUVWXYZ123456789';

/** Pick the first alias character that is not already taken. Built-in
 *  Zebra font letters (0, A-H) are tried only after the unreserved
 *  range is exhausted; assigning one of them is a deliberate override
 *  of the built-in font, which we avoid by default. Returns '' if all
 *  36 valid alias characters are in use. */
export function nextFreeAlias(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (const c of ALIAS_PREFERRED_ORDER) {
    if (!used.has(c)) return c;
  }
  for (const c of ZPL_BUILTIN_FONT_LETTERS) {
    if (!used.has(c)) return c;
  }
  return '';
}
