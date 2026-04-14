import { z } from "zod";
import { labelConfigSchema, labelObjectBaseSchema, type LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";
import { ok, err, type Result } from "./result";

export type DesignFileError = "parse_error" | "invalid_schema";
export interface DesignFile { label: LabelConfig; objects: LabelObject[] }

const designFileSchema = z.object({
  label: labelConfigSchema,
  objects: z.array(labelObjectBaseSchema.extend({ props: z.record(z.string(), z.unknown()) })),
});

export function parseDesignFile(text: string): Result<DesignFile, DesignFileError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err("parse_error");
  }
  const result = designFileSchema.safeParse(json);
  if (!result.success) return err("invalid_schema");
  // props are validated structurally; cast to LabelObject[] is safe
  // because the registry handles unknown prop shapes at runtime
  return ok(result.data as DesignFile);
}

export function serializeDesign(label: LabelConfig, objects: LabelObject[]): string {
  return JSON.stringify({ label, objects }, null, 2);
}

export const designFileErrors: Record<DesignFileError, string> = {
  parse_error: "Could not read the file. Make sure it is a valid JSON design file.",
  invalid_schema: "The file does not contain a valid label design.",
};
