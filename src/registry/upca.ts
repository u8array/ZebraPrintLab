import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatUpcaHri } from './hriFormatters';
export type { Barcode1DProps as UpcAProps } from './barcode1d';

export const upcaCoreConfig: Barcode1DCoreConfig = {
  label: 'UPC-A',
  icon: 'UPC',
  defaultContent: '01234567890',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    // ^BU params: rotation, height, interpretation, above, checkDigit.
    // checkDigit=Y matches Zebra's default and the retail/UPC-A print
    // convention; the 12th digit floats right of the bars, analogous
    // to the system digit on the left.
    return `^BU${p.rotation},${p.height},${interp},N,Y`;
  },
  hri: { formatHri: formatUpcaHri },
};

export const upca = createBarcode1DCore(upcaCoreConfig);
