import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as Code93Props } from './barcode1d';

export const code93 = createBarcode1D({
  label: 'Code 93',
  icon: '|93|',
  defaultContent: 'CODE93',
  hasCheckDigit: true,
  localeKey: 'code93',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^BAN,${p.height},${interp},N,${check}`;
  },
});
