import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as MsiProps } from "./barcode1d";

export const msi = createBarcode1D({
  label: "MSI",
  icon: "MSI",
  defaultContent: "12345678",
  hasCheckDigit: true,
  localeKey: "msi",
  group: 'code-1d',
  // MSI standard specifies a 2:1 wide:narrow ratio, which bwip-js hardcodes
  // internally. ZPL ^BY defaults to 3.0, so we must override to keep canvas
  // and Labelary preview in sync.
  byRatio: 2,
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    // ^BM format: ^BM[o,e,h,f,g] — check digit (e) comes before height (h)
    // A=Mod10, B=Mod11, C=Mod10+Mod10, D=Mod11+Mod10, N=none
    const checkType = p.checkDigit ? "A" : "N";
    return `^BMN,${checkType},${p.height},${interp},N`;
  },
});
