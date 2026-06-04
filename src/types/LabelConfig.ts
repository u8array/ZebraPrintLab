import { z } from 'zod';
import { intInRange, makeEnumGuard } from './typeHelpers';

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
 *  iterate the same array instead of inlining the literals. */
export const MEDIA_TRACKING_VALUES = ['N', 'Y', 'W', 'M', 'A'] as const;
export type MediaTracking = (typeof MEDIA_TRACKING_VALUES)[number];

/** ^MF feed-action modes. F=Feed, C=Calibration, L=Length, N=No
 *  motion, S=Short calibration. */
export const MEDIA_FEED_VALUES = ['F', 'C', 'L', 'N', 'S'] as const;
export type MediaFeedMode = (typeof MEDIA_FEED_VALUES)[number];

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

/** Numeric ranges shared between Zod schema, parser clamps and UI inputs. */
export const SPEED_RANGE = { min: 2, max: 14 } as const;
export const DARKNESS_PERMANENT_RANGE = { min: -30, max: 30 } as const;
export const DARKNESS_INSTANT_RANGE = { min: 0, max: 30 } as const;
/** ^ML: maximum label length, in dots. Zebra spec accepts 1..32000. */
export const MAX_LABEL_LENGTH_RANGE = { min: 1, max: 32000 } as const;

/** ^MU b,c accepted dpi values. 200 is Zebra's token for 203-dpi
 *  printers; only the b/c ratio drives resampling. */
export const MU_DPI_VALUES = [150, 200, 300, 600] as const;
export type MuDpi = (typeof MU_DPI_VALUES)[number];
export const isMuDpi = (n: number): n is MuDpi =>
  (MU_DPI_VALUES as readonly number[]).includes(n);
const muDpiSchema = z.number().refine(isMuDpi);

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
  /** ^CW alias→path mappings emitted at the top of the label. */
  customFonts: z.array(customFontMappingSchema).optional(),
  /** ^MN: media tracking. */
  mediaTracking: z.enum(MEDIA_TRACKING_VALUES).optional(),
  /** ^ML: maximum label length, in dots. */
  maxLabelLength: intInRange(MAX_LABEL_LENGTH_RANGE).optional(),
  /** ^MF p1: feed action at power-up. */
  mediaFeedPowerUp: z.enum(MEDIA_FEED_VALUES).optional(),
  /** ^MF p2: feed action after head-close (same enum). */
  mediaFeedHeadClose: z.enum(MEDIA_FEED_VALUES).optional(),
  /** ^XB: suppress backfeed for the next label. Standalone toggle. */
  suppressBackfeed: z.boolean().optional(),
  /** ^MU b: format base dpi paired with outputDpi for printer-side resampling. */
  formatDpi: muDpiSchema.optional(),
  /** ^MU c: target output dpi. Paired with formatDpi. */
  outputDpi: muDpiSchema.optional(),
});

export type LabelConfig = z.infer<typeof labelConfigSchema>;
