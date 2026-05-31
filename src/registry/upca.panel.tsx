import { createBarcode1DPanel } from './barcode1d.panel';

export const upcaPanel = createBarcode1DPanel({
  locale: (t) => t.registry.upca,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9', maxLength: 11 },
});
