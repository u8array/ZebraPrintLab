export function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2"  r="1.2" />
      <circle cx="6" cy="2"  r="1.2" />
      <circle cx="2" cy="7"  r="1.2" />
      <circle cx="6" cy="7"  r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
    </svg>
  );
}
