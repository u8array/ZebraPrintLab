import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as PlesseyProps } from "./barcode1d";

export const plessey = createBarcode1D({
  label: "Plessey",
  icon: "PLS",
  defaultContent: "12345678",
  hasCheckDigit: true,
  localeKey: "plessey",
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^BPN,${check},${p.height},${interp},N`;
  },
});
