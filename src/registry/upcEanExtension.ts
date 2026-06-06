import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatUpcEanExtensionHri } from './hriFormatters';
import {
  upcSuppAboveGapDots,
  upcSuppFontDots,
} from '../components/Canvas/bwipConstants';
export type { Barcode1DProps as UpcEanExtensionProps } from './barcode1d';

/** UPC/EAN extension barcode (^BS); the 2- or 5-digit supplement
 *  printed alongside a UPC-A / EAN-13. Common uses: 5-digit ISBN
 *  price code on books, 2-digit issue number on magazines.
 *
 *  Standalone object by design: the user positions it manually next
 *  to the main barcode. Same `^BSo,h,f` ZPL syntax for both lengths;
 *  the canvas renderer picks `ean2` vs `ean5` from `content.length`.
 *  validLengths surfaces an inline warning when the field isn't 2
 *  or 5 digits (bwip-js / the printer reject other lengths).
 *  Default '51999' = $19.99 in the ISBN price-code form, the
 *  dominant use case. */

export const upcEanExtensionCoreConfig: Barcode1DCoreConfig = {
  label: 'UPC/EAN extension',
  icon: 'EXT',
  defaultContent: '51999',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    return `^BS${p.rotation},${p.height},${interp}`;
  },
  hri: {
    textAbove: true,
    aboveGapDots: upcSuppAboveGapDots,
    fontDots: upcSuppFontDots,
    formatHri: formatUpcEanExtensionHri,
  },
};

export const upcEanExtension = createBarcode1DCore(upcEanExtensionCoreConfig);
