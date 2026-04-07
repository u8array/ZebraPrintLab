import type { ObjectTypeDefinition, ObjectGroup } from '../types/ObjectType';
import { text } from './text.tsx';
import { code128 } from './code128.tsx';
import { code39 } from './code39.tsx';
import { ean13 } from './ean13.tsx';
import { qrcode } from './qrcode.tsx';
import { datamatrix } from './datamatrix.tsx';
import { box } from './box.tsx';
import { ellipse } from './ellipse.tsx';
import { line } from './line.tsx';

export const ObjectRegistry: Record<string, ObjectTypeDefinition<object>> = {
  text,
  code128,
  code39,
  ean13,
  qrcode,
  datamatrix,
  box,
  ellipse,
  line,
};

export const PALETTE_GROUPS: { key: ObjectGroup; label: string }[] = [
  { key: 'text',  label: 'Text' },
  { key: 'code',  label: 'Codes' },
  { key: 'shape', label: 'Shapes' },
];
