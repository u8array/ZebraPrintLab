import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as PlanetProps } from "./barcode1d";

export const planet = createBarcode1D({
  label: "Planet Code",
  icon: "✉P",
  defaultContent: "12345678901",
  hasCheckDigit: false,
  localeKey: "planet",
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^B5N,${p.height},${interp},N`;
  },
});
