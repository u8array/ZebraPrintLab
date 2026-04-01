import type { ObjectTypeDefinition } from '../types/ObjectType';
import { text } from './text';
import { code128 } from './code128';

export const ObjectRegistry: Record<string, ObjectTypeDefinition> = {
  text,
  code128,
  // ean13,
  // qr,
  // box,
  // line,
};
