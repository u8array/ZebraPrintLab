import { createBarcode1DPanel } from './barcode1d.panel';

export const upcEanExtensionPanel = createBarcode1DPanel({
  locale: (t) => t.registry.upcEanExtension,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9', maxLength: 5, validLengths: [2, 5] },
});
