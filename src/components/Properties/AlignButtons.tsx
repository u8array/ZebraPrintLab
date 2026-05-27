import { useT } from "../../lib/useT";
import type { AlignAxis } from "../../lib/alignment";
import { CenterHIcon, CenterVIcon, CenterBothIcon } from "./AlignIcons";

// Borderless inline header tool, docks into a section header.
const BUTTON_CLS =
  "p-1 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors";

/**
 * Three-button row that centres the current selection on the label. Pure
 * presentation: the caller supplies the imperative `onAlign` handler so the
 * component stays decoupled from the canvas (which owns the live render
 * bboxes). When mounted under a section header, pass `ariaLabelledBy` so
 * screen readers link the button group to that header instead of hearing
 * three isolated icon buttons.
 */
export function AlignButtons({
  onAlign,
  ariaLabelledBy,
}: {
  onAlign: (axis: AlignAxis) => void;
  ariaLabelledBy?: string;
}) {
  const t = useT();

  const buttons: { axis: AlignAxis; title: string; Icon: typeof CenterHIcon }[] = [
    { axis: "h",    title: t.properties.alignCenterH,    Icon: CenterHIcon },
    { axis: "v",    title: t.properties.alignCenterV,    Icon: CenterVIcon },
    { axis: "both", title: t.properties.alignCenterBoth, Icon: CenterBothIcon },
  ];

  return (
    <div
      className="flex gap-1"
      role={ariaLabelledBy ? "group" : undefined}
      aria-labelledby={ariaLabelledBy}
    >
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
