import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as UpcAProps } from './barcode1d';

export const upca = createBarcode1D({
  label: 'UPC-A',
  icon: 'UPC',
  defaultContent: '01234567890',
  contentMaxLength: 11,
  hasCheckDigit: false,
  localeKey: 'upca',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    return `^BUN,${p.height},${interp},N,N`;
  },
});
