import { createBarcode1D } from "./barcode1d";
import { formatLogmarsHri } from "./hriFormatters";
import { LOGMARS_TEXT_ABOVE_GAP_DOTS } from "../components/Canvas/bwipConstants";
export type { Barcode1DProps as LogmarsProps } from "./barcode1d";

export const logmars = createBarcode1D({
  label: "LOGMARS",
  icon: "LOG",
  defaultContent: "LOGMARS1",
  hasCheckDigit: false,
  locale: (t) => t.registry.logmars,
  group: 'code-1d',
  contentSpec: { charset: '0-9A-Za-z\\-. $/+%' },
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^BL${p.rotation},${p.height},${interp}`;
  },
  hri: {
    textAbove: true,
    aboveGapDots: LOGMARS_TEXT_ABOVE_GAP_DOTS,
    formatHri: formatLogmarsHri,
  },
});
