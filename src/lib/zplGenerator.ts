import { mmToDots } from './coordinates';
import { getEntry } from '../registry';
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
import type { ClockOffset, CustomFontMapping, LabelConfig } from '../types/LabelConfig';
import type { ZplEmitContext } from '../types/ZplEmit';
import type { Variable } from '../types/Variable';
import { isGroup, type LabelObject, type Page } from '../types/Group';
import { formatFontDownloadFromPath } from './customFonts';
import type { ImageProps } from '../registry/image';
import { formatStoragePath } from './storagePath';

function formatDownloadObject(m: CustomFontMapping): string | undefined {
  if (!m.embedInZpl || !m.path || !m.previewFontName) return undefined;
  return formatFontDownloadFromPath(m.path);
}

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

/** Plan `^FE` + header `^FN` declarations for inline-embed templates,
 *  plus the emit context. embedChar is only set when a safe char exists,
 *  which fdFieldFor uses as the "templates allowed" gate. */
function planTemplateHeader(
  shifted: LabelObject[],
  label: LabelConfig,
  variables: readonly Variable[],
): { headerLines: string[]; emitCtx: ZplEmitContext } {
  // O(N+V) vs O(N*V) per-marker re-scan.
  const varsById = new Map(variables.map((v) => [v.id, v]));
  const varsByName = new Map(variables.map((v) => [v.name, v]));
  const varsByFn = new Map(variables.map((v) => [v.fnNumber, v]));

  const templatePayloads: string[] = [];
  const clockPayloads: string[] = [];
  const templateFns = new Set<number>();
  const singleBindFns = new Set<number>();
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

  // Same fail-safe as ^FE: emit only when non-default and safe.
  if (clockPayloads.length > 0) {
    const picked = pickClockChars(clockPayloads);
    if (picked) {
      // ^SO precedes ^FC so the offsets are armed when the firmware
      // activates the secondary/tertiary clock chars. ^SO is session-
      // scoped; emitting on every label that uses these channels
      // overwrites any stale state from a prior label.
      const so2 = formatSetOffset(2, label.secondaryClockOffset);
      const so3 = formatSetOffset(3, label.tertiaryClockOffset);
      if (so2) headerLines.push(so2);
      if (so3) headerLines.push(so3);
      if (!isDefaultClockChars(picked)) {
        headerLines.push(`^FC${picked.date},${picked.time},${picked.tertiary}`);
      }
      emitCtx.clockChars = picked;
    }
  }

  return { headerLines, emitCtx };
}

/** ^SOa,b,c,d,e,f,g where a=clock# (2 or 3), then wire order
 *  months,days,years,hours,minutes,seconds. Returns null when the
 *  offset is absent or all-zero (in which case the channel falls
 *  back to the primary RTC and the command is redundant). */
function formatSetOffset(
  clock: 2 | 3,
  offset: ClockOffset | undefined,
): string | null {
  if (!offset) return null;
  const slots = [
    offset.months ?? 0,
    offset.days ?? 0,
    offset.years ?? 0,
    offset.hours ?? 0,
    offset.minutes ?? 0,
    offset.seconds ?? 0,
  ];
  if (slots.every((v) => v === 0)) return null;
  return `^SO${clock},${slots.join(',')}`;
}

/** ~DY for a graphic upload. Format letter is preserved so :Z64: stays paired with C. */
function formatGraphicUpload(p: ImageProps): string | undefined {
  if (!p.storedAs || !p._gfaCache) return undefined;
  // Byte-count headers are optional in ^GF, hence \d* not \d+.
  const m = /^\^GF([ABC]),(\d*),(\d*),(\d+),([\s\S]*)$/.exec(p._gfaCache);
  if (!m) return undefined;
  const format = m[1];
  const total = m[2];
  const bpr = m[4];
  const data = m[5];
  return `~DY${formatStoragePath(p.storedAs, false)},${format},G,${total},${bpr},${data}`;
}

/** Each page becomes its own ^XA..^XZ block (separate labels to the printer). */
export function generateMultiPageZPL(
  label: LabelConfig,
  pages: Page[],
  variables: readonly Variable[] = [],
): string {
  return pages.map((p) => generateZPL(label, p.objects, variables)).join('\n');
}

/** R: is volatile RAM, matches single-run batch scope. */
const BATCH_TEMPLATE_PATH = 'R:LBL.ZPL';

/** Store template via ^DF then emit one ^XA^XF...^XZ recall block per
 *  CSV row. Unmapped variables fall back to the template's ^FD default. */
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
  // Inject after first ^XA (not at start) because ~DY/~SD preambles
  // emit before ^XA and would skip a start-anchored match.
  const templateStored = baseZpl.replace(
    /\^XA\r?\n/,
    `^XA\n^DF${BATCH_TEMPLATE_PATH}\n`,
  );

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
      // fdField applies ^FH hex-escape for ^/~ so fields don't terminate early.
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

  // ~DY ships font bytes before ^XA so ^CW/^A resolve against them.
  for (const m of label.customFonts ?? []) {
    const line = formatDownloadObject(m);
    if (line) lines.push(line);
  }

  // ~DY graphic uploads deduped by path; body ^XG recalls them.
  const seenGraphics = new Set<string>();
  for (const obj of flattenObjects(objects)) {
    if (obj.type !== 'image') continue;
    const p = obj.props as ImageProps;
    if (!p.storedAs || !p._gfaCache) continue;
    // Recall-only: bytes uploaded out-of-band; ZPL only emits ^XG references.
    if (p.storedAs.embedInZpl === false) continue;
    const key = formatStoragePath(p.storedAs, false);
    if (seenGraphics.has(key)) continue;
    seenGraphics.add(key);
    const dy = formatGraphicUpload(p);
    if (dy) lines.push(dy);
  }

  // ~SD is immediate (not EEPROM), emit before ^XA so it applies to this label.
  if (label.instantDarkness !== undefined) {
    const v = String(label.instantDarkness).padStart(2, '0');
    lines.push(`~SD${v}`);
  }

  lines.push('^XA');
  // a=D since model is dots-canonical.
  if (label.muResampling) {
    lines.push(`^MUD,${label.muResampling.formatDpi},${label.muResampling.outputDpi}`);
  }
  lines.push(
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    '^CI28',
  );

  if (label.mediaMode) lines.push(`^MM${label.mediaMode}`);
  if (label.mediaType) lines.push(`^MT${label.mediaType}`);
  if (label.mediaTracking) lines.push(`^MN${label.mediaTracking}`);
  if (label.maxLabelLength !== undefined) lines.push(`^ML${label.maxLabelLength}`);
  // Positional pair; default the unset slot to "N" (no motion).
  if (label.mediaFeedPowerUp || label.mediaFeedHeadClose) {
    const p1 = label.mediaFeedPowerUp ?? 'N';
    const p2 = label.mediaFeedHeadClose ?? 'N';
    lines.push(`^MF${p1},${p2}`);
  }
  if (label.suppressBackfeed) lines.push('^XB');
  // ^PR positional; backfeed-only still has to repeat print in the slew slot.
  const fallback = label.printSpeed ?? label.slewSpeed ?? label.backfeedSpeed;
  if (fallback !== undefined) {
    const parts = [fallback];
    if (label.slewSpeed !== undefined || label.backfeedSpeed !== undefined) {
      parts.push(label.slewSpeed ?? fallback);
    }
    if (label.backfeedSpeed !== undefined) parts.push(label.backfeedSpeed);
    lines.push(`^PR${parts.join(',')}`);
  }
  // darkness=0 is valid (baseline); check undefined explicitly.
  if (label.darkness !== undefined) lines.push(`^MD${label.darkness}`);
  if (label.printOrientation) lines.push(`^PO${label.printOrientation}`);
  if (label.mirror) lines.push(`^PM${label.mirror}`);
  // ^LH / ^LT subtract below from per-field absolute (x,y) so emit matches editor.
  const homeX = label.labelHomeX ?? 0;
  const homeY = label.labelHomeY ?? 0;
  const top = label.labelTop ?? 0;
  if (homeX !== 0 || homeY !== 0) lines.push(`^LH${homeX},${homeY}`);
  if (top !== 0) lines.push(`^LT${top}`);
  if (label.labelShift) lines.push(`^LS${label.labelShift}`);

  // ^CW alias->path; skip empty (in-progress UI rows would emit malformed lines).
  if (label.customFonts?.length) {
    for (const f of label.customFonts) {
      if (f.alias && f.path) lines.push(`^CW${f.alias},${f.path}`);
    }
  }

  // ^CF f,h,w positional; trim trailing empty slots.
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

  // Drop leaves whose shifted origin is negative; Zebra rejects negative
  // ^FO and clamping would relocate them silently.
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

  const { headerLines, emitCtx } = planTemplateHeader(shifted, label, variables);
  lines.push(...headerLines);

  // Groups are structural; includeInExport=false cascades to the subtree.
  const emitLeaf = (obj: LabelObject): string[] => {
    if (obj.includeInExport === false) return [];
    if (isGroup(obj)) return obj.children.flatMap(emitLeaf);
    const zpl = getEntry(obj.type)?.toZPL(obj, emitCtx) ?? '';
    return obj.comment
      ? [`^FX${stripZplCommandChars(obj.comment)}\n${zpl}`]
      : [zpl];
  };
  lines.push(...shifted.flatMap(emitLeaf));

  // ^PQ q,p,r,o (defaults q=1 p=0 r=0 o=N); emit if q>1 or any extended set.
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

  // Rewrite ^A@...PATH -> ^A{alias} for paths the user registered via ^CW.
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
