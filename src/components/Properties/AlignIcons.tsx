interface IconProps {
  className?: string;
}

/** Object centred on a vertical dashed line; represents horizontal centring. */
export function CenterHIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeDasharray="2 2" strokeWidth="1" />
      <rect x="3" y="5" width="10" height="6" strokeWidth="1" />
    </svg>
  );
}

/** Object centred on a horizontal dashed line; represents vertical centring. */
export function CenterVIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="1.5" y1="8" x2="14.5" y2="8" strokeDasharray="2 2" strokeWidth="1" />
      <rect x="5" y="3" width="6" height="10" strokeWidth="1" />
    </svg>
  );
}

/** Object on the cross-hair of two dashed lines; represents bi-axial centring. */
export function CenterBothIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeDasharray="2 2" strokeWidth="1" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" strokeDasharray="2 2" strokeWidth="1" />
      <rect x="5" y="5" width="6" height="6" strokeWidth="1" />
    </svg>
  );
}
