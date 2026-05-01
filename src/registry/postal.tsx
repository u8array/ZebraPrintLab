import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as PostalProps } from "./barcode1d";

export const postal = createBarcode1D({
  label: "POSTNET",
  icon: "✉Z",
  defaultContent: "12345",
  hasCheckDigit: false,
  localeKey: "postal",
  group: 'code-postal',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    // ^BZ{orientation},{height},{interp},{startStop}
    return `^BZN,${p.height},${interp},N`;
  },
});
