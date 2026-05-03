import { parseZPL, type ImportReport } from "./zplParser";
import type { LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";

export interface ZplImportResult {
  labelConfig: Partial<LabelConfig>;
  pages: { objects: LabelObject[] }[];
  report: ImportReport;
  notice: string;
}

/**
 * Splits a ZPL stream into one block per `^XA...^XZ` document. Anything before
 * the first `^XA` is discarded. ZPL commands are case-insensitive per spec.
 */
function splitIntoLabelBlocks(zpl: string): string[] {
  // Capture group preserves the matched delimiter so mixed-case (^xa) survives.
  const parts = zpl.split(/(\^XA)/i).slice(1);
  const blocks: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    blocks.push(parts[i] + (parts[i + 1] ?? ''));
  }
  return blocks;
}

export function importZplText(zpl: string, dpmm: number): ZplImportResult {
  const blocks = splitIntoLabelBlocks(zpl);

  if (blocks.length === 0) {
    return {
      labelConfig: {},
      pages: [],
      report: { partial: [], browserLimit: [], unknown: [] },
      notice: 'No labels found in the ZPL code.',
    };
  }

  let labelConfig: Partial<LabelConfig> = {};
  const pages: { objects: LabelObject[] }[] = [];
  const partial: string[] = [];
  const browserLimit: string[] = [];
  const unknown: string[] = [];
  let dimensionsDiffered = false;

  blocks.forEach((block, i) => {
    const result = parseZPL(block, dpmm);
    pages.push({ objects: result.objects });
    if (i === 0) {
      labelConfig = result.labelConfig;
    } else {
      const cfg = result.labelConfig;
      if (
        (cfg.widthMm !== undefined && cfg.widthMm !== labelConfig.widthMm) ||
        (cfg.heightMm !== undefined && cfg.heightMm !== labelConfig.heightMm) ||
        (cfg.dpmm !== undefined && cfg.dpmm !== labelConfig.dpmm)
      ) {
        dimensionsDiffered = true;
      }
    }
    partial.push(...result.importReport.partial);
    browserLimit.push(...result.importReport.browserLimit);
    unknown.push(...result.importReport.unknown);
  });

  const report: ImportReport = {
    partial: [...new Set(partial)],
    browserLimit: [...new Set(browserLimit)],
    unknown: [...new Set(unknown)],
  };

  const objectCount = pages.reduce((s, p) => s + p.objects.length, 0);
  const notice = buildNotice(objectCount, pages.length, report, dimensionsDiffered);

  return { labelConfig, pages, report, notice };
}

function buildNotice(
  objectCount: number,
  pageCount: number,
  report: ImportReport,
  dimensionsDiffered: boolean,
): string {
  const parts: string[] = [];

  const objectsText = `${objectCount} object${objectCount !== 1 ? 's' : ''}`;
  if (pageCount > 1) {
    parts.push(`Editable reconstruction: ${objectsText} across ${pageCount} pages imported.`);
  } else {
    parts.push(`Editable reconstruction: ${objectsText} imported.`);
  }

  if (dimensionsDiffered) {
    parts.push(`Pages have different dimensions; using the first page's size.`);
  }

  if (report.partial.length > 0) {
    parts.push(`Font face not preserved (${report.partial.join(', ')}).`);
  }
  const skippedCount = report.browserLimit.length + report.unknown.length;
  if (skippedCount > 0) {
    parts.push(`${skippedCount} command${skippedCount !== 1 ? 's' : ''} skipped.`);
  }

  return parts.join(' ');
}
