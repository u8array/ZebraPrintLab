import { parseZPL, type ImportReport } from "./zplParser";
import type { LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";

export interface ZplImportResult {
  labelConfig: Partial<LabelConfig>;
  objects: LabelObject[];
  report: ImportReport;
  notice: string;
}

export function importZplText(zpl: string, dpmm: number): ZplImportResult {
  const { labelConfig, objects, importReport } = parseZPL(zpl, dpmm);

  const parts: string[] = [
    `Editable reconstruction — ${objects.length} object${objects.length !== 1 ? "s" : ""} imported.`,
  ];
  if (importReport.partial.length > 0) {
    parts.push(`Font face not preserved (${importReport.partial.join(", ")}).`);
  }
  const skippedCount = importReport.browserLimit.length + importReport.unknown.length;
  if (skippedCount > 0) {
    parts.push(`${skippedCount} command${skippedCount !== 1 ? "s" : ""} skipped.`);
  }

  return { labelConfig, objects, report: importReport, notice: parts.join(" ") };
}
