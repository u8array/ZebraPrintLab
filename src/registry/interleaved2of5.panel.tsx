import { createBarcode1DPanel } from './barcode1d.panel';

export const interleaved2of5Panel = createBarcode1DPanel({
  zplCommand: '^B2',
  locale: (t) => t.registry.interleaved2of5,
  hasCheckDigit: true,
  contentSpec: { charset: '0-9' },
  hriAboveConfigurable: true,
});
