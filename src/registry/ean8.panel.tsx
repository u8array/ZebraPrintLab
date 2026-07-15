import { createBarcode1DPanel } from './barcode1d.panel';

export const ean8Panel = createBarcode1DPanel({
  zplCommand: '^B8',
  locale: (t) => t.registry.ean8,
  hasCheckDigit: false,
  hriAboveConfigurable: true,
  eanValidation: 'ean8',
});
