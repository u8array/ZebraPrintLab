import { createBarcode1DPanel } from './barcode1d.panel';

export const industrial2of5Panel = createBarcode1DPanel({
  zplCommand: '^BI',
  locale: (t) => t.registry.industrial2of5,
  hasCheckDigit: false,
  contentSpec: { charset: '0-9' },
  hriAboveConfigurable: true,
});
