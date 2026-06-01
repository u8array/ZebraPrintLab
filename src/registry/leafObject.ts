import type { LabelObjectBase } from '../types/LabelObject';
import type { ObjectTypeCore, ObjectTypeUi } from '../types/ObjectType';
import type { TextProps } from './text';
import type { Code128Props } from './code128';
import type { Code39Props } from './code39';
import type { Ean13Props } from './ean13';
import type { QrCodeProps } from './qrcode';
import type { DataMatrixProps } from './datamatrix';
import type { BoxProps } from './box';
import type { EllipseProps } from './ellipse';
import type { LineProps } from './line';
import type { SerialProps } from './serial';
import type { ImageProps } from './image';
import type { UpcAProps } from './upca';
import type { Ean8Props } from './ean8';
import type { UpcEProps } from './upce';
import type { Interleaved2of5Props } from './interleaved2of5';
import type { Code93Props } from './code93';
import type { Pdf417Props } from './pdf417';
import type { Code11Props } from './code11';
import type { Industrial2of5Props } from './industrial2of5';
import type { Standard2of5Props } from './standard2of5';
import type { CodabarProps } from './codabar';
import type { LogmarsProps } from './logmars';
import type { MsiProps } from './msi';
import type { PlesseyProps } from './plessey';
import type { Gs1DatabarProps } from './gs1databar';
import type { PlanetProps } from './planet';
import type { PostalProps } from './postal';
import type { AztecProps } from './aztec';
import type { MicroPdf417Props } from './micropdf417';
import type { CodablockProps } from './codablock';
import type { UpcEanExtensionProps } from './upcEanExtension';
import type { Code49Props } from './code49';
import type { MaxicodeProps } from './maxicode';
import type { Tlc39Props } from './tlc39';
import type { SymbolProps } from './symbol';

/** Single-branch shape for one registry type: the common base plus a
 *  literal `type` discriminator and that type's props. */
type Leaf<T extends string, P extends object> = LabelObjectBase & { type: T; props: P };

/** Discriminated union of every registry-backed leaf type. Type-only so
 *  `types/Group.ts` can import it without dragging the runtime registry. */
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
  | Leaf<'maxicode', MaxicodeProps>
  | Leaf<'tlc39', Tlc39Props>
  | Leaf<'symbol', SymbolProps>;

/** Every registered leaf-type discriminator. */
export type LeafType = LeafObject['type'];

/** Props for a given leaf type, extracted via the discriminator. */
export type PropsFor<T extends LeafType> = Extract<LeafObject, { type: T }>['props'];

/** Type-safe ObjectRegistry shape: each key carries the matching Core entry. */
export type ObjectRegistryMap = { [T in LeafType]: ObjectTypeCore<PropsFor<T>> };

/** Type-safe ObjectPanels shape: each key carries the matching Ui entry. */
export type ObjectPanelsMap = { [T in LeafType]: ObjectTypeUi<PropsFor<T>> };
