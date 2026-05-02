import type { ObjectTypeDefinition, LabelObjectBase } from '../types/ObjectType';
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
import { code11 } from './code11.tsx';
import type { Code11Props } from './code11.tsx';
import { industrial2of5 } from './industrial2of5.tsx';
import type { Industrial2of5Props } from './industrial2of5.tsx';
import { standard2of5 } from './standard2of5.tsx';
import type { Standard2of5Props } from './standard2of5.tsx';
import { codabar } from './codabar.tsx';
import type { CodabarProps } from './codabar.tsx';
import { logmars } from './logmars.tsx';
import type { LogmarsProps } from './logmars.tsx';
import { msi } from './msi.tsx';
import type { MsiProps } from './msi.tsx';
import { plessey } from './plessey.tsx';
import type { PlesseyProps } from './plessey.tsx';
import { gs1databar } from './gs1databar.tsx';
import type { Gs1DatabarProps } from './gs1databar.tsx';
import { planet } from './planet.tsx';
import type { PlanetProps } from './planet.tsx';
import { postal } from './postal.tsx';
import type { PostalProps } from './postal.tsx';
import { aztec } from './aztec.tsx';
import type { AztecProps } from './aztec.tsx';
import { micropdf417 } from './micropdf417.tsx';
import type { MicroPdf417Props } from './micropdf417.tsx';
import { codablock } from './codablock.tsx';
import type { CodablockProps } from './codablock.tsx';

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
  | (LabelObjectBase & { type: 'pdf417'; props: Pdf417Props })
  | (LabelObjectBase & { type: 'code11'; props: Code11Props })
  | (LabelObjectBase & { type: 'industrial2of5'; props: Industrial2of5Props })
  | (LabelObjectBase & { type: 'standard2of5'; props: Standard2of5Props })
  | (LabelObjectBase & { type: 'codabar'; props: CodabarProps })
  | (LabelObjectBase & { type: 'logmars'; props: LogmarsProps })
  | (LabelObjectBase & { type: 'msi'; props: MsiProps })
  | (LabelObjectBase & { type: 'plessey'; props: PlesseyProps })
  | (LabelObjectBase & { type: 'gs1databar'; props: Gs1DatabarProps })
  | (LabelObjectBase & { type: 'planet'; props: PlanetProps })
  | (LabelObjectBase & { type: 'postal'; props: PostalProps })
  | (LabelObjectBase & { type: 'aztec'; props: AztecProps })
  | (LabelObjectBase & { type: 'micropdf417'; props: MicroPdf417Props })
  | (LabelObjectBase & { type: 'codablock'; props: CodablockProps });

export const BARCODE_1D_TYPES = new Set([
  'code128', 'code39', 'ean13', 'ean8', 'upca', 'upce', 'interleaved2of5', 'code93',
  'code11', 'industrial2of5', 'standard2of5', 'codabar', 'logmars', 'msi', 'plessey',
  'gs1databar', 'planet', 'postal',
]);

export const STACKED_2D_TYPES = new Set(['pdf417', 'micropdf417', 'codablock']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectRegistry: Record<string, ObjectTypeDefinition<any>> = {
  // text
  text,
  // code-1d (frequency order)
  code128,
  ean13,
  upca,
  code39,
  interleaved2of5,
  gs1databar,
  ean8,
  upce,
  logmars,
  code93,
  codabar,
  code11,
  industrial2of5,
  standard2of5,
  msi,
  plessey,
  // code-2d (frequency order)
  qrcode,
  datamatrix,
  pdf417,
  aztec,
  micropdf417,
  codablock,
  // code-postal
  planet,
  postal,
  // shape
  box,
  ellipse,
  line,
  serial,
  image,
};

