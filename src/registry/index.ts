import type { ObjectTypeCore } from '../types/ObjectType';
import type { LeafType, ObjectRegistryMap } from './leafObject';

export type { LeafObject, LeafType } from './leafObject';

import { text } from './text';
import { code128 } from './code128';
import { code39 } from './code39';
import { ean13 } from './ean13';
import { qrcode } from './qrcode';
import { datamatrix } from './datamatrix';
import { box } from './box';
import { ellipse } from './ellipse';
import { line } from './line';
import { serial } from './serial';
import { image } from './image';
import { upca } from './upca';
import { ean8 } from './ean8';
import { upce } from './upce';
import { interleaved2of5 } from './interleaved2of5';
import { code93 } from './code93';
import { pdf417 } from './pdf417';
import { code11 } from './code11';
import { industrial2of5 } from './industrial2of5';
import { standard2of5 } from './standard2of5';
import { codabar } from './codabar';
import { logmars } from './logmars';
import { msi } from './msi';
import { plessey } from './plessey';
import { gs1databar } from './gs1databar';
import { planet } from './planet';
import { postal } from './postal';
import { aztec } from './aztec';
import { micropdf417 } from './micropdf417';
import { codablock } from './codablock';
import { upcEanExtension } from './upcEanExtension';
import { code49 } from './code49';
import { maxicode } from './maxicode';
import { symbol } from './symbol';

export const BARCODE_1D_TYPES = new Set([
  'code128', 'code39', 'ean13', 'ean8', 'upca', 'upce', 'interleaved2of5', 'code93',
  'code11', 'industrial2of5', 'standard2of5', 'codabar', 'logmars', 'msi', 'plessey',
  'gs1databar', 'planet', 'postal', 'upcEanExtension', 'code49',
]);

export const STACKED_2D_TYPES = new Set(['pdf417', 'micropdf417', 'codablock']);

// satisfies = exhaustiveness check; export type stays permissive.
const _ObjectRegistry = {
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
} satisfies ObjectRegistryMap;

/** Per-type Core entries. Literal-key access catches typos; use
 *  {@link getEntry} for dynamic `LabelObject['type']` lookups. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ObjectRegistry: Record<LeafType, ObjectTypeCore<any>> = _ObjectRegistry;

/** Dynamic lookup for `LabelObject['type']`; undefined for non-leaf (e.g. `'group'`). */
export function getEntry(type: string): (typeof ObjectRegistry)[LeafType] | undefined {
  return (ObjectRegistry as Record<string, (typeof ObjectRegistry)[LeafType] | undefined>)[type];
}
