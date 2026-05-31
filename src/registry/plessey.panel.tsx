import { createBarcode1DPanel } from './barcode1d.panel';

export const plesseyPanel = createBarcode1DPanel({
  locale: (t) => t.registry.plessey,
  hasCheckDigit: true,
  contentSpec: { charset: '0-9A-Fa-f' },
});
