import type { CustomFontMapping, LabelConfig } from "../types/ObjectType";

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

/** Drop the leading Zebra drive prefix (`E:`, `R:`, `A:`, `B:`) from a
 *  storage path, returning the bare filename. Used by every surface
 *  that shows a printer path to the user (font dropdowns, mapping
 *  rows) — the drive letter is implementation detail; the filename is
 *  what the user picked. */
export function stripDrivePrefix(path: string): string {
  return path.replace(/^[A-Z]:/, "");
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

/** The nine built-in Zebra font identifiers as a single string for
 *  fast `.includes()` checks. Kept lowercase-named (no `_IDS` suffix)
 *  because consumers iterate over it both as a list and as a set. */
export const ZPL_BUILTIN_FONT_LETTERS = '0ABCDEFGH';
const ALIAS_PREFERRED_ORDER = 'IJKLMNOPQRSTUVWXYZ123456789';

/** True when the alias is a Zebra built-in font (0, A-H). Built-ins
 *  cannot be ^CW-aliased to printer paths in a meaningful way (the
 *  printer already ships them); the UI uses this to decide whether the
 *  "On printer (path)" column applies. Guards against the empty-string
 *  trap — `String.includes("")` is always `true`, which would let a
 *  blank alias trip every "built-in" branch. */
export function isBuiltinFontId(alias: string): boolean {
  return alias.length === 1 && ZPL_BUILTIN_FONT_LETTERS.includes(alias);
}

/** Resolve a font identifier to the canvas-only preview TTF name (a
 *  `fontCache` key, typically the uploaded filename like "ARIAL.TTF").
 *  Used by the canvas text renderer to apply the user's chosen TTF to
 *  any text field that references the given font ID — directly (via
 *  `text.props.fontId`) or via the label-wide default
 *  (`label.defaultFontId`). Falls back to the path's filename when
 *  `previewFontName` is unset so manually-declared printer-resident
 *  mappings whose name happens to match a previously uploaded font
 *  still preview. Emit/parse paths intentionally ignore this resolver;
 *  it only colours pixels in the editor. */
export function resolvePreviewFontName(
  label: Pick<LabelConfig, "customFonts">,
  fontId: string | undefined,
): string | undefined {
  if (!fontId) return undefined;
  const entry = label.customFonts?.find((m) => m.alias === fontId);
  if (!entry) return undefined;
  if (entry.previewFontName) return entry.previewFontName;
  if (entry.path) return stripDrivePrefix(entry.path);
  return undefined;
}

/** Back-compat wrapper for the label-wide default font. Identical to
 *  `resolvePreviewFontName(label, label.defaultFontId)`; kept as a
 *  named helper so call sites read intent-first ("resolve default")
 *  instead of leaking the fontId-pick. */
export function resolveDefaultPrinterFontName(
  label: Pick<LabelConfig, "defaultFontId" | "customFonts">,
): string | undefined {
  return resolvePreviewFontName(label, label.defaultFontId);
}

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

export interface FontIdOption {
  /** The single-character font identifier (0, A-Z). */
  id: string;
  /** True for the nine Zebra built-in font IDs (0, A-H). */
  builtin: boolean;
  /** Path the alias maps to on the printer, when set via `^CW`. */
  path?: string;
  /** Uploaded TTF the canvas uses to preview the alias. */
  previewFontName?: string;
}

/** Enumerate every font identifier the user can pick on the label —
 *  the nine Zebra built-ins (0, A-H) plus any aliases declared in
 *  `label.customFonts`. Used by the global "Default font" dropdown and
 *  the per-text "Font" dropdown; both surfaces need the same shape so
 *  switching between them feels symmetric. Custom aliases that happen
 *  to collide with a built-in (a user can override A-H deliberately)
 *  take over the built-in row instead of producing a duplicate. */
export function getAvailableFontIds(
  label: Pick<LabelConfig, "customFonts">,
): FontIdOption[] {
  const byId = new Map<string, FontIdOption>();
  for (const id of ZPL_BUILTIN_FONT_LETTERS) {
    byId.set(id, { id, builtin: true });
  }
  for (const m of label.customFonts ?? []) {
    const existing = byId.get(m.alias);
    byId.set(m.alias, {
      id: m.alias,
      builtin: existing?.builtin ?? false,
      path: m.path,
      previewFontName: m.previewFontName,
    });
  }
  return [...byId.values()];
}
