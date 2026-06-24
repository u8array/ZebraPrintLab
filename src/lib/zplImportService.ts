import { parseZPL, type ImportFinding, type ImportFindingKind, type ImportReport } from "./zplParser";
import { pruneUndefined } from "./pruneUndefined";
import { stripDrivePrefix } from "./customFonts";
import type { CustomFontMapping, LabelConfig } from "../types/LabelConfig";
import type { PrinterProfile } from "../types/PrinterProfile";
import type { LabelObject, Page } from "../types/Group";
import { uniqueVariableName, type Variable } from "../types/Variable";

export interface ZplImportResult {
  labelConfig: Partial<LabelConfig>;
  /** Setup-Script fields extracted from the import. Caller decides
   *  whether to overwrite the active printer profile (e.g. only when
   *  the user explicitly opts in); design imports should typically
   *  NOT auto-apply these so a shared `.zpl` can't silently
   *  reconfigure the user's printer. */
  printerProfile: Partial<PrinterProfile>;
  pages: Page[];
  variables: Variable[];
  report: ImportReport;
}

interface SplitBlocks {
  /** Command text before the first `^XA` (e.g. `~DY` font uploads). Empty
   *  when the head holds no command token, so pasted prose stays discarded. */
  preamble: string;
  /** One entry per `^XA...^XZ` document. */
  blocks: string[];
}

/**
 * Splits a ZPL stream into one block per `^XA...^XZ` document plus the
 * preamble that precedes the first `^XA`. ZPL commands are case-insensitive
 * per spec.
 */
function splitIntoLabelBlocks(zpl: string): SplitBlocks {
  // Capture group preserves the matched delimiter so mixed-case (^xa) survives.
  const parts = zpl.split(/(\^XA)/i);
  const blocks: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    blocks.push((parts[i] ?? '') + (parts[i + 1] ?? ''));
  }
  // ~DY uploads emit before the first ^XA; keep the head only when it
  // carries a command token (^ or ~). Pure prose is discarded so junk
  // imports still yield nothing.
  const head = parts[0] ?? '';
  const preamble = /[\^~]/.test(head) ? head : '';
  return { preamble, blocks };
}

export function importZplText(zpl: string, dpmm: number): ZplImportResult {
  const { preamble, blocks } = splitIntoLabelBlocks(zpl);

  if (blocks.length === 0 && !preamble) {
    return {
      labelConfig: {},
      printerProfile: {},
      pages: [],
      variables: [],
      report: { findings: [], partial: [], browserLimit: [], unknown: [], replayRisk: [] },
    };
  }

  // Prepend the preamble to block 0 so a font's ~DY and its ^CW alias
  // decode in one parser pass. Without ^XA the preamble runs alone.
  const hasLabelBlocks = blocks.length > 0;
  const parseUnits = hasLabelBlocks
    ? blocks.map((b, i) => (i === 0 ? preamble + b : b))
    : [preamble];
  const uploadedFontPaths: string[] = [];
  const normPath = (p: string) => p.trim().toUpperCase();
  // Strip only the uploaded side: driveless refs match any drive on the
  // printer, but two drived refs on different drives stay distinct.
  const strippedNorm = (p: string) => stripDrivePrefix(normPath(p));
  // ^CW aliases + ^A@ direct refs across all blocks; later-block claims
  // also exclude a preamble-uploaded font.
  const designFontPaths = new Set<string>();

  let labelConfig: Partial<LabelConfig> = {};
  // Merge profile fields across blocks: later blocks' values win so a
  // multi-block ZPL with re-stated Setup-Script commands resolves to
  // the last-seen state (mirrors what the printer would actually end
  // up with after executing the stream).
  const printerProfile: Partial<PrinterProfile> = {};
  const pages: Page[] = [];
  const findings: ImportFinding[] = [];
  // Variables are document-level, but the parser reconstructs them per
  // block. Merge across blocks by fnNumber (same slot used on multiple
  // pages → one Variable) and rewire later blocks' object references
  // onto the first block's Variable so the binding survives the merge.
  const variables: Variable[] = [];
  const variablesByFn = new Map<number, Variable>();

  // Cross-block customFonts merge by alias. Foreign ZPL can split a font
  // upload from its ^CW alias (~DY in preamble, ^CW in a later block),
  // and the per-block parser would otherwise lose the entry when block 0's
  // labelConfig replaces all later labelConfigs.
  const aggregatedCustomFonts = new Map<string, CustomFontMapping>();
  parseUnits.forEach((block, i) => {
    const result = parseZPL(block, dpmm, { captureOverlay: true });
    uploadedFontPaths.push(...result.uploadedFontPaths);
    for (const m of result.labelConfig.customFonts ?? []) {
      if (m.path) designFontPaths.add(normPath(m.path));
      if (m.alias) aggregatedCustomFonts.set(m.alias, m);
    }
    for (const p of result.referencedFontPaths) designFontPaths.add(normPath(p));
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
    // A preamble-only unit (no ^XA) carries fonts/profile but no page.
    if (hasLabelBlocks) pages.push({ objects: result.objects, overlay: result.overlay });
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

  // Uploaded fonts not claimed as design fonts are Setup-Script fonts.
  // Case-insensitive compare since external streams vary in casing.
  const uploadedUnique = [...new Set(uploadedFontPaths)];
  const uploadedNormed = new Map(uploadedUnique.map((p) => [normPath(p), p]));
  const uploadedStripped = new Map(uploadedUnique.map((p) => [strippedNorm(p), p]));
  const setupFontPaths = uploadedUnique.filter(
    (p) => !designFontPaths.has(normPath(p)) && !designFontPaths.has(strippedNorm(p)),
  );
  if (setupFontPaths.length > 0) {
    printerProfile.setupFonts = setupFontPaths.map((path) => ({ path }));
  }

  // Backfill embedInZpl + previewFontName on aggregated entries whose
  // path matches an uploaded font: the parser's ^CW handler can only
  // see same-block uploads, so a foreign ZPL with split ~DY/^CW would
  // otherwise drop the embed flag on re-export.
  for (const m of aggregatedCustomFonts.values()) {
    if (!m.path) continue;
    const upload = uploadedNormed.get(normPath(m.path))
      ?? uploadedStripped.get(strippedNorm(m.path));
    if (!upload || m.embedInZpl) continue;
    m.embedInZpl = true;
    const colon = upload.indexOf(":");
    const filename = colon >= 0 ? upload.slice(colon + 1) : upload;
    if (filename && !m.previewFontName) m.previewFontName = filename;
  }
  if (aggregatedCustomFonts.size > 0) {
    labelConfig.customFonts = [...aggregatedCustomFonts.values()];
  }

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
    replayRisk: dedupBy('replayRisk'),
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
      // Cross-block merge is by fnNumber, so the remapped variable keeps the
      // same ^FN number: the captured bytes stay valid and must NOT be marked
      // dirty, or an unedited later page would lose its original ^FD default on
      // export (byte-identity break). The remap only repoints the model binding.
      obj.variableId = idRemap.get(obj.variableId);
    }
    if (obj.type === "group" && "children" in obj) {
      rewireBindings(obj.children, idRemap);
    }
  }
}
