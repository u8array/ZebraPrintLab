import { z } from "zod";
import { labelConfigSchema, type LabelConfig } from "../types/LabelConfig";
import { labelObjectBaseSchema } from "../types/LabelObject";
import {
  variableSchema,
  csvMappingSchema,
  type Variable,
  type CsvMapping,
} from "../types/Variable";
import type { LabelObject } from "../types/Group";
import { blockOverlaySchema, type BlockOverlay } from "./zplOverlay/overlay";
import { visitLeavesInPages } from "./objectTree";
import { insertReverseBackingBoxes, pageNeedsReverseBacking } from "./reverseBacking";
import { ok, err, type Result } from "./result";

/** Current design-file schema version. Bump when the persisted shape
 *  changes in a way an older app cannot read. Add a vN schema +
 *  migrator below and dispatch on `schemaVersion` in `parseDesignFile`.
 *  The persist middleware in `labelStore` has its own independent
 *  version for localStorage state; do not conflate. */
export const CURRENT_DESIGN_SCHEMA_VERSION = 2;

export type DesignFileError = "parse_error" | "invalid_schema";
export interface DesignFilePage { objects: LabelObject[]; overlay?: BlockOverlay }
export interface DesignFile {
  label: LabelConfig;
  pages: DesignFilePage[];
  variables: Variable[];
  /** Optional: present only when the user has imported a CSV and set
   *  up a mapping for the current design. Round-trips with the design;
   *  rows themselves are session-only and not part of the save. */
  csvMapping: CsvMapping | null;
}

// Two distinct shapes share the base fields:
//   * leaves carry `props` and have no `children`,
//   * groups carry `children` and have no `props` (their `type` is 'group').
// Split into separate schemas so a leaf missing its `props` or a group
// missing its `children` fails validation. `groupSchema` is wrapped in
// z.lazy so the recursion through `labelObjectSchema` resolves.
const leafSchema = labelObjectBaseSchema.extend({
  type: z.string().refine((t) => t !== 'group', {
    message: "Leaf objects cannot have type 'group'",
  }),
  props: z.record(z.string(), z.unknown()),
});

const groupSchema: z.ZodType<unknown> = z.lazy(() =>
  labelObjectBaseSchema.extend({
    type: z.literal('group'),
    children: z.array(labelObjectSchema),
  }),
);

const labelObjectSchema: z.ZodType<unknown> = z.union([groupSchema, leafSchema]);

// A persisted overlay that fails its invariant drops to undefined (the page
// regenerates) rather than failing the whole design load.
const pageSchema = z.object({
  objects: z.array(labelObjectSchema),
  overlay: blockOverlaySchema.optional().catch(undefined),
});

const designFileSchema = z.object({
  schemaVersion: z.literal(2),
  label: labelConfigSchema,
  pages: z.array(pageSchema),
  variables: z.array(variableSchema).optional(),
  csvMapping: csvMappingSchema.optional(),
});

export function parseDesignFile(text: string): Result<DesignFile, DesignFileError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err("parse_error");
  }

  migrateGs1databarModuleWidth(json);
  migrateReverseTextBackground(json);

  const parsed = designFileSchema.safeParse(json);
  if (parsed.success) {
    return ok({
      label: parsed.data.label,
      pages: parsed.data.pages as unknown as DesignFilePage[],
      variables: parsed.data.variables ?? [],
      csvMapping: parsed.data.csvMapping ?? null,
    });
  }

  return err("invalid_schema");
}

/** v1→v2: reverse text dropped its synthesized self-background ^GB for a
 *  spec-true ^FR knockout, so give every legacy reverse text a real black box
 *  behind it. Gated on the file version so a v2 file (box already present)
 *  isn't double-boxed. Stamps schemaVersion to 2. */
function migrateReverseTextBackground(json: unknown): void {
  if (!json || typeof json !== "object") return;
  const j = json as Record<string, unknown>;
  // Only an explicit v1 file is migrated; a missing/other version stays as-is so
  // the schema below still rejects malformed input.
  if (j.schemaVersion !== 1) return;
  const label = j.label as Pick<LabelConfig, "customFonts" | "defaultFontId"> | undefined;
  if (Array.isArray(j.pages)) {
    j.pages = j.pages.map((pg) => {
      const p = pg && typeof pg === "object" ? (pg as Record<string, unknown>) : {};
      if (!Array.isArray(p.objects)) return p;
      const objects = p.objects as LabelObject[];
      // Inserting a model object the overlay doesn't link would force a full
      // regeneration on export and lose the overlay's preserved bytes; drop the
      // overlay on a touched page so it regenerates cleanly from the new model.
      const next: Record<string, unknown> = {
        ...p,
        objects: insertReverseBackingBoxes(objects, label),
      };
      if (pageNeedsReverseBacking(objects, label)) delete next.overlay;
      return next;
    });
  }
  j.schemaVersion = 2;
}

/** Rename gs1databar `props.moduleWidth` → `props.magnification` on
 *  legacy design files. Mirrors the persist-store v5→v6 hop in
 *  `labelStore.ts`. Idempotent. */
function migrateGs1databarModuleWidth(json: unknown): void {
  if (!json || typeof json !== "object") return;
  const pages = (json as { pages?: unknown }).pages;
  visitLeavesInPages(pages, (leaf) => {
    if (
      leaf.type === "gs1databar" &&
      leaf.props &&
      typeof leaf.props === "object" &&
      "moduleWidth" in leaf.props &&
      !("magnification" in leaf.props)
    ) {
      const props = leaf.props as Record<string, unknown>;
      props.magnification = props.moduleWidth;
      delete props.moduleWidth;
    }
  });
}

interface SerializedDesign {
  schemaVersion: number;
  label: LabelConfig;
  pages: DesignFilePage[];
  variables?: Variable[];
  csvMapping?: CsvMapping;
}

export function serializeDesign(
  label: LabelConfig,
  pages: DesignFilePage[],
  variables: Variable[] = [],
  csvMapping: CsvMapping | null = null,
): string {
  const payload: SerializedDesign = {
    schemaVersion: CURRENT_DESIGN_SCHEMA_VERSION,
    label,
    pages,
  };
  if (variables.length > 0) payload.variables = variables;
  if (csvMapping) payload.csvMapping = csvMapping;
  return JSON.stringify(payload, null, 2);
}

export const designFileErrors: Record<DesignFileError, string> = {
  parse_error: "Could not read the file. Make sure it is a valid JSON design file.",
  invalid_schema: "The file does not contain a valid label design.",
};
