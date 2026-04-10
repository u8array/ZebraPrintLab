import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as UpcEProps } from './barcode1d';

export const upce = createBarcode1D({
  label: 'UPC-E',
  icon: 'UPE',
  defaultContent: '012345',
  contentMaxLength: 6,
  contentPlaceholder: '6 digits',
  hasCheckDigit: false,
  localeKey: 'upce',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    return `^B9N,${p.height},${interp},N`;
  },
});
