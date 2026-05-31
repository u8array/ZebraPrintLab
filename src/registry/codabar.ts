import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as CodabarProps } from "./barcode1d";

export const codabarCoreConfig: Barcode1DCoreConfig = {
  label: "Codabar",
  icon: "CBA",
  defaultContent: "A12345A",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^BK${p.rotation},${check},${p.height},${interp},N`;
  },
};

export const codabar = createBarcode1DCore(codabarCoreConfig);
