import { z } from "zod";
import { labelConfigSchema, labelObjectBaseSchema, type LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";
import { ok, err, type Result } from "./result";

export type DesignFileError = "parse_error" | "invalid_schema";
export interface DesignFilePage { objects: LabelObject[] }
export interface DesignFile { label: LabelConfig; pages: DesignFilePage[] }

const labelObjectSchema = labelObjectBaseSchema.extend({
  props: z.record(z.string(), z.unknown()),
});

const pageSchema = z.object({ objects: z.array(labelObjectSchema) });

const designFileSchema = z.object({
  label: labelConfigSchema,
  pages: z.array(pageSchema),
});

const legacyDesignFileSchema = z.object({
  label: labelConfigSchema,
  objects: z.array(labelObjectSchema),
});

export function parseDesignFile(text: string): Result<DesignFile, DesignFileError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err("parse_error");
  }

  const current = designFileSchema.safeParse(json);
  if (current.success) {
    // LabelObject[] is a discriminated union with typed props; Zod cannot
    // verify them without per-type schemas, so the cast here is intentional.
    // The registry handles unknown prop shapes gracefully at runtime.
    return ok(current.data as unknown as DesignFile);
  }

  // Legacy: { label, objects } from before multi-page support.
  // Wrapped into a single page so older designs keep loading.
  const legacy = legacyDesignFileSchema.safeParse(json);
  if (legacy.success) {
    return ok({
      label: legacy.data.label,
      pages: [{ objects: legacy.data.objects as unknown as LabelObject[] }],
    });
  }

  return err("invalid_schema");
}

export function serializeDesign(label: LabelConfig, pages: DesignFilePage[]): string {
  return JSON.stringify({ label, pages }, null, 2);
}

export const designFileErrors: Record<DesignFileError, string> = {
  parse_error: "Could not read the file. Make sure it is a valid JSON design file.",
  invalid_schema: "The file does not contain a valid label design.",
};
