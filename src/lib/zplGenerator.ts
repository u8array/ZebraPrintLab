import { mmToDots } from './coordinates';
import { ObjectRegistry } from '../registry';
import type { LabelConfig } from '../types/ObjectType';
import type { LabelObject } from '../registry';

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
  if (label.labelShift) lines.push(`^LS${label.labelShift}`);

  lines.push(...objects.map((obj) => {
    const zpl = ObjectRegistry[obj.type]?.toZPL(obj) ?? '';
    if (!obj.comment) return zpl;
    // Strip ^ to prevent breaking ZPL structure inside the comment text
    const safe = obj.comment.replace(/\^/g, '');
    return `^FX${safe}\n${zpl}`;
  }));

  if (label.printQuantity && label.printQuantity > 1) {
    lines.push(`^PQ${label.printQuantity}`);
  }

  lines.push('^XZ');

  return lines.join('\n');
}
