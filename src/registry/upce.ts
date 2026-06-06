import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatUpceHri } from './hriFormatters';
export type { Barcode1DProps as UpcEProps } from './barcode1d';

export const upceCoreConfig: Barcode1DCoreConfig = {
  label: 'UPC-E',
  icon: 'UPE',
  defaultContent: '012345',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    // ^B9 params: rotation, height, interpretation, checkDigit.
    // checkDigit=Y matches Zebra's own default and the print
    // convention; the check digit floats right of the bars.
    return `^B9${p.rotation},${p.height},${interp},Y`;
  },
  hri: { formatHri: formatUpceHri },
};

export const upce = createBarcode1DCore(upceCoreConfig);
