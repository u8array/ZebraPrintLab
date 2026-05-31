import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as Code93Props } from './barcode1d';

export const code93CoreConfig: Barcode1DCoreConfig = {
  label: 'Code 93',
  icon: '|93|',
  defaultContent: 'CODE93',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^BA${p.rotation},${p.height},${interp},N,${check}`;
  },
};

export const code93 = createBarcode1DCore(code93CoreConfig);
