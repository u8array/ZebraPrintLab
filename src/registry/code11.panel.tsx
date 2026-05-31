import { createBarcode1DPanel } from './barcode1d.panel';

export const code11Panel = createBarcode1DPanel({
  locale: (t) => t.registry.code11,
  hasCheckDigit: true,
  contentSpec: { charset: '0-9\\-' },
});
