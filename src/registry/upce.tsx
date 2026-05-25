import { createBarcode1D } from './barcode1d';
import { formatUpceHri } from './hriFormatters';
export type { Barcode1DProps as UpcEProps } from './barcode1d';

export const upce = createBarcode1D({
  label: 'UPC-E',
  icon: 'UPE',
  defaultContent: '012345',
  hasCheckDigit: false,
  locale: (t) => t.registry.upce,
  group: 'code-1d',
  contentSpec: { charset: '0-9', maxLength: 6 },
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    // ^B9 params: rotation, height, interpretation, checkDigit.
    // checkDigit=Y matches Zebra's own default and the print
    // convention — the check digit floats right of the bars.
    return `^B9${p.rotation},${p.height},${interp},Y`;
  },
  hri: { formatHri: formatUpceHri },
});
