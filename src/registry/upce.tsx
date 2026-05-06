import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as UpcEProps } from './barcode1d';

export const upce = createBarcode1D({
  label: 'UPC-E',
  icon: 'UPE',
  defaultContent: '012345',
  hasCheckDigit: false,
  localeKey: 'upce',
  group: 'code-1d',
  contentSpec: { charset: '0-9', maxLength: 6 },
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    return `^B9N,${p.height},${interp},N`;
  },
});
