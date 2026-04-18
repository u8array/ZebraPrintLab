import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as MsiProps } from "./barcode1d";

export const msi = createBarcode1D({
  label: "MSI",
  icon: "MSI",
  defaultContent: "12345678",
  hasCheckDigit: true,
  localeKey: "msi",
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    const check = p.checkDigit ? "Y" : "N";
    return `^BMN,${p.height},${interp},N,${check}`;
  },
});
