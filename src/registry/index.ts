import type { ObjectTypeDefinition } from '../types/ObjectType';
import { text } from './text.tsx';
import { code128 } from './code128.tsx';

export const ObjectRegistry: Record<string, ObjectTypeDefinition> = {
  text,
  code128,
  // ean13,
  // qr,
  // box,
  // line,
};
