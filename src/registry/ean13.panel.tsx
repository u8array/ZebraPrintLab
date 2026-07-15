import { createBarcode1DPanel } from './barcode1d.panel';

export const ean13Panel = createBarcode1DPanel({
  zplCommand: '^BE',
  locale: (t) => t.registry.ean13,
  hasCheckDigit: false,
  hriAboveConfigurable: true,
  eanValidation: 'ean13',
});
