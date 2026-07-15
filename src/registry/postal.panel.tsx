import { createBarcode1DPanel } from './barcode1d.panel';

export const postalPanel = createBarcode1DPanel({
  zplCommand: '^BZ',
  locale: (t) => t.registry.postal,
  hasCheckDigit: false,
  hriAboveConfigurable: true,
});
