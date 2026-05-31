import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as PostalProps } from "./barcode1d";

export const postalCoreConfig: Barcode1DCoreConfig = {
  label: "POSTNET",
  icon: "✉Z",
  defaultContent: "12345",
  group: 'code-postal',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    // ^BZ{orientation},{height},{interp},{startStop}
    return `^BZ${p.rotation},${p.height},${interp},N`;
  },
};

export const postal = createBarcode1DCore(postalCoreConfig);
