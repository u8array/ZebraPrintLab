import { createBarcode1DPanel } from './barcode1d.panel';

export const ean13Panel = createBarcode1DPanel({
  zplCommand: '^BE',
  locale: (t) => t.registry.ean13,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9', maxLength: 12 },
  hriAboveConfigurable: true,
});
