import { createBarcode1DPanel } from './barcode1d.panel';

export const plesseyPanel = createBarcode1DPanel({
  zplCommand: '^BP',
  locale: (t) => t.registry.plessey,
  hasCheckDigit: true,
  hriAboveConfigurable: true,
});
