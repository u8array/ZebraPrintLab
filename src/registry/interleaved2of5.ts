import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as Interleaved2of5Props } from './barcode1d';

export const interleaved2of5CoreConfig: Barcode1DCoreConfig = {
  label: 'Interleaved 2 of 5',
  icon: 'I25',
  defaultContent: '12345678',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^B2${p.rotation},${p.height},${interp},N,${check}`;
  },
};

export const interleaved2of5 = createBarcode1DCore(interleaved2of5CoreConfig);
