import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as Code128Props } from './barcode1d';

export const code128CoreConfig: Barcode1DCoreConfig = {
  label: 'Code 128',
  icon: '|||',
  defaultContent: '12345678',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^BC${p.rotation},${p.height},${interp},N,${check}`;
  },
};

export const code128 = createBarcode1DCore(code128CoreConfig);
