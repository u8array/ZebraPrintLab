import { createBarcode1DPanel } from './barcode1d.panel';

export const standard2of5Panel = createBarcode1DPanel({
  locale: (t) => t.registry.standard2of5,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9' },
});
