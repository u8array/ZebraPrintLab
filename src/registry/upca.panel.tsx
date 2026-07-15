import { createBarcode1DPanel } from './barcode1d.panel';

export const upcaPanel = createBarcode1DPanel({
  zplCommand: '^BU',
  locale: (t) => t.registry.upca,
  hasCheckDigit: false,
  hriAboveConfigurable: true,
  eanValidation: 'upca',
});
