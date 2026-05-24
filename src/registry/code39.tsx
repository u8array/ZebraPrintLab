import { createBarcode1D } from './barcode1d';
import type { ContentSpec } from './contentSpec';
import { formatCode39Hri } from './hriFormatters';
export type { Barcode1DProps as Code39Props } from './barcode1d';

const code39Spec: ContentSpec = { charset: '0-9A-Za-z\\-. $/+%' };

export const code39 = createBarcode1D({
  label: 'Code 39',
  icon: '|·|',
  defaultContent: 'CODE39',
  hasCheckDigit: true,
  locale: (t) => t.registry.code39,
  group: 'code-1d',
  contentSpec: code39Spec,
  zplCommand: (p) => {
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return `^B3${p.rotation},${check},${p.height},${interp},N`;
  },
  hri: { formatHri: formatCode39Hri },
});
