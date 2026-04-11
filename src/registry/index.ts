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
import { serial } from './serial.tsx';
import type { SerialProps } from './serial.tsx';
import { image } from './image.tsx';
import type { ImageProps } from './image.tsx';
import { upca } from './upca.tsx';
import type { UpcAProps } from './upca.tsx';
import { ean8 } from './ean8.tsx';
import type { Ean8Props } from './ean8.tsx';
import { upce } from './upce.tsx';
import type { UpcEProps } from './upce.tsx';
import { interleaved2of5 } from './interleaved2of5.tsx';
import type { Interleaved2of5Props } from './interleaved2of5.tsx';
import { code93 } from './code93.tsx';
import type { Code93Props } from './code93.tsx';
import { pdf417 } from './pdf417.tsx';
import type { Pdf417Props } from './pdf417.tsx';

export type LabelObject =
  | (LabelObjectBase & { type: 'text'; props: TextProps })
  | (LabelObjectBase & { type: 'code128'; props: Code128Props })
  | (LabelObjectBase & { type: 'code39'; props: Code39Props })
  | (LabelObjectBase & { type: 'ean13'; props: Ean13Props })
  | (LabelObjectBase & { type: 'qrcode'; props: QrCodeProps })
  | (LabelObjectBase & { type: 'datamatrix'; props: DataMatrixProps })
  | (LabelObjectBase & { type: 'box'; props: BoxProps })
  | (LabelObjectBase & { type: 'ellipse'; props: EllipseProps })
  | (LabelObjectBase & { type: 'line'; props: LineProps })
  | (LabelObjectBase & { type: 'serial'; props: SerialProps })
  | (LabelObjectBase & { type: 'image'; props: ImageProps })
  | (LabelObjectBase & { type: 'upca'; props: UpcAProps })
  | (LabelObjectBase & { type: 'ean8'; props: Ean8Props })
  | (LabelObjectBase & { type: 'upce'; props: UpcEProps })
  | (LabelObjectBase & { type: 'interleaved2of5'; props: Interleaved2of5Props })
  | (LabelObjectBase & { type: 'code93'; props: Code93Props })
  | (LabelObjectBase & { type: 'pdf417'; props: Pdf417Props });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectRegistry: Record<string, ObjectTypeDefinition<any>> = {
  text,
  code128,
  code39,
  ean13,
  upca,
  ean8,
  upce,
  interleaved2of5,
  code93,
  qrcode,
  datamatrix,
  pdf417,
  box,
  ellipse,
  line,
  serial,
  image,
};

export const PALETTE_GROUPS: { key: ObjectGroup; labelKey: 'groupText' | 'groupCodes' | 'groupShapes' }[] = [
  { key: 'text',  labelKey: 'groupText' },
  { key: 'code',  labelKey: 'groupCodes' },
  { key: 'shape', labelKey: 'groupShapes' },
];
