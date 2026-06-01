import type { ObjectTypeUi } from '../types/ObjectType';
import type { LeafType, ObjectPanelsMap } from './leafObject';

import { textPanel } from './text.panel';
import { symbolPanel } from './symbol.panel';
import { code128Panel } from './code128.panel';
import { ean13Panel } from './ean13.panel';
import { upcaPanel } from './upca.panel';
import { code39Panel } from './code39.panel';
import { interleaved2of5Panel } from './interleaved2of5.panel';
import { gs1databarPanel } from './gs1databar.panel';
import { ean8Panel } from './ean8.panel';
import { upcePanel } from './upce.panel';
import { upcEanExtensionPanel } from './upcEanExtension.panel';
import { code49Panel } from './code49.panel';
import { logmarsPanel } from './logmars.panel';
import { code93Panel } from './code93.panel';
import { codabarPanel } from './codabar.panel';
import { code11Panel } from './code11.panel';
import { industrial2of5Panel } from './industrial2of5.panel';
import { standard2of5Panel } from './standard2of5.panel';
import { msiPanel } from './msi.panel';
import { plesseyPanel } from './plessey.panel';
import { qrcodePanel } from './qrcode.panel';
import { datamatrixPanel } from './datamatrix.panel';
import { pdf417Panel } from './pdf417.panel';
import { aztecPanel } from './aztec.panel';
import { maxicodePanel } from './maxicode.panel';
import { micropdf417Panel } from './micropdf417.panel';
import { codablockPanel } from './codablock.panel';
import { tlc39Panel } from './tlc39.panel';
import { planetPanel } from './planet.panel';
import { postalPanel } from './postal.panel';
import { boxPanel } from './box.panel';
import { ellipsePanel } from './ellipse.panel';
import { linePanel } from './line.panel';
import { serialPanel } from './serial.panel';
import { imagePanel } from './image.panel';

// satisfies = exhaustiveness check; export type stays permissive.
const _ObjectPanels = {
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
  tlc39: tlc39Panel,
  planet: planetPanel,
  postal: postalPanel,
  box: boxPanel,
  ellipse: ellipsePanel,
  line: linePanel,
  serial: serialPanel,
  image: imagePanel,
} satisfies ObjectPanelsMap;

/** Per-type PropertiesPanel components. Literal-key access catches typos; use
 *  {@link getPanel} for dynamic lookups. UI-only import; lib/parser never pulls a `.panel.tsx`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectPanels: Record<LeafType, ObjectTypeUi<any>> = _ObjectPanels;

/** Dynamic lookup for `LabelObject['type']`; undefined for non-leaf. */
export function getPanel(type: string): (typeof ObjectPanels)[LeafType] | undefined {
  return (ObjectPanels as Record<string, (typeof ObjectPanels)[LeafType] | undefined>)[type];
}
