import { createBarcode1DPanel } from './barcode1d.panel';

export const logmarsPanel = createBarcode1DPanel({
  locale: (t) => t.registry.logmars,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9A-Za-z\\-. $/+%' },
});
