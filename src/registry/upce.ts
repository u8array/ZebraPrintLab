import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatUpceHri } from './hriFormatters';
export type { Barcode1DProps as UpcEProps } from './barcode1d';

export const upceCoreConfig: Barcode1DCoreConfig = {
  label: 'UPC-E',
  icon: 'UPE',
  defaultContent: '012345',
  group: 'code-1d',
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    // ^B9 params: rotation, height, interpretation, interpretationAbove.
    // Stay on Zebra's N default so Labelary renders HRI below the bars,
    // matching the editor; per-design position becomes a follow-up.
    return `^B9${p.rotation},${p.height},${interp},N`;
  },
  hri: { formatHri: formatUpceHri },
};

export const upce = createBarcode1DCore(upceCoreConfig);
