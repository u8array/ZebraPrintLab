import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as Code128Props } from './barcode1d';

export const code128CoreConfig: Barcode1DCoreConfig = {
  label: 'Code 128',
  icon: '|||',
  defaultContent: '12345678',
  group: 'code-1d',
  gs1Capable: true,
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    // m=D (UCC/EAN) turns a plain Code 128 into GS1-128; omit it otherwise so a
    // non-GS1 field round-trips as the bare command.
    const mode = p.gs1 ? ',D' : '';
    return `^BC${p.rotation},${p.height},${interp},${p.printInterpretationAbove ? 'Y' : 'N'},${check}${mode}`;
  },
};

export const code128 = createBarcode1DCore(code128CoreConfig);
