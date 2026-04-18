import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as Gs1DatabarProps } from "./barcode1d";

export const gs1databar = createBarcode1D({
  label: "GS1 Databar",
  icon: "GS1",
  defaultContent: "0112345678901",
  hasCheckDigit: false,
  localeKey: "gs1databar",
  zplCommand: (p) => {
    // ^BR{orientation},{symbology},{magnification},{separator},{height},{segments}
    // symbology 1 = omnidirectional
    return `^BRN,1,${p.moduleWidth},2,${p.height},1`;
  },
});
