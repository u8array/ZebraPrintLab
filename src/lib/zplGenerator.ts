import { mmToDots } from './coordinates';
import { ObjectRegistry } from '../registry';
import { stripZplCommandChars } from '../registry/zplHelpers';
import type { LabelConfig } from '../types/ObjectType';
import type { LabelObject } from '../registry';
import type { Page } from '../store/labelStore';

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

  const lines: string[] = [
    '^XA',
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    '^CI28',
  ];

  if (label.mediaMode) lines.push(`^MM${label.mediaMode}`);
  if (label.mediaType) lines.push(`^MT${label.mediaType}`);
  if (label.printSpeed !== undefined) lines.push(`^PR${label.printSpeed}`);
  // darkness=0 is a valid value (printer baseline), so check undefined explicitly.
  if (label.darkness !== undefined) lines.push(`^MD${label.darkness}`);
  if (label.printOrientation) lines.push(`^PO${label.printOrientation}`);
  // ^CF parameters are individually optional per Zebra spec: ^CF0 sets the
  // font only, ^CF,30 sets the height only. Preserves round-trip fidelity
  // when an imported label used a partial command.
  if (label.defaultFontId || label.defaultFontHeight !== undefined) {
    const id = label.defaultFontId ?? "";
    const height =
      label.defaultFontHeight !== undefined ? `,${label.defaultFontHeight}` : "";
    lines.push(`^CF${id}${height}`);
  }
  if (label.labelShift) lines.push(`^LS${label.labelShift}`);

  lines.push(...objects.flatMap((obj) => {
    if (obj.includeInExport === false) return [];
    const zpl = ObjectRegistry[obj.type]?.toZPL(obj) ?? '';
    if (!obj.comment) return [zpl];
    return [`^FX${stripZplCommandChars(obj.comment)}\n${zpl}`];
  }));

  if (label.printQuantity && label.printQuantity > 1) {
    lines.push(`^PQ${label.printQuantity}`);
  }

  lines.push('^XZ');

  return lines.join('\n');
}
