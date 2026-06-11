import { createBarcode1DCore, type Barcode1DCoreConfig } from './barcode1d';
import { formatUpceHri, upceData6FromFd } from './hriFormatters';
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
  // ^B9 needs the number-system digit in ^FD (else Labelary lints/re-pads).
  // NS-aware so an already-prefixed content is not double-prefixed. NS
  // assumed 0 (spec allows 0 or 1; NS 1 round-trips lossily, see ticket).
  fdContent: (c) => `0${upceData6FromFd(c)}`,
};

export const upce = createBarcode1DCore(upceCoreConfig);
