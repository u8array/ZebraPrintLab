import { eanCheckDigit, upceCheckDigit } from '../lib/barcodeCheckDigits';

/**
 * HRI text formatters per 1D symbology. Each takes the user-provided
 * content string and returns the full HRI line the canvas should display.
 * Pure functions; kept here (not inline in each leaf) so they can be
 * unit-tested independently and re-used across the canvas + any future
 * non-canvas renderer (export, preview, …).
 *
 * EAN/UPC formatters pad short content to the spec length so the
 * displayed HRI matches what bwip actually encoded.
 */

export function formatEan13Hri(content: string): string {
  const d12 = content.replace(/\D/g, '').slice(0, 12).padEnd(12, '0');
  return d12 + eanCheckDigit(d12, 1, 3);
}

export function formatEan8Hri(content: string): string {
  const d7 = content.replace(/\D/g, '').slice(0, 7).padEnd(7, '0');
  return d7 + eanCheckDigit(d7, 3, 1);
}

export function formatUpcaHri(content: string): string {
  const d11 = content.replace(/\D/g, '').slice(0, 11).padEnd(11, '0');
  return d11 + eanCheckDigit(d11, 3, 1);
}

export function formatUpceHri(content: string): string {
  const d6 = content.replace(/\D/g, '').slice(0, 6).padEnd(6, '0');
  return `0${d6}${upceCheckDigit(d6)}`;
}

export function formatCode39Hri(content: string): string {
  return `*${content}*`;
}

const LOGMARS_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

export function formatLogmarsHri(content: string): string {
  let sum = 0;
  for (const c of content) {
    const idx = LOGMARS_CHARSET.indexOf(c.toUpperCase());
    if (idx >= 0) sum += idx;
  }
  return `${content}${LOGMARS_CHARSET[sum % 43] ?? ''}`;
}

/** ^BS shows the supplement as a single 2- or 5-digit string, padded
 *  to whichever variant bwip actually rendered (anything other than 2
 *  becomes the 5-digit form). */
export function formatUpcEanExtensionHri(content: string): string {
  const t = content.replace(/\D/g, '');
  return t.length === 2 ? t : t.slice(0, 5).padEnd(5, '0');
}
