import { createBarcode1DPanel } from './barcode1d.panel';

export const msiPanel = createBarcode1DPanel({
  zplCommand: '^BM',
  locale: (t) => t.registry.msi,
  hasCheckDigit: true,
  hriAboveConfigurable: true,
});
