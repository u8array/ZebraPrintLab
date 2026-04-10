import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as Interleaved2of5Props } from './barcode1d';

export const interleaved2of5 = createBarcode1D({
  label: 'Interleaved 2 of 5',
  icon: 'I25',
  defaultContent: '12345678',
  hasCheckDigit: true,
  localeKey: 'interleaved2of5',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^B2N,${p.height},${interp},N,${check}`;
  },
});
