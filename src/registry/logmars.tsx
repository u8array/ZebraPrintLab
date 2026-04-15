import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as LogmarsProps } from "./barcode1d";

export const logmars = createBarcode1D({
  label: "LOGMARS",
  icon: "LOG",
  defaultContent: "LOGMARS1",
  hasCheckDigit: false,
  localeKey: "logmars",
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^BLN,${p.height},${interp}`;
  },
});
