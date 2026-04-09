import type { ObjectTypeDefinition, ObjectGroup, LabelObjectBase } from '../types/ObjectType';
import { text } from './text.tsx';
import type { TextProps } from './text.tsx';
import { code128 } from './code128.tsx';
import type { Code128Props } from './code128.tsx';
import { code39 } from './code39.tsx';
import type { Code39Props } from './code39.tsx';
import { ean13 } from './ean13.tsx';
import type { Ean13Props } from './ean13.tsx';
import { qrcode } from './qrcode.tsx';
import type { QrCodeProps } from './qrcode.tsx';
import { datamatrix } from './datamatrix.tsx';
import type { DataMatrixProps } from './datamatrix.tsx';
import { box } from './box.tsx';
import type { BoxProps } from './box.tsx';
import { ellipse } from './ellipse.tsx';
import type { EllipseProps } from './ellipse.tsx';
import { line } from './line.tsx';
import type { LineProps } from './line.tsx';

export type LabelObject =
  | (LabelObjectBase & { type: 'text'; props: TextProps })
  | (LabelObjectBase & { type: 'code128'; props: Code128Props })
  | (LabelObjectBase & { type: 'code39'; props: Code39Props })
  | (LabelObjectBase & { type: 'ean13'; props: Ean13Props })
  | (LabelObjectBase & { type: 'qrcode'; props: QrCodeProps })
  | (LabelObjectBase & { type: 'datamatrix'; props: DataMatrixProps })
  | (LabelObjectBase & { type: 'box'; props: BoxProps })
  | (LabelObjectBase & { type: 'ellipse'; props: EllipseProps })
  | (LabelObjectBase & { type: 'line'; props: LineProps });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectRegistry: Record<string, ObjectTypeDefinition<any>> = {
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
