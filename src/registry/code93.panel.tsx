import { createBarcode1DPanel } from './barcode1d.panel';

export const code93Panel = createBarcode1DPanel({
  zplCommand: '^BA',
  locale: (t) => t.registry.code93,
  hasCheckDigit: true,
  hriAboveConfigurable: true,
});
