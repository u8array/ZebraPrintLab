import { createBarcode1DPanel } from './barcode1d.panel';

export const upcePanel = createBarcode1DPanel({
  zplCommand: '^B9',
  locale: (t) => t.registry.upce,
  hasCheckDigit: false,
  hriAboveConfigurable: true,
  eanValidation: 'upce',
});
