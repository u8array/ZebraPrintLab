import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatLogmarsHri } from "./hriFormatters";
import { LOGMARS_TEXT_ABOVE_GAP_DOTS } from "../components/Canvas/bwipConstants";
export type { Barcode1DProps as LogmarsProps } from "./barcode1d";

export const logmarsCoreConfig: Barcode1DCoreConfig = {
  label: "LOGMARS",
  icon: "LOG",
  defaultContent: "LOGMARS1",
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^BL${p.rotation},${p.height},${interp}`;
  },
  hri: {
    textAbove: true,
    aboveGapDots: LOGMARS_TEXT_ABOVE_GAP_DOTS,
    formatHri: formatLogmarsHri,
  },
};

export const logmars = createBarcode1DCore(logmarsCoreConfig);
