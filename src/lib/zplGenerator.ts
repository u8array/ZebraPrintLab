import { mmToDots } from './coordinates';
import { ObjectRegistry } from '../registry';
import { stripZplCommandChars } from '../registry/zplHelpers';
import type { LabelConfig } from '../types/ObjectType';
import type { Page } from '../store/labelStore';
import { isGroup, type LabelObject } from '../types/Group';

/**
 * Concatenates `generateZPL` output for every page. Each page becomes its own
 * `^XA...^XZ` block; printers process the blocks as separate labels.
 */
export function generateMultiPageZPL(label: LabelConfig, pages: Page[]): string {
  return pages.map((p) => generateZPL(label, p.objects)).join('\n');
}

export function generateZPL(label: LabelConfig, objects: LabelObject[]): string {
  const widthDots = mmToDots(label.widthMm, label.dpmm);
  const heightDots = mmToDots(label.heightMm, label.dpmm);

  const lines: string[] = [];

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

  // Default font ────────────────────────────────────────────────────────────
  // ^CF f,h,w — emit each part when set.
  if (
    label.defaultFontId ||
    label.defaultFontHeight !== undefined ||
    label.defaultFontWidth !== undefined
  ) {
    const id = label.defaultFontId ?? "";
    const height =
      label.defaultFontHeight !== undefined ? `,${label.defaultFontHeight}` : "";
    const width =
      label.defaultFontWidth !== undefined ? `,${label.defaultFontWidth}` : "";
    lines.push(`^CF${id}${height}${width}`);
  }

  // Apply ^LH/^LT compensation: subtract the offsets from each leaf's
  // (x, y) before delegating to the registry. Clamp at 0 — Zebra rejects
  // negative ^FO. Group containers recurse; their children's coords are
  // absolute in the model so the same shift applies per leaf. Skip the
  // copy entirely when no offset is active.
  const shiftLeaf = (obj: LabelObject): LabelObject => {
    if (isGroup(obj)) return { ...obj, children: obj.children.map(shiftLeaf) };
    return {
      ...obj,
      x: Math.max(0, obj.x - homeX),
      y: Math.max(0, obj.y - homeY - top),
    };
  };

  // Groups are structural only — they emit no ZPL of their own. A group
  // with includeInExport=false cascades the skip to its whole subtree;
  // otherwise we recurse and let each leaf decide.
  const emitLeaf = (obj: LabelObject): string[] => {
    if (obj.includeInExport === false) return [];
    if (isGroup(obj)) return obj.children.flatMap(emitLeaf);
    const zpl = ObjectRegistry[obj.type]?.toZPL(obj) ?? '';
    return obj.comment
      ? [`^FX${stripZplCommandChars(obj.comment)}\n${zpl}`]
      : [zpl];
  };
  const shifted =
    homeX !== 0 || homeY !== 0 || top !== 0
      ? objects.map(shiftLeaf)
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

  return lines.join('\n');
}
