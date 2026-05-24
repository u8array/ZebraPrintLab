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
    return `^BU${p.rotation},${p.height},${interp},N,N`;
  },
  hri: { formatHri: formatUpcaHri },
});
