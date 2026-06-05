import { parseZPL, type ImportFinding, type ImportFindingKind, type ImportReport } from "./zplParser";
import { pruneUndefined } from "./pruneUndefined";
import type { LabelConfig } from "../types/LabelConfig";
import type { PrinterProfile } from "../types/PrinterProfile";
import type { LabelObject } from "../types/Group";
import { uniqueVariableName, type Variable } from "../types/Variable";

export interface ZplImportResult {
  labelConfig: Partial<LabelConfig>;
  /** Setup-Script fields extracted from the import. Caller decides
   *  whether to overwrite the active printer profile (e.g. only when
   *  the user explicitly opts in); design imports should typically
   *  NOT auto-apply these so a shared `.zpl` can't silently
   *  reconfigure the user's printer. */
  printerProfile: Partial<PrinterProfile>;
  pages: { objects: LabelObject[] }[];
  variables: Variable[];
  report: ImportReport;
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
      printerProfile: {},
      pages: [],
      variables: [],
      report: { findings: [], partial: [], browserLimit: [], unknown: [] },
    };
  }

  let labelConfig: Partial<LabelConfig> = {};
  // Merge profile fields across blocks: later blocks' values win so a
  // multi-block ZPL with re-stated Setup-Script commands resolves to
  // the last-seen state (mirrors what the printer would actually end
  // up with after executing the stream).
  const printerProfile: Partial<PrinterProfile> = {};
  const pages: { objects: LabelObject[] }[] = [];
  const findings: ImportFinding[] = [];
  // Variables are document-level, but the parser reconstructs them per
  // block. Merge across blocks by fnNumber (same slot used on multiple
  // pages → one Variable) and rewire later blocks' object references
  // onto the first block's Variable so the binding survives the merge.
  const variables: Variable[] = [];
  const variablesByFn = new Map<number, Variable>();

  blocks.forEach((block, i) => {
    const result = parseZPL(block, dpmm);
    const idRemap = new Map<string, string>();
    for (const v of result.variables) {
      const existing = variablesByFn.get(v.fnNumber);
      if (existing) {
        idRemap.set(v.id, existing.id);
      } else {
        // New fnNumber: keep the entry but disambiguate the name if a
        // prior block has the same (e.g. two `field_1` derived from
        // different blocks). No id remap, since the spread reuses v.id and
        // the block's objects already reference that id.
        const kept: Variable = { ...v, name: uniqueVariableName(v.name, variables) };
        variables.push(kept);
        variablesByFn.set(kept.fnNumber, kept);
      }
    }
    // Apply id remap to this block's objects so their `variableId`
    // points at the merged Variable rather than the orphaned per-block
    // entry. Defensive walk into groups; the parser does not produce
    // groups, but the helper is shape-agnostic.
    if (idRemap.size > 0) {
      rewireBindings(result.objects, idRemap);
    }
    pages.push({ objects: result.objects });
    if (i === 0) {
      labelConfig = result.labelConfig;
    }
    // Fold cross-block profile fields without leaking present-with-
    // undefined keys: an explicit `undefined` from one block would
    // otherwise overwrite a real value from a later block and end up
    // in the returned ZplImportResult as a misleading "field cleared"
    // signal for any consumer that bypasses patchPrinterProfile.
    Object.assign(printerProfile, pruneUndefined(result.printerProfile));
    // Per-block findings come from the parser with pageIndex=0; stamp the
    // real page index here so the UI can navigate to them.
    for (const f of result.importReport.findings) {
      findings.push({ ...f, pageIndex: i });
    }
  });

  // Bucket views deduplicate by command code to match the JSDoc contract on
  // ImportReport (see zplParser.ts). The per-occurrence model lives in
  // `findings`; consumers that only need the set of distinct affected
  // commands read these buckets unchanged.
  const dedupBy = (kind: ImportFindingKind) =>
    [...new Set(findings.filter((f) => f.kind === kind).map((f) => f.command))];
  const report: ImportReport = {
    findings,
    partial: dedupBy('partial'),
    browserLimit: dedupBy('browserLimit'),
    unknown: dedupBy('unknown'),
  };

  return { labelConfig, printerProfile, pages, variables, report };
}

/** In-place rewrite of `variableId` references on freshly-parsed objects
 *  (not yet in the store, so mutation is safe). Lets the importer dedupe
 *  cross-block variables without re-walking the tree to construct
 *  immutable copies. */
function rewireBindings(
  objects: LabelObject[],
  idRemap: ReadonlyMap<string, string>,
): void {
  for (const obj of objects) {
    if (obj.variableId && idRemap.has(obj.variableId)) {
      obj.variableId = idRemap.get(obj.variableId);
    }
    if (obj.type === "group" && "children" in obj) {
      rewireBindings(obj.children, idRemap);
    }
  }
}
