interface IconProps {
  className?: string;
}

// Align ops: a solid edge bar marks the reference edge; two bars of differing
// length snap their matching edge to it. Mirrors Figma/Affinity align glyphs.

/** Two bars flush to a solid left edge. */
export function AlignLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="2" y1="1.5" x2="2" y2="14.5" strokeWidth="1.5" />
      <rect x="3.5" y="4" width="9" height="3" strokeWidth="1" />
      <rect x="3.5" y="9" width="6" height="3" strokeWidth="1" />
    </svg>
  );
}

/** Two bars centred on a solid vertical mid-line. */
export function AlignHCenterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeWidth="1.5" />
      <rect x="3.5" y="4" width="9" height="3" strokeWidth="1" />
      <rect x="5" y="9" width="6" height="3" strokeWidth="1" />
    </svg>
  );
}

/** Two bars flush to a solid right edge. */
export function AlignRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="14" y1="1.5" x2="14" y2="14.5" strokeWidth="1.5" />
      <rect x="3.5" y="4" width="9" height="3" strokeWidth="1" />
      <rect x="6.5" y="9" width="6" height="3" strokeWidth="1" />
    </svg>
  );
}

/** Two bars flush to a solid top edge. */
export function AlignTopIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="1.5" y1="2" x2="14.5" y2="2" strokeWidth="1.5" />
      <rect x="4" y="3.5" width="3" height="9" strokeWidth="1" />
      <rect x="9" y="3.5" width="3" height="6" strokeWidth="1" />
    </svg>
  );
}

/** Two bars centred on a solid horizontal mid-line. */
export function AlignVMiddleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="1.5" y1="8" x2="14.5" y2="8" strokeWidth="1.5" />
      <rect x="4" y="3.5" width="3" height="9" strokeWidth="1" />
      <rect x="9" y="5" width="3" height="6" strokeWidth="1" />
    </svg>
  );
}

/** Two bars flush to a solid bottom edge. */
export function AlignBottomIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="1.5" y1="14" x2="14.5" y2="14" strokeWidth="1.5" />
      <rect x="4" y="3.5" width="3" height="9" strokeWidth="1" />
      <rect x="9" y="6.5" width="3" height="6" strokeWidth="1" />
    </svg>
  );
}

/** Three vertical bars with equal gaps; horizontal equal-gap distribute. */
export function DistributeHIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <rect x="1.5" y="3" width="2.5" height="10" strokeWidth="1" />
      <rect x="6.75" y="3" width="2.5" height="10" strokeWidth="1" />
      <rect x="12" y="3" width="2.5" height="10" strokeWidth="1" />
    </svg>
  );
}

/** Scattered tiles snapping into an even 2x2 grid; one-click tidy/auto-arrange. */
export function TidyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <rect x="1.5" y="1.5" width="5" height="5" strokeWidth="1" />
      <rect x="9.5" y="1.5" width="5" height="5" strokeWidth="1" />
      <rect x="1.5" y="9.5" width="5" height="5" strokeWidth="1" />
      <rect x="9.5" y="9.5" width="5" height="5" strokeWidth="1" />
    </svg>
  );
}

/** Three horizontal bars with equal gaps; vertical equal-gap distribute. */
export function DistributeVIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <rect x="3" y="1.5" width="10" height="2.5" strokeWidth="1" />
      <rect x="3" y="6.75" width="10" height="2.5" strokeWidth="1" />
      <rect x="3" y="12" width="10" height="2.5" strokeWidth="1" />
    </svg>
  );
}
