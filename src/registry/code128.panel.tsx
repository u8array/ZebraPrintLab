import { createBarcode1DPanel } from './barcode1d.panel';
import { code128CoreConfig } from './code128';

export const code128Panel = createBarcode1DPanel({
  zplCommand: '^BC',
  locale: (t) => t.registry.code128,
  hasCheckDigit: true,
  hriAboveConfigurable: true,
  // Single-source the capability from the core config so emit + UI never skew.
  gs1Capable: code128CoreConfig.gs1Capable,
});
