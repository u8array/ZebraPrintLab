import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatCode39Hri } from './hriFormatters';
export type { Barcode1DProps as Code39Props } from './barcode1d';

export const code39CoreConfig: Barcode1DCoreConfig = {
  label: 'Code 39',
  icon: '|·|',
  defaultContent: 'CODE39',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^B3${p.rotation},${check},${p.height},${interp},N`;
  },
  hri: { formatHri: formatCode39Hri },
};

export const code39 = createBarcode1DCore(code39CoreConfig);
