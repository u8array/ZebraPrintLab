import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as CodabarProps } from "./barcode1d";

export const codabar = createBarcode1D({
  label: "Codabar",
  icon: "CBA",
  defaultContent: "A12345B",
  hasCheckDigit: true,
  localeKey: "codabar",
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^BKN,${check},${p.height},${interp},N`;
  },
});
