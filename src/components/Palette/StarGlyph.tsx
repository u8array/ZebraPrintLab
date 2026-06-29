/** Favorites star, shared by the palette tab icon and the search pin button.
 *  Filled = active/pinned (accent), outline = inactive/unpinned. */
export function StarGlyph({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.3}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.6l1.85 3.74 4.13.6-2.99 2.91.71 4.11L8 11.52l-3.7 1.94.71-4.11L2.02 6.44l4.13-.6z" />
    </svg>
  );
}
