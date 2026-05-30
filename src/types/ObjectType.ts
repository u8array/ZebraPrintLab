import type React from 'react';
import { z } from 'zod';
import type { Variable } from './Variable';

/** A single font mapping. Three row shapes are supported so the editor
 *  can stay 1:1 with what the printer renders:
 *
 *  1. **Printer-resident custom font** — `path` set, optional
 *     `previewFontName`. Emits `^CW{alias},{path}` so the printer
 *     resolves `^A{alias}` against the path. With `previewFontName`
 *     also set the canvas renders that TTF; with `embedInZpl` true the
 *     TTF bytes ship in the ZPL stream via `~DY`.
 *  2. **Built-in font preview binding** — alias is one of `0` / `A-H`
 *     (the fonts every Zebra printer ships with), `path` left empty,
 *     `previewFontName` points at an uploaded TTF. No `^CW` is emitted;
 *     the binding is cosmetic so the canvas can show what the built-in
 *     glyphs actually look like.
 *  3. **Manual printer-resident font** — `path` set, no upload. User
 *     declares "this alias maps to a file already on the printer";
 *     canvas falls back to PrintLab ZPL because it has no bytes.
 *
 *  Both `path` and `previewFontName` allow empty strings: while the user
 *  is editing a fresh row the value may transiently be blank, and we
 *  want that state to survive a persist/rehydrate round-trip so the
 *  reload lands on the same row instead of dropping it. Completeness
 *  ("at least one of the two is non-empty") is enforced at emit time
 *  via the existing `if (m.alias && m.path)` guards in zplGenerator —
 *  not as a schema-level refine, because the schema fronts the
 *  persisted store and the store has to allow in-progress edits. */
export const customFontMappingSchema = z
  .object({
    alias: z.string().regex(/^[A-Z0-9]$/),
    path: z.string().optional(),
    previewFontName: z.string().optional(),
    embedInZpl: z.boolean().optional(),
  })
  .refine((m) => !m.embedInZpl || (!!m.path && !!m.previewFontName), {
    message:
      "embedInZpl requires both a printer path (~DY target) and a preview TTF (~DY bytes)",
  });
export type CustomFontMapping = z.infer<typeof customFontMappingSchema>;

/** Source-of-truth value lists for the per-label printer-config
 *  enums. Exported separately so the registry / UI / parser all
 *  iterate the same array instead of inlining the literals (and
 *  drifting when the spec grows). The Zod schema below uses them
 *  via `z.enum(...)`. */
export const MEDIA_TRACKING_VALUES = ['N', 'Y', 'W', 'M', 'A'] as const;
export type MediaTracking = (typeof MEDIA_TRACKING_VALUES)[number];

/** ^MF feed-action modes. F=Feed, C=Calibration, L=Length, N=No
 *  motion, S=Short calibration. */
export const MEDIA_FEED_VALUES = ['F', 'C', 'L', 'N', 'S'] as const;
export type MediaFeedMode = (typeof MEDIA_FEED_VALUES)[number];

/** Factory for runtime type guards from a tuple of literal string
 *  values (typically one of the `*_VALUES` arrays above). Lets the
 *  parser and UI share a single discriminator function per enum
 *  instead of each site rewriting `values.includes(v)` plus the
 *  `as readonly string[]` cast. */
export function makeEnumGuard<T extends string>(values: readonly T[]): (v: string) => v is T {
  const set: ReadonlySet<string> = new Set(values);
  return (v): v is T => set.has(v);
}

export const isMediaTracking = makeEnumGuard(MEDIA_TRACKING_VALUES);
export const isMediaFeedMode = makeEnumGuard(MEDIA_FEED_VALUES);

/** ^MM print mode (per-label cut/peel/tear behaviour). */
export const MEDIA_MODE_VALUES = ['T', 'V', 'D', 'K'] as const;
export type MediaMode = (typeof MEDIA_MODE_VALUES)[number];
export const isMediaMode = makeEnumGuard(MEDIA_MODE_VALUES);

/** ^MT media type. T=thermal transfer, D=direct thermal. */
export const MEDIA_TYPE_VALUES = ['T', 'D'] as const;
export type MediaType = (typeof MEDIA_TYPE_VALUES)[number];
export const isMediaType = makeEnumGuard(MEDIA_TYPE_VALUES);

/** ^PO print orientation. N=normal, I=inverted (180°). */
export const PRINT_ORIENTATION_VALUES = ['N', 'I'] as const;
export type PrintOrientation = (typeof PRINT_ORIENTATION_VALUES)[number];
export const isPrintOrientation = makeEnumGuard(PRINT_ORIENTATION_VALUES);

/** ^ST real-time clock value, as the HTML5 `datetime-local` string
 *  shape (`YYYY-MM-DDTHH:MM` or with `:SS`). Single source of truth
 *  for both the labelConfig Zod schema and the `realtimeClock`
 *  parse/format helper in `src/lib/`. */
export const realtimeClockIsoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** ^KN printer-name length cap per Zebra spec (16 characters). */
export const PRINTER_NAME_MAX_LEN = 16;

/** Character class of "dangerous" chars in Setup-Script free-string
 *  positionals. Includes the ZPL command-introducer chars (`^`, `~`),
 *  the positional delimiter `,` (would silently split into multiple
 *  fields on round-trip), newlines, and control codes. Defined once
 *  here so both the schema-side anchored regex and the parser-side
 *  unanchored check derive from the same source — adding a char
 *  cannot drift between them. */
// String-based char class (passed to `new RegExp`), so the
// `no-control-regex` rule (which inspects regex literals) does
// not fire here — the intent (blocking control chars to prevent
// ZPL injection) is the same as for a literal.
const SETUP_SCRIPT_UNSAFE_CHARS = '\\^~,\\r\\n\\x00-\\x1f';
/** Anchored, positive form for `z.string().regex(...)` schema checks. */
export const setupScriptSafeStringRegex = new RegExp(`^[^${SETUP_SCRIPT_UNSAFE_CHARS}]+$`);
/** Unanchored, negative form for parser-side dropping (the parser
 *  writes into the store without re-running the schema). */
export const setupScriptUnsafeCharRegex = new RegExp(`[${SETUP_SCRIPT_UNSAFE_CHARS}]`);

/** ^KL printer locale — sets the language used for printer-side
 *  display strings (front-panel menus, status messages). Per the
 *  ZPL II spec the documented codes are the two-letter ISO 639-1
 *  shorthands for the languages Zebra ships translations for. Older
 *  firmware also accepts numeric codes for the same set; those are
 *  not exposed here because the alpha codes round-trip cleanly and
 *  are unambiguous. */
export const PRINTER_LOCALE_VALUES = [
  'EN', 'ES', 'FR', 'DE', 'IT', 'NO', 'PT', 'SV', 'DK', 'SP2', 'NL', 'FI', 'JP', 'KR', 'SC', 'TC', 'RU', 'PL', 'CZ', 'RO', 'HU',
] as const;
export type PrinterLocale = (typeof PRINTER_LOCALE_VALUES)[number];
export const isPrinterLocale = makeEnumGuard(PRINTER_LOCALE_VALUES);

/** ^SZ ZPL mode selector. `2` = ZPL II (the default on every
 *  modern firmware), `1` = legacy ZPL. The editor always emits
 *  ZPL II syntax, so flipping `1` here only makes sense on a
 *  printer that needs the legacy interpretation. */
export const ZPL_MODE_VALUES = ['1', '2'] as const;
export type ZplMode = (typeof ZPL_MODE_VALUES)[number];
export const isZplMode = makeEnumGuard(ZPL_MODE_VALUES);

/** ^SL clock mode selector. The mode slot accepts three distinct
 *  value shapes per spec (`S`, `T`, or numeric 1..999), so the
 *  enum carries three symbolic values and a sibling field
 *  (`clockTolerance`) holds the numeric tolerance only when the
 *  mode is `TOL`. Generator/parser fold the three shapes back
 *  into the single positional slot at emit/parse time.
 *
 *    S    = Start-Time mode — stamp captured when ^XA arrives
 *    T    = Time-Now mode — stamp captured at queue dequeue
 *    TOL  = Time-Now with tolerance window in seconds (emit as
 *           the numeric value 1..999 in the mode slot) */
export const CLOCK_MODE_VALUES = ['S', 'T', 'TOL'] as const;
export type ClockMode = (typeof CLOCK_MODE_VALUES)[number];
export const isClockMode = makeEnumGuard(CLOCK_MODE_VALUES);

/** ^SL tolerance (seconds) when `clockMode === 'TOL'`. */
export const CLOCK_TOLERANCE_RANGE = { min: 1, max: 999 } as const;
/** UX default seeded into the store the moment the user picks the TOL
 *  mode in the modal — paired with the schema's "TOL requires a
 *  tolerance value" cross-field rule so the field cannot land in the
 *  half-set state. The 60s value matches the official `^SL60,1`
 *  Zebra example. */
export const CLOCK_TOLERANCE_DEFAULT = 60;

/** ^SL clock-language codes. Numeric 1..13 per spec; we store the
 *  digit chars to match the on-wire shape. The set overlaps with
 *  `PRINTER_LOCALE_VALUES` conceptually (same languages, different
 *  code systems) but Zebra documents them separately — each enum
 *  gets its own label keys so future divergence (e.g. ^KL adding
 *  Korean while ^SL still tops out at Japanese) does not silently
 *  mis-render. */
export const CLOCK_LANGUAGE_VALUES = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
] as const;
export type ClockLanguage = (typeof CLOCK_LANGUAGE_VALUES)[number];
export const isClockLanguage = makeEnumGuard(CLOCK_LANGUAGE_VALUES);

/** ^KD clock-print format selector. Drives how ^FC clock fields render
 *  on the printed label.
 *    0 = no display (default, clock field disabled)
 *    1 = MM/DD/YY (24-hour) HH:MM:SS
 *    2 = MM/DD/YY (12-hour) HH:MM:SS (with AM/PM)
 *    3 = DD/MM/YY (24-hour) HH:MM:SS */
export const CLOCK_FORMAT_VALUES = ['0', '1', '2', '3'] as const;
export type ClockFormat = (typeof CLOCK_FORMAT_VALUES)[number];
export const isClockFormat = makeEnumGuard(CLOCK_FORMAT_VALUES);

/** Numeric ranges shared between Zod schema, parser clamps and UI
 *  bounded inputs. Single source of truth so a Zebra-firmware spec
 *  tweak only has to land here. Declared before `labelConfigSchema`
 *  so the schema's `.min()/.max()` calls can read them at module
 *  load time without a TDZ trap. */
export const SPEED_RANGE = { min: 2, max: 14 } as const;
export const DARKNESS_PERMANENT_RANGE = { min: -30, max: 30 } as const;
export const DARKNESS_INSTANT_RANGE = { min: 0, max: 30 } as const;
export const HEAD_TEST_INTERVAL_RANGE = { min: 0, max: 10000 } as const;
export const TEAR_OFF_ADJUST_RANGE = { min: -120, max: 120 } as const;
/** ^ML: maximum label length, in dots. Zebra spec accepts 1..32000. */
export const MAX_LABEL_LENGTH_RANGE = { min: 1, max: 32000 } as const;

/** Tiny adapter that applies a `*_RANGE` constant to a zod integer
 *  chain. Collapses the repetitive `.int().min(R.min).max(R.max)`
 *  shape so a range bump only changes the `*_RANGE` constant and
 *  every consumer (schema, parser, UI) tracks automatically. */
export function intInRange(r: { min: number; max: number }) {
  return z.number().int().min(r.min).max(r.max);
}

export const labelConfigSchema = z.object({
  widthMm: z.number(),
  heightMm: z.number(),
  dpmm: z.number(),
  printQuantity: z.number().optional(),
  /** ^PQ p2: pause every N labels (0 = none). */
  pauseCount: z.number().int().min(0).max(99999999).optional(),
  /** ^PQ p3: replicates of each serialised label. */
  replicates: z.number().int().min(0).max(99999999).optional(),
  /** ^PQ p4: override pause count (cutter behaviour). */
  overridePauseCount: z.enum(['Y', 'N']).optional(),
  mediaMode: z.enum(MEDIA_MODE_VALUES).optional(),
  labelShift: z.number().optional(),
  /** ^LH x: horizontal origin offset emitted at export. Field FOs are
   *  shifted accordingly so the on-screen layout equals the print result. */
  labelHomeX: z.number().int().min(0).optional(),
  /** ^LH y: vertical origin offset emitted at export. See labelHomeX. */
  labelHomeY: z.number().int().min(0).optional(),
  /** ^LT y: label top shift emitted at export. Same compensation semantics
   *  as labelHomeY. Zebra supports -120..+120. */
  labelTop: z.number().int().min(-120).max(120).optional(),
  printSpeed: intInRange(SPEED_RANGE).optional(),
  /** ^PR p2: slew (inter-label) speed. */
  slewSpeed: intInRange(SPEED_RANGE).optional(),
  /** ^PR p3: backfeed speed. */
  backfeedSpeed: intInRange(SPEED_RANGE).optional(),
  darkness: intInRange(DARKNESS_PERMANENT_RANGE).optional(),
  /** ~SD: instant darkness set, emitted before ^XA. 0-30. */
  instantDarkness: intInRange(DARKNESS_INSTANT_RANGE).optional(),
  mediaType: z.enum(MEDIA_TYPE_VALUES).optional(),
  printOrientation: z.enum(PRINT_ORIENTATION_VALUES).optional(),
  /** ^PM: mirror image (left/right flip). */
  mirror: z.enum(['Y', 'N']).optional(),
  defaultFontId: z.string().min(1).optional(),
  defaultFontHeight: z.number().int().positive().optional(),
  /** ^CF width param. Spec allows 0 → printer auto-derives from height. */
  defaultFontWidth: z.number().int().min(0).optional(),
  /** ^CW alias→path mappings emitted at the top of the label. Each entry
   *  registers a single-char identifier ([A-Z0-9]) that ^A{alias} fields
   *  can reference instead of the verbose ^A@…E:font.TTF form. */
  customFonts: z.array(customFontMappingSchema).optional(),
  /** ^MN: media tracking. N continuous, Y non-continuous web/gap, W web
   *  sensing, M mark sensing, A auto-detect web. Param 2 (black-mark
   *  offset for W/M) intentionally not modelled. Printer-default
   *  covers the typical setup. */
  mediaTracking: z.enum(MEDIA_TRACKING_VALUES).optional(),
  /** ^ML: maximum label length, in dots. Printer-side upper bound used
   *  during media calibration; defaults to printer hardware max. */
  maxLabelLength: intInRange(MAX_LABEL_LENGTH_RANGE).optional(),
  /** ^MF p1: feed action at power-up. */
  mediaFeedPowerUp: z.enum(MEDIA_FEED_VALUES).optional(),
  /** ^MF p2: feed action after head-close (same enum). */
  mediaFeedHeadClose: z.enum(MEDIA_FEED_VALUES).optional(),
  /** ^XB: suppress backfeed for the next label. Standalone toggle.
   *  Command emits without parameters when active. */
  suppressBackfeed: z.boolean().optional(),
});

// Note: the EEPROM-persistent printer-state fields (^JZ, ^JT, ~TA,
// ^ST, ^KD, ^SL, ^KL, ^SE, ^SZ, ^KN) used to live here but moved to
// `PrinterProfile` so design files no longer leak per-installation
// state. See src/types/PrinterProfile.ts.

export type LabelConfig = z.infer<typeof labelConfigSchema>;

/** Common fields shared by every label object, without the typed `props`. */
export const labelObjectBaseSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  /** 'FT' = field typeset (baseline), 'FO' = field origin (top-left). Defaults to 'FO'. */
  positionType: z.enum(['FO', 'FT']).optional(),
  /** Emitted as ^FX before this field in ZPL output. Carries no print output. */
  comment: z.string().optional(),
  /** When true, blocks position/size/prop edits, drag, resize and deletion.
   *  Editor still allows selection and toggling of locked/visible/includeInExport
   *  themselves so the lock can be released. Persisted; not exported to ZPL. */
  locked: z.boolean().optional(),
  /** When false, the object is omitted from the canvas render. Distinct from
   *  includeInExport so a designer can hide reference geometry while still
   *  shipping it. Defaults to true. */
  visible: z.boolean().optional(),
  /** When false, the object is skipped during ZPL generation. Distinct from
   *  visible so a designer can preview placement without shipping. Defaults
   *  to true. */
  includeInExport: z.boolean().optional(),
  /** Optional user-supplied label. Used by groups so the layers panel and
   *  properties panel can show "Header" instead of the generic "Group".
   *  Leaves currently fall back to their registry label; the field lives
   *  on the base so naming leaves later is a UI-only change. */
  name: z.string().optional(),
  /** When set, the field's render/export content comes from the referenced
   *  Variable's defaultValue (or future data source). The field's own
   *  content prop is kept as fallback when the binding is removed.
   *  Exported as `^FN{n}^FD{default}^FS` instead of plain `^FD{content}^FS`. */
  variableId: z.string().optional(),
});

export type LabelObjectBase = z.infer<typeof labelObjectBaseSchema>;

export type ObjectChanges = Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object };

export type ObjectGroup = 'text' | 'code-1d' | 'code-2d' | 'code-postal' | 'shape';

export interface TransformContext {
  /** Konva scaleX from the transform end. */
  sx: number;
  /** Konva scaleY from the transform end. */
  sy: number;
  /** Snaps a value to the user's grid (identity when snap is disabled). */
  snap: (n: number) => number;
  /** Konva node's intrinsic height after scale was reset. Only meaningful for stacked 2D. */
  nodeHeight: number;
  /** Captured at drag start; non-null only for stacked 2D barcodes. */
  anchor: { nodeHeight: number; rowHeight: number } | null;
}

/** Context passed to `toZPL` so leaf emit functions can reach
 *  label-wide state (default font ID, ^CW alias map, variables, etc.).
 *  Optional — most types ignore it; text/serial use it for the default
 *  font fallback, text/barcode emitters consult `variables` when an
 *  object's `variableId` is set. Tests calling `toZPL` directly can omit
 *  `ctx` and get the no-binding / no-default-context branches. */
export interface ZplEmitContext {
  label: LabelConfig;
  /** Document-level variables. When a field carries `variableId` pointing
   *  at one of these, the emitter writes `^FN{n}^FD{default}^FS` so the
   *  printer treats the field as a template slot. Absent / empty: every
   *  field emits its own literal content. */
  variables?: readonly Variable[];
  /** ^FE embed delimiter active for the current label. Defaults to `#`
   *  (ZPL's own default). Set by the label-level emitter when it picks
   *  an alternate char to avoid colliding with literal payload text;
   *  per-leaf emitters consult it when translating `«name»` markers
   *  back to `#n#` embed syntax. */
  embedChar?: string;
  /** ^FC clock chars active for the current label. Defaults to
   *  `% { #`; the label-level emitter picks an alternate triple when
   *  defaults clash with literal payload text. Per-leaf emitters
   *  consult it when translating `«clock:T»` markers back to
   *  `<char><T>` token syntax. Absent when no field carries clock
   *  markers — fdFieldFor leaves them literal in that case. */
  clockChars?: { date: string; time: string; tertiary: string };
}

/**
 * Per-type HRI (human-readable interpretation) rendering behaviour. All
 * fields are optional with sensible defaults: text is rendered below the
 * bars in raw form with the standard textGap. Each leaf overrides only
 * what differs from the baseline, keeping BarcodeObject type-agnostic
 * for the generic HRI path.
 *
 * @example See registry/logmars.tsx (text above + wider gap + check digit
 * formatter) and registry/upcEanExtension.tsx (text above + very tight gap)
 * for the canonical patterns.
 */
export interface HriBehavior {
  /** True when the HRI text sits above the bars (logmars spec, ^BS).
   *  Default: false. */
  textAbove?: boolean;
  /** Gap in dots between the bar edge and the text glyph. Applies to
   *  both the upright above-bars gap AND the side gap on rotated
   *  R/B/I, so a tighter ^BS (2) stays tight after rotation while
   *  logmars (10) keeps its wider air gap. Below-bars upright always
   *  uses the global textGap regardless of this value. */
  aboveGapDots?: number;
  /** Transform raw content into the displayed HRI string (add check
   *  digit, wrap with start/stop chars, pad, …). Default: identity. */
  formatHri?: (content: string) => string;
}

export interface ObjectTypeDefinition<P extends object = object> {
  label: string;
  icon: string;
  group: ObjectGroup;
  defaultProps: P;
  /** Default footprint at palette-drop time. Two shapes:
   *    `{ width, height }`       in dots (most types: an editor
   *                              default chosen for visual size,
   *                              not a spec quantity)
   *    `{ widthMm, heightMm }`   in millimetres (spec-fixed
   *                              physical-size types like Maxicode,
   *                              where the printed footprint is set
   *                              by the symbology spec regardless
   *                              of dpmm)
   *  The palette resolves the active variant against the current
   *  label's dpmm so centring works at any resolution. */
  defaultSize:
    | { width: number; height: number }
    | { widthMm: number; heightMm: number };
  /**
   * True if the rendered height is fixed by the symbology spec rather than the
   * `height` prop (e.g. GS1 Databar Omnidirectional). The transformer disables
   * its height anchors and the properties panel renders the height input as
   * read-only — both reflect that the value cannot influence the print output.
   */
  heightLocked?: boolean;
  /**
   * True if the symbology has no human-readable interpretation in ZPL output
   * (e.g. GS1 Databar — `^BR` exposes no HRI parameter and Labelary never
   * renders text). The properties panel hides the checkbox and the canvas
   * renderer suppresses the text so the designer matches the print output.
   */
  interpretationLocked?: boolean;
  /**
   * True when the type emits a ^FD content block via `fdFieldFor` and can
   * therefore be bound to a Variable. The Properties panel uses this to
   * decide whether to render the bind-to-variable control. Mirrors which
   * registry modules actually wire fdFieldFor in their toZPL — keep them
   * in sync.
   */
  bindable?: boolean;
  /**
   * Marks types whose resize must keep a 1:1 aspect ratio. The transformer
   * restricts to corner anchors and forces the resize bbox to stay square,
   * so visual feedback during drag matches the uniform `commitTransform`
   * applied on release. A predicate form supports per-instance opt-in
   * (e.g. ellipse with `lockAspect: true`); `true` applies to every
   * instance of the type (e.g. QR / DataMatrix).
   */
  uniformScale?: boolean | ((props: P) => boolean);
  toZPL: (obj: LabelObjectBase & { props: P }, ctx?: ZplEmitContext) => string;
  /**
   * Optional hook to enforce type-specific invariants on incoming changes
   * (e.g. clamp out-of-range coordinates). Called before changes are merged
   * into the object. Pure function — should not have side effects.
   */
  normalizeChanges?: (
    obj: LabelObjectBase & { props: P },
    changes: ObjectChanges,
  ) => ObjectChanges;
  /**
   * Optional. Converts a Konva Transformer scale operation into prop changes
   * specific to this object type. Called on transform end. If absent, the
   * object's position is still updated but its size/scale props stay unchanged.
   * Pure function — should not have side effects.
   */
  commitTransform?: (
    obj: LabelObjectBase & { props: P },
    ctx: TransformContext,
  ) => Partial<P>;
  /** See {@link HriBehavior}. Only meaningful for 1D barcode types
   *  that render an HRI text overlay; other types should leave this
   *  undefined. */
  hri?: HriBehavior;
  PropertiesPanel: React.ComponentType<{
    obj: LabelObjectBase & { props: P };
    onChange: (props: Partial<P>) => void;
  }>;
}
