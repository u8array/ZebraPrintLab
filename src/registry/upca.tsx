import { createBarcode1D } from './barcode1d';
import { formatUpcaHri } from './hriFormatters';
export type { Barcode1DProps as UpcAProps } from './barcode1d';

export const upca = createBarcode1D({
  label: 'UPC-A',
  icon: 'UPC',
  defaultContent: '01234567890',
  hasCheckDigit: false,
  locale: (t) => t.registry.upca,
  group: 'code-1d',
  contentSpec: { charset: '0-9', maxLength: 11 },
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    // ^BU params: rotation, height, interpretation, above, checkDigit.
    // checkDigit=Y matches Zebra's own default (we previously forced N
    // and the HRI line dropped the 12th digit) and the retail/UPC-A
    // print convention — the 12th digit floats right of the bars,
    // analogous to the system digit on the left.
    return `^BU${p.rotation},${p.height},${interp},N,Y`;
  },
  hri: { formatHri: formatUpcaHri },
});
