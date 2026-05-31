import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as Industrial2of5Props } from "./barcode1d";

export const industrial2of5CoreConfig: Barcode1DCoreConfig = {
  label: "Industrial 2 of 5",
  icon: "I25",
  defaultContent: "12345678",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^BI${p.rotation},${p.height},${interp},N`;
  },
};

export const industrial2of5 = createBarcode1DCore(industrial2of5CoreConfig);
