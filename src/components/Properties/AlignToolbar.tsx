import { useT } from "../../lib/useT";
import type { AlignOp, DistributeAxis, AlignRef } from "../../lib/align";
import type { AlignSelectionRef } from "../../store/slices/uiSlice";
import {
  AlignLeftIcon,
  AlignHCenterIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignVMiddleIcon,
  AlignBottomIcon,
  DistributeHIcon,
  DistributeVIcon,
  TidyIcon,
} from "./AlignIcons";

const BUTTON_CLS =
  "p-1 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-default";

interface AlignToolbarProps {
  /** Apply an align op against an explicit reference frame. The "Align"
   *  section passes the section toggle; "Align to label" passes 'label'. */
  onAlign: (op: AlignOp, ref: AlignRef) => void;
  /** equalGap only; typed fixed-gap distribute is Phase 2. Always
   *  selection-relative, so it needs no reference. */
  onDistribute: (axis: DistributeAxis) => void;
  /** One-click tidy: spread the content evenly across the safe area (else
   *  label) and center it, excluding structural frame/divider primitives.
   *  Needs >=2 objects. */
  onTidy: () => void;
  /** Reference toggle for the "Align" section ('selection' | 'key'). */
  alignRef: AlignSelectionRef;
  onAlignRefChange: (ref: AlignSelectionRef) => void;
  /** Top-level selected object count; distribute needs >=3 to act. */
  selectionCount: number;
  ariaLabelledBy?: string;
}

interface AlignOpDef {
  op: AlignOp;
  title: string;
  Icon: typeof AlignLeftIcon;
}

/** Shared 6-op icon row; both align sections reuse it with a different ref. */
function AlignOpRow({
  ops,
  onClick,
  disabled = false,
}: {
  ops: AlignOpDef[];
  onClick: (op: AlignOp) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ops.map(({ op, title, Icon }) => (
        <button
          key={op}
          type="button"
          className={BUTTON_CLS}
          title={title}
          aria-label={title}
          disabled={disabled}
          onClick={() => onClick(op)}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

/**
 * Align + distribute tools in four always-visible sections: "Align"
 * (selection/key reference, toggle), "Align to label" (all six edges to the
 * label rect), "Distribute" and "Tidy up". Pure presentation: the caller owns
 * the imperative align/distribute/tidy handlers (which need live canvas bboxes)
 * and the alignRef store wiring.
 */
export function AlignToolbar({
  onAlign,
  onDistribute,
  onTidy,
  alignRef,
  onAlignRefChange,
  selectionCount,
  ariaLabelledBy,
}: AlignToolbarProps) {
  const t = useT();

  const alignOps: AlignOpDef[] = [
    { op: "left", title: t.properties.alignLeft, Icon: AlignLeftIcon },
    { op: "hcenter", title: t.properties.alignHCenter, Icon: AlignHCenterIcon },
    { op: "right", title: t.properties.alignRight, Icon: AlignRightIcon },
    { op: "top", title: t.properties.alignTop, Icon: AlignTopIcon },
    { op: "vmiddle", title: t.properties.alignVMiddle, Icon: AlignVMiddleIcon },
    { op: "bottom", title: t.properties.alignBottom, Icon: AlignBottomIcon },
  ];

  // A single object aligns to the label via the section below; "Align" (relative
  // to the selection) only makes sense for 2+, so disable it to avoid duplicating
  // "Align to label".
  const alignSelectionDisabled = selectionCount < 2;
  const distributeDisabled = selectionCount < 3;
  const tidyDisabled = selectionCount < 2;

  const segCls = (active: boolean) =>
    `px-1.5 py-0.5 transition-colors ${active ? "bg-accent text-bg" : "text-muted hover:text-text"}`;

  return (
    <div
      className="flex flex-col gap-3"
      role={ariaLabelledBy ? "group" : undefined}
      aria-labelledby={ariaLabelledBy}
    >
      {/* Align: relative to the selection (or key object). */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted">
            {t.properties.alignSectionSelection}
          </span>
          <div
            className="flex rounded overflow-hidden border border-border text-[10px] font-mono"
            role="group"
            aria-label={t.properties.alignSectionSelection}
          >
            <button
              type="button"
              className={segCls(alignRef === "selection")}
              aria-pressed={alignRef === "selection"}
              disabled={alignSelectionDisabled}
              onClick={() => onAlignRefChange("selection")}
            >
              {t.properties.alignRefSelection}
            </button>
            <button
              type="button"
              className={segCls(alignRef === "key")}
              aria-pressed={alignRef === "key"}
              disabled={alignSelectionDisabled}
              onClick={() => onAlignRefChange("key")}
            >
              {t.properties.alignRefKey}
            </button>
          </div>
        </div>
        <AlignOpRow ops={alignOps} disabled={alignSelectionDisabled} onClick={(op) => onAlign(op, alignRef)} />
      </div>

      {/* Align to label: all six edges to the label rect, always visible. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {t.properties.alignSectionLabel}
        </span>
        <AlignOpRow ops={alignOps} onClick={(op) => onAlign(op, "label")} />
      </div>

      {/* Distribute: always selection-relative; needs >=3 objects. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {t.properties.distributeSection}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={BUTTON_CLS}
            title={t.properties.distributeH}
            aria-label={t.properties.distributeH}
            disabled={distributeDisabled}
            onClick={() => onDistribute("h")}
          >
            <DistributeHIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={BUTTON_CLS}
            title={t.properties.distributeV}
            aria-label={t.properties.distributeV}
            disabled={distributeDisabled}
            onClick={() => onDistribute("v")}
          >
            <DistributeVIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {distributeDisabled && (
          <span className="text-[10px] text-muted">
            {t.properties.distributeHint}
          </span>
        )}
      </div>

      {/* Tidy up: auto-arrange the selection into an even row/column. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {t.properties.tidySection}
        </span>
        <button
          type="button"
          className={`${BUTTON_CLS} flex items-center gap-1.5 self-start`}
          title={tidyDisabled ? t.properties.tidyHint : t.properties.tidyTooltip}
          aria-label={t.properties.tidyUp}
          disabled={tidyDisabled}
          onClick={onTidy}
        >
          <TidyIcon className="w-3.5 h-3.5" />
          <span className="text-[10px]">{t.properties.tidyUp}</span>
        </button>
        {tidyDisabled && (
          <span className="text-[10px] text-muted">
            {t.properties.tidyHint}
          </span>
        )}
      </div>
    </div>
  );
}
