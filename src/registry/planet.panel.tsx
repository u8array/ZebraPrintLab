import { createBarcode1DPanel } from './barcode1d.panel';

export const planetPanel = createBarcode1DPanel({
  zplCommand: '^B5',
  locale: (t) => t.registry.planet,
  hasCheckDigit: false,
  hriAboveConfigurable: true,
});
