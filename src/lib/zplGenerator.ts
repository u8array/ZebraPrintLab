import { mmToDots } from './coordinates';
import { ObjectRegistry } from '../registry';
import { stripZplCommandChars } from '../registry/zplHelpers';
import type { CustomFontMapping, LabelConfig } from '../types/ObjectType';
import type { Page } from '../store/labelStore';
import type { Variable } from '../types/Variable';
import { isGroup, type LabelObject } from '../types/Group';
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

  // Groups are structural only — they emit no ZPL of their own. A group
  // with includeInExport=false cascades the skip to its whole subtree;
  // otherwise we recurse and let each leaf decide.
  const emitLeaf = (obj: LabelObject): string[] => {
    if (obj.includeInExport === false) return [];
    if (isGroup(obj)) return obj.children.flatMap(emitLeaf);
    const zpl = ObjectRegistry[obj.type]?.toZPL(obj, { label, variables }) ?? '';
    return obj.comment
      ? [`^FX${stripZplCommandChars(obj.comment)}\n${zpl}`]
      : [zpl];
  };
  const shifted =
    homeX !== 0 || homeY !== 0 || top !== 0
      ? objects.flatMap(shiftOrDrop)
      : objects;
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
