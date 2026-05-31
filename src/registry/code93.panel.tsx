import { createBarcode1DPanel } from './barcode1d.panel';

export const code93Panel = createBarcode1DPanel({
  locale: (t) => t.registry.code93,
  hasCheckDigit: true,
});
