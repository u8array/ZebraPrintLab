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
import { upcEanExtension } from './upcEanExtension.tsx';
import type { UpcEanExtensionProps } from './upcEanExtension.tsx';
import { code49 } from './code49.tsx';
import type { Code49Props } from './code49.tsx';
import { symbol } from './symbol.tsx';
import type { SymbolProps } from './symbol.tsx';

/** Single-branch shape for one registry type: the common base plus a
 *  literal `type` discriminator and that type's props. Used to compose
 *  `LeafObject` so adding a new registry entry is a one-line union
 *  extension instead of a 60-character repetition. */
type Leaf<T extends string, P extends object> = LabelObjectBase & { type: T; props: P };

/** Leaf objects: every registry-backed type. These render to ZPL and
 *  have a PropertiesPanel. The tree-level union `LabelObject` (which
 *  also covers `GroupObject`) lives in `types/Group.ts`. */
export type LeafObject =
  | Leaf<'text', TextProps>
  | Leaf<'code128', Code128Props>
  | Leaf<'code39', Code39Props>
  | Leaf<'ean13', Ean13Props>
  | Leaf<'qrcode', QrCodeProps>
  | Leaf<'datamatrix', DataMatrixProps>
  | Leaf<'box', BoxProps>
  | Leaf<'ellipse', EllipseProps>
  | Leaf<'line', LineProps>
  | Leaf<'serial', SerialProps>
  | Leaf<'image', ImageProps>
  | Leaf<'upca', UpcAProps>
  | Leaf<'ean8', Ean8Props>
  | Leaf<'upce', UpcEProps>
  | Leaf<'interleaved2of5', Interleaved2of5Props>
  | Leaf<'code93', Code93Props>
  | Leaf<'pdf417', Pdf417Props>
  | Leaf<'code11', Code11Props>
  | Leaf<'industrial2of5', Industrial2of5Props>
  | Leaf<'standard2of5', Standard2of5Props>
  | Leaf<'codabar', CodabarProps>
  | Leaf<'logmars', LogmarsProps>
  | Leaf<'msi', MsiProps>
  | Leaf<'plessey', PlesseyProps>
  | Leaf<'gs1databar', Gs1DatabarProps>
  | Leaf<'planet', PlanetProps>
  | Leaf<'postal', PostalProps>
  | Leaf<'aztec', AztecProps>
  | Leaf<'micropdf417', MicroPdf417Props>
  | Leaf<'codablock', CodablockProps>
  | Leaf<'upcEanExtension', UpcEanExtensionProps>
  | Leaf<'code49', Code49Props>
  | Leaf<'symbol', SymbolProps>;

export const BARCODE_1D_TYPES = new Set([
  'code128', 'code39', 'ean13', 'ean8', 'upca', 'upce', 'interleaved2of5', 'code93',
  'code11', 'industrial2of5', 'standard2of5', 'codabar', 'logmars', 'msi', 'plessey',
  'gs1databar', 'planet', 'postal', 'upcEanExtension', 'code49',
]);

export const STACKED_2D_TYPES = new Set(['pdf417', 'micropdf417', 'codablock']);

// `any` is necessary here: each registry entry is an `ObjectTypeDefinition<P>`
// with a different concrete `P`. Using `object` instead of `any` triggers
// function-parameter contravariance (toZPL expects a specific props shape),
// which TS rejects under strict.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectRegistry: Record<string, ObjectTypeDefinition<any>> = {
  // text
  text,
  symbol,
  // code-1d (frequency order)
  code128,
  ean13,
  upca,
  code39,
  interleaved2of5,
  gs1databar,
  ean8,
  upce,
  upcEanExtension,
  code49,
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

