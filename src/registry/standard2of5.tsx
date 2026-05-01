import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as Standard2of5Props } from "./barcode1d";

export const standard2of5 = createBarcode1D({
  label: "Standard 2 of 5",
  icon: "S25",
  defaultContent: "12345678",
  hasCheckDigit: false,
  localeKey: "standard2of5",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^BJN,${p.height},${interp},N`;
  },
});
