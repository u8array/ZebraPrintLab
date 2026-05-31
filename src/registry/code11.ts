import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as Code11Props } from "./barcode1d";

export const code11CoreConfig: Barcode1DCoreConfig = {
  label: "Code 11",
  icon: "C11",
  defaultContent: "12345",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^B1${p.rotation},${check},${p.height},${interp},N`;
  },
};

export const code11 = createBarcode1DCore(code11CoreConfig);
