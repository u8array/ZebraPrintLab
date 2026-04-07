import type { ObjectTypeDefinition, ObjectGroup } from '../types/ObjectType';
import { text } from './text.tsx';
import { code128 } from './code128.tsx';
import { code39 } from './code39.tsx';
import { qrcode } from './qrcode.tsx';
import { box } from './box.tsx';
import { line } from './line.tsx';

export const ObjectRegistry: Record<string, ObjectTypeDefinition<object>> = {
  text,
  code128,
  code39,
  qrcode,
  box,
  line,
};

export const PALETTE_GROUPS: { key: ObjectGroup; label: string }[] = [
  { key: 'text',  label: 'Text' },
  { key: 'code',  label: 'Codes' },
  { key: 'shape', label: 'Shapes' },
];
