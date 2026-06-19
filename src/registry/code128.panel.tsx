import { createBarcode1DPanel } from './barcode1d.panel';

export const code128Panel = createBarcode1DPanel({
  zplCommand: '^BC',
  locale: (t) => t.registry.code128,
  hasCheckDigit: true,
  hriAboveConfigurable: true,
});
