import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
export type { Barcode1DProps as PlanetProps } from "./barcode1d";

export const planetCoreConfig: Barcode1DCoreConfig = {
  label: "Planet Code",
  icon: "✉P",
  defaultContent: "12345678901",
  group: 'code-postal',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? "Y" : "N";
    return `^B5${p.rotation},${p.height},${interp},N`;
  },
};

export const planet = createBarcode1DCore(planetCoreConfig);
