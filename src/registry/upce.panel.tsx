import { createBarcode1DPanel } from './barcode1d.panel';

export const upcePanel = createBarcode1DPanel({
  locale: (t) => t.registry.upce,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9', maxLength: 6 },
});
