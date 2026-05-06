import { createBarcode1D } from "./barcode1d";
export type { Barcode1DProps as Gs1DatabarProps } from "./barcode1d";

export const gs1databar = createBarcode1D({
  label: "GS1 Databar",
  icon: "GS1",
  defaultContent: "0112345678901",
  hasCheckDigit: false,
  localeKey: "gs1databar",
  group: 'code-1d',
  contentSpec: { charset: '0-9' },
  // GS1 Databar Omnidirectional has a symbology-fixed height; Zebra/Labelary
  // ignore the ^BR height parameter for this variant. Disabling resize and the
  // height input keeps the designer honest about what affects the print.
  heightLocked: true,
  // ZPL ^BR has no HRI parameter — Labelary never prints text under the bars.
  interpretationLocked: true,
  zplCommand: (p) => {
    // ^BR{orientation},{symbology},{magnification},{separator},{height},{segments}
    // symbology 1 = omnidirectional
    return `^BRN,1,${p.moduleWidth},2,${p.height},1`;
  },
});
