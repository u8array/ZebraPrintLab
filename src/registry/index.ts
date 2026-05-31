import type { ObjectTypeCore, ObjectTypeUi } from '../types/ObjectType';

export type { LeafObject } from './leafObject';

import { text } from './text';
import { textPanel } from './text.panel';
import { code128 } from './code128';
import { code128Panel } from './code128.panel';
import { code39 } from './code39';
import { code39Panel } from './code39.panel';
import { ean13 } from './ean13';
import { ean13Panel } from './ean13.panel';
import { qrcode } from './qrcode';
import { qrcodePanel } from './qrcode.panel';
import { datamatrix } from './datamatrix';
import { datamatrixPanel } from './datamatrix.panel';
import { box } from './box';
import { boxPanel } from './box.panel';
import { ellipse } from './ellipse';
import { ellipsePanel } from './ellipse.panel';
import { line } from './line';
import { linePanel } from './line.panel';
import { serial } from './serial';
import { serialPanel } from './serial.panel';
import { image } from './image';
import { imagePanel } from './image.panel';
import { upca } from './upca';
import { upcaPanel } from './upca.panel';
import { ean8 } from './ean8';
import { ean8Panel } from './ean8.panel';
import { upce } from './upce';
import { upcePanel } from './upce.panel';
import { interleaved2of5 } from './interleaved2of5';
import { interleaved2of5Panel } from './interleaved2of5.panel';
import { code93 } from './code93';
import { code93Panel } from './code93.panel';
import { pdf417 } from './pdf417';
import { pdf417Panel } from './pdf417.panel';
import { code11 } from './code11';
import { code11Panel } from './code11.panel';
import { industrial2of5 } from './industrial2of5';
import { industrial2of5Panel } from './industrial2of5.panel';
import { standard2of5 } from './standard2of5';
import { standard2of5Panel } from './standard2of5.panel';
import { codabar } from './codabar';
import { codabarPanel } from './codabar.panel';
import { logmars } from './logmars';
import { logmarsPanel } from './logmars.panel';
import { msi } from './msi';
import { msiPanel } from './msi.panel';
import { plessey } from './plessey';
import { plesseyPanel } from './plessey.panel';
import { gs1databar } from './gs1databar';
import { gs1databarPanel } from './gs1databar.panel';
import { planet } from './planet';
import { planetPanel } from './planet.panel';
import { postal } from './postal';
import { postalPanel } from './postal.panel';
import { aztec } from './aztec';
import { aztecPanel } from './aztec.panel';
import { micropdf417 } from './micropdf417';
import { micropdf417Panel } from './micropdf417.panel';
import { codablock } from './codablock';
import { codablockPanel } from './codablock.panel';
import { upcEanExtension } from './upcEanExtension';
import { upcEanExtensionPanel } from './upcEanExtension.panel';
import { code49 } from './code49';
import { code49Panel } from './code49.panel';
import { maxicode } from './maxicode';
import { maxicodePanel } from './maxicode.panel';
import { symbol } from './symbol';
import { symbolPanel } from './symbol.panel';

export const BARCODE_1D_TYPES = new Set([
  'code128', 'code39', 'ean13', 'ean8', 'upca', 'upce', 'interleaved2of5', 'code93',
  'code11', 'industrial2of5', 'standard2of5', 'codabar', 'logmars', 'msi', 'plessey',
  'gs1databar', 'planet', 'postal', 'upcEanExtension', 'code49',
]);

export const STACKED_2D_TYPES = new Set(['pdf417', 'micropdf417', 'codablock']);

// `any`: each entry has a different concrete `P`. Bundled `.tsx` entries
// satisfy both maps via structural typing; discriminated map deferred until
// all entries split (Stage 7).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectRegistry: Record<string, ObjectTypeCore<any>> = {
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
  maxicode,
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

/** Per-type PropertiesPanel components, keyed by registry type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectPanels: Record<string, ObjectTypeUi<any>> = {
  text: textPanel,
  symbol: symbolPanel,
  code128: code128Panel,
  ean13: ean13Panel,
  upca: upcaPanel,
  code39: code39Panel,
  interleaved2of5: interleaved2of5Panel,
  gs1databar: gs1databarPanel,
  ean8: ean8Panel,
  upce: upcePanel,
  upcEanExtension: upcEanExtensionPanel,
  code49: code49Panel,
  logmars: logmarsPanel,
  code93: code93Panel,
  codabar: codabarPanel,
  code11: code11Panel,
  industrial2of5: industrial2of5Panel,
  standard2of5: standard2of5Panel,
  msi: msiPanel,
  plessey: plesseyPanel,
  qrcode: qrcodePanel,
  datamatrix: datamatrixPanel,
  pdf417: pdf417Panel,
  aztec: aztecPanel,
  maxicode: maxicodePanel,
  micropdf417: micropdf417Panel,
  codablock: codablockPanel,
  planet: planetPanel,
  postal: postalPanel,
  box: boxPanel,
  ellipse: ellipsePanel,
  line: linePanel,
  serial: serialPanel,
  image: imagePanel,
};
