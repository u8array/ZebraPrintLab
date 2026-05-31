import { createBarcode1DPanel } from './barcode1d.panel';

export const ean8Panel = createBarcode1DPanel({
  locale: (t) => t.registry.ean8,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9', maxLength: 7 },
});
