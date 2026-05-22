/**
 * Compact "Aa" glyph used as the Fonts tab icon. Heroicons has no
 * typography-themed icon at the right weight, so we inline a 16×16 SVG
 * that mirrors their stroke / fill aesthetic (currentColor, solid
 * sans glyphs centred on the viewBox). Sized in `em` via the `w-3.5
 * h-3.5` Tailwind utilities applied at the call site, matching every
 * other heroicon used in the tab strip.
 */
export function AaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="system-ui, sans-serif"
        fontSize="11"
        fontWeight="700"
        fontStyle="normal"
      >
        Aa
      </text>
    </svg>
  );
}
