import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as Code128Props } from './barcode1d';

export const code128 = createBarcode1D({
  label: 'Code 128',
  icon: '|||',
  defaultContent: '12345678',
  hasCheckDigit: true,
  locale: (t) => t.registry.code128,
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^BC${p.rotation},${p.height},${interp},N,${check}`;
  },
});
