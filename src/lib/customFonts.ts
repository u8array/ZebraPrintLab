import type { CustomFontMapping, LabelConfig } from "../types/LabelConfig";
/** Strip-pattern; schema's regex `/^[A-Z0-9]$/` is the inverse. */
export const ALIAS_CHAR_RE = /[^A-Z0-9]/g;

export const DEFAULT_FONT_DRIVE = "E:";

/** E=flash, R=RAM, A=removable, B=on-board flash. */
export const ZPL_DRIVE_PREFIXES = ["E:", "R:", "A:", "B:"] as const;

/** Firmware built-ins; excluded from nextFreeAlias auto-pick range. */
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

export function uploadedFontPath(name: string): string {
  return `${DEFAULT_FONT_DRIVE}${name}`;
}

export function stripDrivePrefix(path: string): string {
  return path.replace(/^[A-Z]:/, "");
}

/** First valid ^CW char, or empty when none present. */
export function normalizeAlias(raw: string): string {
  return raw.toUpperCase().replace(ALIAS_CHAR_RE, "").slice(0, 1);
}

/** Empty alias removes; new entries appended. */
export function upsertCustomFontMapping(
  list: readonly CustomFontMapping[] | undefined,
  path: string,
  alias: string,
): CustomFontMapping[] {
  const withoutPath = (list ?? []).filter((m) => m.path !== path);
  if (!alias) return withoutPath;
  return [...withoutPath, { alias, path }];
}

export const ZPL_BUILTIN_FONT_LETTERS = '0ABCDEFGH';
const ALIAS_PREFERRED_ORDER = 'IJKLMNOPQRSTUVWXYZ123456789';

/** Length guard: `String.includes("")` is true, so a blank would trip every branch. */
export function isBuiltinFontId(alias: string): boolean {
  return alias.length === 1 && ZPL_BUILTIN_FONT_LETTERS.includes(alias);
}

/** Canvas-only preview TTF name; emit/parse ignore this resolver. */
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

export function resolveDefaultPrinterFontName(
  label: Pick<LabelConfig, "defaultFontId" | "customFonts">,
): string | undefined {
  return resolvePreviewFontName(label, label.defaultFontId);
}

/** Built-ins tried last (overriding them is deliberate); '' when all 36 used. */
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
  id: string;
  builtin: boolean;
  path?: string;
  previewFontName?: string;
}

/** Built-ins (0, A-H) plus customFonts aliases; collisions override the built-in row. */
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
