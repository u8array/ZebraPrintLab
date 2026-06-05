import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as PlesseyProps } from "./barcode1d";

export const plesseyCoreConfig: Barcode1DCoreConfig = {
  label: "Plessey",
  icon: "PLS",
  defaultContent: "12345678",
  group: 'code-1d',
  // Plessey uses 2:1 wide:narrow ratio (same as MSI), so override ZPL default of 3.0
  byRatio: 2,
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^BP${p.rotation},${check},${p.height},${interp},N`;
  },
};

export const plessey = createBarcode1DCore(plesseyCoreConfig);
