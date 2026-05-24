import { mmToDots } from './coordinates';
import { ObjectRegistry } from '../registry';
import { fdField, stripZplCommandChars } from '../registry/zplHelpers';
import {
  extractTemplateRefs,
  hasTemplateMarkers,
  pickEmbedChar,
} from './fnTemplate';
import {
  hasClockMarkers,
  pickClockChars,
  isDefaultClockChars,
} from './fcTemplate';
import { getObjectStringContent } from './variableBinding';
import type { CustomFontMapping, LabelConfig, ZplEmitContext } from '../types/ObjectType';
import type { Variable } from '../types/Variable';
import { isGroup, type LabelObject, type Page } from '../types/Group';
import { getFontBytes } from './fontCache';
import type { ImageProps } from '../registry/image';
import { formatStoragePath } from './storagePath';

/** Format a `~DY` line for one embedded font mapping. The Zebra `~DY`
 *  command syntax splits the path: `~DY{drive}:{name},{fmt},{ext},
 *  {totalBytes},{bytesPerRow},{data}`. For TTF we always use ASCII hex
 *  (`A`/`T`) — universally supported across firmware revisions and
 *  Labelary, even though it doubles the payload. `bytesPerRow` is
 *  irrelevant for fonts, left empty.
 *
 *  Returns undefined when the mapping doesn't qualify (no embed flag,
 *  no preview TTF, no path, or the font cache has no bytes for the
 *  referenced TTF). Skipping is preferred over throwing because a
 *  partial label is still useful — the printer-side path may already
 *  exist on the device. */
function formatDownloadObject(m: CustomFontMapping): string | undefined {
  if (!m.embedInZpl || !m.path || !m.previewFontName) return undefined;
  const bytes = getFontBytes(m.previewFontName);
  if (!bytes) return undefined;
  // Split "E:NAME.TTF" → drive "E:", stem "NAME", ext "TTF" → ZPL ext code "T".
  const colonIdx = m.path.indexOf(':');
  if (colonIdx < 0) return undefined;
  const drive = m.path.slice(0, colonIdx + 1);
  const filename = m.path.slice(colonIdx + 1);
  const dotIdx = filename.lastIndexOf('.');
  const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1).toUpperCase() : '';
  // Only TTF/OTF are uploaded today; both map to extension code T
  // (TrueType is the only TTF-family identifier in the spec).
  if (ext !== 'TTF' && ext !== 'OTF') return undefined;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `~DY${drive}${stem},A,T,${bytes.length},,${hex}`;
}

/** Recursive flatten so images nested inside groups also get their ~DY
 *  preamble emitted. Reuses the same Group-awareness the body emit
 *  applies, but stays a local helper because the preamble only needs to
 *  walk for upload-eligible images and doesn't need ordering or grouping
 *  semantics. */
function flattenObjects(objects: LabelObject[]): LabelObject[] {
  const out: LabelObject[] = [];
  const walk = (list: LabelObject[]): void => {
    for (const o of list) {
      if (isGroup(o)) walk(o.children);
      else out.push(o);
    }
  };
  walk(objects);
  return out;
}

/**
 * Plan the label-header `^FE` directive + `^FN` declarations that
 * inline-embed templates need, plus the emit context that downstream
 * per-leaf `toZPL` calls consume.
 *
 *  - Walks the label once: collects single-bind fnNumbers (they emit
 *    their declaration inline via fdFieldFor) and template-referenced
 *    fnNumbers (need a header declaration). De-dupes against each
 *    other so a slot referenced both ways is declared exactly once.
 *  - Picks an embedChar that doesn't clash with any literal payload
 *    text (prefers `#`, the ZPL default). If every safe candidate is
 *    taken — pathological payload — skips the template path entirely
 *    so markers fall through as literal text instead of producing
 *    ambiguous embeds.
 *  - Returns the header lines (`^FE...`, `^FN...`) and an emit ctx
 *    whose `embedChar` is set only when templates are emittable —
 *    fdFieldFor checks for it as the "templates allowed" gate.
 */
function planTemplateHeader(
  shifted: LabelObject[],
  label: LabelConfig,
  variables: readonly Variable[],
): { headerLines: string[]; emitCtx: ZplEmitContext } {
  // Pre-built maps keep the leaf walk + header emit O(N+V) instead
  // of O(N·V) — a label with hundreds of objects and dozens of
  // variables would otherwise re-scan the whole variables list per
  // leaf per marker.
  const varsById = new Map(variables.map((v) => [v.id, v]));
  const varsByName = new Map(variables.map((v) => [v.name, v]));
  const varsByFn = new Map(variables.map((v) => [v.fnNumber, v]));

  const templatePayloads: string[] = [];
  const clockPayloads: string[] = [];
  const templateFns = new Set<number>();
  const singleBindFns = new Set<number>();
  // Single tree walk collects both ^FE-template and ^FC-clock payloads
  // so the leaf set is flattened once, not twice.
  for (const leaf of flattenObjects(shifted)) {
    if (leaf.includeInExport === false) continue;
    if (leaf.variableId) {
      const v = varsById.get(leaf.variableId);
      if (v) singleBindFns.add(v.fnNumber);
    }
    const c = getObjectStringContent(leaf);
    if (c === undefined) continue;
    if (hasTemplateMarkers(c)) {
      templatePayloads.push(c);
      for (const name of extractTemplateRefs(c)) {
        const v = varsByName.get(name);
        if (v) templateFns.add(v.fnNumber);
      }
    }
    if (hasClockMarkers(c)) clockPayloads.push(c);
  }
  const pickedEmbedChar =
    templatePayloads.length > 0 ? pickEmbedChar(templatePayloads) : '#';
  const headerLines: string[] = [];
  const emitCtx: ZplEmitContext = { label, variables };

  if (pickedEmbedChar !== null) {
    if (pickedEmbedChar !== '#') headerLines.push(`^FE${pickedEmbedChar}`);
    for (const fn of [...templateFns].sort((a, b) => a - b)) {
      if (singleBindFns.has(fn)) continue;
      const v = varsByFn.get(fn);
      if (!v) continue;
      headerLines.push(`^FN${fn}${fdField(v.defaultValue)}`);
    }
    emitCtx.embedChar = pickedEmbedChar;
  }

  // ^FC clock chars run on the same fail-safe logic as ^FE: pick a
  // triple that doesn't clash with any literal payload text, emit
  // `^FC<a>,<b>,<c>` only when ≠ defaults, leave clock markers
  // literal when no safe triple exists.
  if (clockPayloads.length > 0) {
    const picked = pickClockChars(clockPayloads);
    if (picked) {
      if (!isDefaultClockChars(picked)) {
        headerLines.push(`^FC${picked.date},${picked.time},${picked.tertiary}`);
      }
      emitCtx.clockChars = picked;
    }
  }

  return { headerLines, emitCtx };
}

/** Format a `~DY` line for a graphic-upload image. Mirrors the font-upload
 *  helper but parses the bitmap bytes out of `_gfaCache` (shape:
 *  `^GF{A|B|C},total,data,bpr,DATA…`). The format letter is preserved so a
 *  `:Z64:`-wrapped payload re-exports as `~DY...,C,G,...` (Zebra firmware
 *  pairs `:Z64:` with format C only); collapsing all to `A` would corrupt
 *  the upload. Returns undefined when the cache is malformed; the caller
 *  skips, the image then emits inline ^GF instead. */
function formatGraphicUpload(p: ImageProps): string | undefined {
  if (!p.storedAs || !p._gfaCache) return undefined;
  // The two byte-count headers are optional in `^GF` (firmware accepts
  // `^GFA,,,bpr,DATA`), so `\d*` rather than `\d+` matches both forms.
  const m = /^\^GF([ABC]),(\d*),(\d*),(\d+),([\s\S]*)$/.exec(p._gfaCache);
  if (!m) return undefined;
  const format = m[1];
  const total = m[2];
  const bpr = m[4];
  const data = m[5];
  return `~DY${formatStoragePath(p.storedAs, false)},${format},G,${total},${bpr},${data}`;
}

/**
 * Concatenates `generateZPL` output for every page. Each page becomes its own
 * `^XA...^XZ` block; printers process the blocks as separate labels.
 */
export function generateMultiPageZPL(
  label: LabelConfig,
  pages: Page[],
  variables: readonly Variable[] = [],
): string {
  return pages.map((p) => generateZPL(label, p.objects, variables)).join('\n');
}

/** Drive + filename used to stash the batch template on the printer.
 *  R: is RAM (volatile, dropped on power cycle), which matches a
 *  single-run batch scope. 8.3 filename avoids stomping on
 *  user-managed stored forms. */
const BATCH_TEMPLATE_PATH = 'R:LBL.ZPL';

/**
 * Batch-print form for a single page-design driven by a CSV dataset.
 * Emits the template once (wrapped in `^DF{path}` so the printer
 * stores it under `BATCH_TEMPLATE_PATH`) and then one small recall
 * block per CSV row: `^XA^XF{path}^FN..^FD..^FS..^XZ`. This is the
 * idiomatic ZPL data-merge pattern, so a 10k-row batch isn't 10k
 * full copies of the design.
 *
 * Variables with no binding (or whose bound header is missing from
 * the current dataset) emit no override; the printer falls back to
 * the variable's `^FD` default baked into the stored template.
 */
export function generateBatchZpl(
  label: LabelConfig,
  objects: LabelObject[],
  variables: readonly Variable[],
  csvDataset: {
    headers: readonly string[];
    rows: readonly (readonly string[])[];
  },
  csvMapping: { bindings: Record<string, string> },
): string {
  const baseZpl = generateZPL(label, objects, variables);
  // Inject ^DFR after the first ^XA so it lands inside the label block.
  // Don't anchor to start: ~DY/~SD preamble lines (custom fonts, instant
  // darkness) emit before ^XA, and a start-anchored regex would silently
  // skip the inject — recall blocks below would then reference a form
  // file the printer never stored.
  const templateStored = baseZpl.replace(
    /\^XA\r?\n/,
    `^XA\n^DF${BATCH_TEMPLATE_PATH}\n`,
  );

  // Pre-compute (variable.fnNumber, columnIdx) per mapped variable so
  // the per-row loop is a tight zip. Variables with no binding or whose
  // header dropped from the dataset are absent here — the printer's
  // stored template carries their ^FD default, which becomes the
  // effective value when no override is sent.
  const overrides: { fn: number; colIdx: number }[] = [];
  for (const v of variables) {
    const header = csvMapping.bindings[v.id];
    if (header === undefined) continue;
    const colIdx = csvDataset.headers.indexOf(header);
    if (colIdx === -1) continue;
    overrides.push({ fn: v.fnNumber, colIdx });
  }

  const recallBlocks = csvDataset.rows.map((row) => {
    const lines: string[] = ['^XA', `^XF${BATCH_TEMPLATE_PATH}`];
    for (const { fn, colIdx } of overrides) {
      const value = row[colIdx] ?? '';
      // Route through `fdField` so values containing `^`/`~` get the
      // ^FH hex-escape treatment instead of terminating the field early.
      lines.push(`^FN${fn}${fdField(value)}`);
    }
    lines.push('^XZ');
    return lines.join('\n');
  });

  return [templateStored, ...recallBlocks].join('\n');
}

export function generateZPL(
  label: LabelConfig,
  objects: LabelObject[],
  variables: readonly Variable[] = [],
): string {
  const widthDots = mmToDots(label.widthMm, label.dpmm);
  const heightDots = mmToDots(label.heightMm, label.dpmm);

  const lines: string[] = [];

  // ~DY ships embedded font bytes BEFORE the label block. Like ~SD it is
  // a tilde-prefix immediate command; the printer (and Labelary) writes
  // the file into storage and the following ^XA…^XZ resolves ^CW/^A
  // against it. Without ~DY the alias would dangle on Labelary because
  // the device has no other channel to receive the TTF.
  for (const m of label.customFonts ?? []) {
    const line = formatDownloadObject(m);
    if (line) lines.push(line);
  }

  // ~DY graphic uploads. Each image with `storedAs` is uploaded once
  // before ^XA; the per-instance ^XG in the body recalls it. Deduplicated
  // by full path so the same logo doesn't ship twice when used on
  // multiple pages or in multiple positions. The data is parsed back out
  // of `_gfaCache` (which stores `^GFA,total,data,bpr,HEX...`); without
  // that cache the upload is silently dropped.
  const seenGraphics = new Set<string>();
  for (const obj of flattenObjects(objects)) {
    if (obj.type !== 'image') continue;
    const p = obj.props as ImageProps;
    if (!p.storedAs || !p._gfaCache) continue;
    // Recall-only mode: the printer already has the bytes (admin uploaded
    // them out-of-band), so skip the ~DY preamble. Image stays a preview
    // in the designer; ZPL output only carries the ^XG references.
    if (p.storedAs.embedInZpl === false) continue;
    const key = formatStoragePath(p.storedAs, false);
    if (seenGraphics.has(key)) continue;
    seenGraphics.add(key);
    const dy = formatGraphicUpload(p);
    if (dy) lines.push(dy);
  }

  // ~SD is a tilde-prefix command that takes effect immediately on receipt,
  // independently of the label block. Emit it before ^XA so the darkness
  // change applies to the label that follows.
  if (label.instantDarkness !== undefined) {
    const v = String(label.instantDarkness).padStart(2, '0');
    lines.push(`~SD${v}`);
  }

  lines.push(
    '^XA',
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    '^CI28',
  );

  if (label.mediaMode) lines.push(`^MM${label.mediaMode}`);
  if (label.mediaType) lines.push(`^MT${label.mediaType}`);
  // ^PR print,slew,backfeed — any of the three triggers emission. Slew and
  // backfeed default to the print speed per Zebra spec; ZPL has no way to
  // skip a positional param, so backfeed-only still has to repeat the print
  // speed in the slew slot.
  const fallback = label.printSpeed ?? label.slewSpeed ?? label.backfeedSpeed;
  if (fallback !== undefined) {
    const parts = [fallback];
    if (label.slewSpeed !== undefined || label.backfeedSpeed !== undefined) {
      parts.push(label.slewSpeed ?? fallback);
    }
    if (label.backfeedSpeed !== undefined) parts.push(label.backfeedSpeed);
    lines.push(`^PR${parts.join(',')}`);
  }
  // darkness=0 is a valid value (printer baseline), so check undefined explicitly.
  if (label.darkness !== undefined) lines.push(`^MD${label.darkness}`);
  if (label.printOrientation) lines.push(`^PO${label.printOrientation}`);
  if (label.mirror) lines.push(`^PM${label.mirror}`);
  // Geometry offsets ────────────────────────────────────────────────────────
  // ^LH / ^LT — origin offsets. The internal model stores absolute field
  // coords; the emit path below subtracts the offsets from each field's
  // (x, y) so the printed result matches what the user sees in the editor.
  const homeX = label.labelHomeX ?? 0;
  const homeY = label.labelHomeY ?? 0;
  const top = label.labelTop ?? 0;
  if (homeX !== 0 || homeY !== 0) lines.push(`^LH${homeX},${homeY}`);
  if (top !== 0) lines.push(`^LT${top}`);
  if (label.labelShift) lines.push(`^LS${label.labelShift}`);

  // Custom font mappings ────────────────────────────────────────────────────
  // ^CW assigns a single-char alias to a font path on the printer's
  // storage, so subsequent ^A{alias} fields can reference it without
  // restating the full E:font.TTF path. Skip mappings with an empty
  // alias or path — these come from in-progress UI rows and would emit
  // malformed ^CW lines that the printer drops silently.
  if (label.customFonts?.length) {
    for (const f of label.customFonts) {
      if (f.alias && f.path) lines.push(`^CW${f.alias},${f.path}`);
    }
  }

  // Default font ────────────────────────────────────────────────────────────
  // ^CF f,h,w — positional. Empty slots stay empty (^CFA,,20 sets font A
  // and width 20, leaving height untouched). Trailing empty slots are
  // trimmed for a tidier emit.
  if (
    label.defaultFontId ||
    label.defaultFontHeight !== undefined ||
    label.defaultFontWidth !== undefined
  ) {
    const slots = [
      label.defaultFontId ?? "",
      label.defaultFontHeight !== undefined ? String(label.defaultFontHeight) : "",
      label.defaultFontWidth !== undefined ? String(label.defaultFontWidth) : "",
    ];
    while (slots.length > 1 && slots[slots.length - 1] === "") slots.pop();
    lines.push(`^CF${slots.join(",")}`);
  }

  // Apply ^LH/^LT compensation: subtract the offsets from each leaf's
  // (x, y) before delegating to the registry. Leaves whose origin would
  // land negative are dropped from emission — Zebra rejects negative ^FO
  // and clamping would silently relocate them into the visible area,
  // breaking the editor's WYSIWYG promise. Groups recurse; their children
  // store absolute coords so the same shift applies per leaf.
  const shiftOrDrop = (obj: LabelObject): LabelObject[] => {
    if (isGroup(obj)) {
      return [{ ...obj, children: obj.children.flatMap(shiftOrDrop) }];
    }
    const x = obj.x - homeX;
    const y = obj.y - homeY - top;
    return x < 0 || y < 0 ? [] : [{ ...obj, x, y }];
  };

  const shifted =
    homeX !== 0 || homeY !== 0 || top !== 0
      ? objects.flatMap(shiftOrDrop)
      : objects;

  // ^FE inline embeds (`«name»` markers in content) need every
  // referenced fnNumber to have a `^FN<n>^FD<default>^FS` declaration
  // somewhere in the label format. Compute the header + emit context
  // in one helper so the main flow stays a sequence of label parts.
  const { headerLines, emitCtx } = planTemplateHeader(shifted, label, variables);
  lines.push(...headerLines);

  // Groups are structural only — they emit no ZPL of their own. A group
  // with includeInExport=false cascades the skip to its whole subtree;
  // otherwise we recurse and let each leaf decide.
  const emitLeaf = (obj: LabelObject): string[] => {
    if (obj.includeInExport === false) return [];
    if (isGroup(obj)) return obj.children.flatMap(emitLeaf);
    const zpl = ObjectRegistry[obj.type]?.toZPL(obj, emitCtx) ?? '';
    return obj.comment
      ? [`^FX${stripZplCommandChars(obj.comment)}\n${zpl}`]
      : [zpl];
  };
  lines.push(...shifted.flatMap(emitLeaf));

  // ^PQ q,p,r,o — emit if quantity > 1 OR any extended param is set.
  // Defaults follow the Zebra spec: q=1, p=0, r=0, o=N.
  const pq = label.printQuantity ?? 1;
  const pause = label.pauseCount ?? 0;
  const reps = label.replicates ?? 0;
  const override = label.overridePauseCount ?? 'N';
  const pqExtended = pause !== 0 || reps !== 0 || override !== 'N';
  if (pqExtended) {
    lines.push(`^PQ${pq},${pause},${reps},${override}`);
  } else if (pq > 1) {
    lines.push(`^PQ${pq}`);
  }

  lines.push('^XZ');

  // Rewrite ^A@...{drive}:NAME.TTF references to ^A{alias} for paths
  // that the user has registered via ^CW. The ^CW lines are already
  // in the header, so the printer resolves the short form against the
  // alias table. Saves bytes and surfaces the user's alias choices in
  // the output. The drive prefix pattern is open ([A-Z]:) so the
  // rewrite keeps working if text emit ever supports non-E drives.
  const aliasByPath = new Map<string, string>();
  for (const m of label.customFonts ?? []) {
    if (m.alias && m.path) aliasByPath.set(m.path, m.alias);
  }
  let output = lines.join('\n');
  if (aliasByPath.size > 0) {
    output = output.replace(
      /\^A@([NIRB]),(\d+),(\d+),([A-Z]:[^^\n]+?)(?=\^|\n|$)/g,
      (full, rot, h, w, path) => {
        const alias = aliasByPath.get(path);
        return alias ? `^A${alias}${rot},${h},${w}` : full;
      },
    );
  }
  return output;
}
