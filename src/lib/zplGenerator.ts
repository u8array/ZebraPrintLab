import { mmToDots } from './coordinates';
import { ObjectRegistry } from '../registry';
import type { LabelConfig } from '../types/ObjectType';
import type { LabelObject } from '../registry';

export function generateZPL(label: LabelConfig, objects: LabelObject[]): string {
  const widthDots = mmToDots(label.widthMm);
  const heightDots = mmToDots(label.heightMm);

  const lines = [
    '^XA',
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    ...objects.map((obj) => ObjectRegistry[obj.type]?.toZPL(obj) ?? ''),
    '^XZ',
  ];

  return lines.join('\n');
}
