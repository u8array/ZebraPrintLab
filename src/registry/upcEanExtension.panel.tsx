import { createBarcode1DPanel } from './barcode1d.panel';

export const upcEanExtensionPanel = createBarcode1DPanel({
  zplCommand: '^BS',
  locale: (t) => t.registry.upcEanExtension,
  hasCheckDigit: false,
});
