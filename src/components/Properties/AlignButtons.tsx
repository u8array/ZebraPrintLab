import { useT } from "../../lib/useT";
import type { AlignAxis } from "../../lib/alignment";

interface IconProps {
  className?: string;
}

function CenterHIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeDasharray="2 2" strokeWidth="1" />
      <rect x="3" y="5" width="10" height="6" strokeWidth="1" />
    </svg>
  );
}

function CenterVIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="1.5" y1="8" x2="14.5" y2="8" strokeDasharray="2 2" strokeWidth="1" />
      <rect x="5" y="3" width="6" height="10" strokeWidth="1" />
    </svg>
  );
}

function CenterBothIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" className={className}>
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeDasharray="2 2" strokeWidth="1" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" strokeDasharray="2 2" strokeWidth="1" />
      <rect x="5" y="5" width="6" height="6" strokeWidth="1" />
    </svg>
  );
}

const BUTTON_CLS =
  "p-1.5 rounded border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors";

/**
 * Three-button row that centres the current selection on the label. Pure
 * presentation: the caller supplies the imperative `onAlign` handler so the
 * component stays decoupled from the canvas (which owns the live render
 * bboxes).
 */
export function AlignButtons({ onAlign }: { onAlign: (axis: AlignAxis) => void }) {
  const t = useT();

  const buttons: { axis: AlignAxis; title: string; Icon: typeof CenterHIcon }[] = [
    { axis: "h",    title: t.properties.alignCenterH,    Icon: CenterHIcon },
    { axis: "v",    title: t.properties.alignCenterV,    Icon: CenterVIcon },
    { axis: "both", title: t.properties.alignCenterBoth, Icon: CenterBothIcon },
  ];

  return (
    <div className="flex gap-1">
      {buttons.map(({ axis, title, Icon }) => (
        <button
          key={axis}
          type="button"
          className={BUTTON_CLS}
          title={title}
          aria-label={title}
          onClick={() => onAlign(axis)}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
