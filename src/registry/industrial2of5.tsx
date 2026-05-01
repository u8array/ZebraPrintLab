import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as Industrial2of5Props } from "./barcode1d";

export const industrial2of5 = createBarcode1D({
  label: "Industrial 2 of 5",
  icon: "I25",
  defaultContent: "12345678",
  hasCheckDigit: false,
  localeKey: "industrial2of5",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^BIN,${p.height},${interp},N`;
  },
});
