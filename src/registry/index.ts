import type { ObjectTypeDefinition } from '../types/ObjectType';
import { text } from './text.tsx';
import { code128 } from './code128.tsx';
import { box } from './box.tsx';

export const ObjectRegistry: Record<string, ObjectTypeDefinition> = {
  text,
  code128,
  box,
  // ean13,
  // qr,
  // line,
};
