import { createBarcode1DPanel } from './barcode1d.panel';

export const code39Panel = createBarcode1DPanel({
  locale: (t) => t.registry.code39,
  hasCheckDigit: true,
  contentSpec: { charset: '0-9A-Za-z\\-. $/+%' },
});
