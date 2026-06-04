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
import { visitLeavesInPages } from "./objectTree";
import { ok, err, type Result } from "./result";

/** Current design-file schema version. Bump when the persisted shape
 *  changes in a way an older app cannot read. Add a vN schema +
 *  migrator below and dispatch on `schemaVersion` in `parseDesignFile`.
 *  The persist middleware in `labelStore` has its own independent
 *  version for localStorage state — do not conflate. */
export const CURRENT_DESIGN_SCHEMA_VERSION = 1;

export type DesignFileError = "parse_error" | "invalid_schema";
export interface DesignFilePage { objects: LabelObject[] }
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

const pageSchema = z.object({ objects: z.array(labelObjectSchema) });

const designFileV1Schema = z.object({
  schemaVersion: z.literal(1),
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

  const v1 = designFileV1Schema.safeParse(json);
  if (v1.success) {
    return ok({
      label: v1.data.label,
      pages: v1.data.pages as unknown as DesignFilePage[],
      variables: v1.data.variables ?? [],
      csvMapping: v1.data.csvMapping ?? null,
    });
  }

  return err("invalid_schema");
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
