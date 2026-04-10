import { createBarcode1D } from './barcode1d';
export type { Barcode1DProps as Ean8Props } from './barcode1d';

export const ean8 = createBarcode1D({
  label: 'EAN-8',
  icon: 'E8',
  defaultContent: '1234567',
  contentMaxLength: 7,
  contentPlaceholder: '7 digits',
  hasCheckDigit: false,
  localeKey: 'ean8',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    return `^B8N,${p.height},${interp},N`;
  },
});
