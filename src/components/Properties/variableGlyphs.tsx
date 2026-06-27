/** Inline outline glyphs shared by the Variable-Builder palette, inspector and
 *  locked serial editor. `currentColor` so the parent's text colour drives them. */

export const ClockGlyph = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline-block align-[-2px]" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8V8l2.2 1.4" strokeLinecap="round" />
  </svg>
);

export const SerialGlyph = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-[-2px]" aria-hidden="true">
    <path d="M2 13h3v-3h3V7h3V4h3" />
  </svg>
);
