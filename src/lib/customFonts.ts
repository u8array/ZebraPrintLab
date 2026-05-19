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
