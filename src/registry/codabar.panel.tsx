import { createBarcode1DPanel } from './barcode1d.panel';

export const codabarPanel = createBarcode1DPanel({
  zplCommand: '^BK',
  locale: (t) => t.registry.codabar,
  hasCheckDigit: true,
  contentSpec: { charset: '0-9A-Da-d\\-$:/.+' },
  hriAboveConfigurable: true,
});
