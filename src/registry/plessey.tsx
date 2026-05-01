import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as PlesseyProps } from "./barcode1d";

export const plessey = createBarcode1D({
  label: "Plessey",
  icon: "PLS",
  defaultContent: "12345678",
  hasCheckDigit: true,
  localeKey: "plessey",
  group: 'code-1d',
  // Plessey uses 2:1 wide:narrow ratio (same as MSI); override ZPL default of 3.0
  byRatio: 2,
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^BPN,${check},${p.height},${interp},N`;
  },
});
