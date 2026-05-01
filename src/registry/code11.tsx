import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as Code11Props } from "./barcode1d";

export const code11 = createBarcode1D({
  label: "Code 11",
  icon: "C11",
  defaultContent: "12345",
  hasCheckDigit: true,
  localeKey: "code11",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^B1N,${check},${p.height},${interp},N`;
  },
});
