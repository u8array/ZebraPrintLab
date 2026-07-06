import { DialogShell } from "../ui/DialogShell";
import { useT } from "../../hooks/useT";
import { useLabelStore } from "../../store/labelStore";
import { rescaleDesign } from "../../lib/densityRescale";

interface Props {
  /** Pending target density chosen in the dpmm selector. */
  toDpmm: number;
  onClose: () => void;
}

/** Asks how to handle a print-density change: rescale every dot value to keep
 *  the physical layout, or keep the dot values (physical size changes). The
 *  warning count is previewed from the same pure transform the action commits. */
export function DensityRescaleModal({ toDpmm, onClose }: Props) {
  const t = useT();
  const td = t.densityRescale;
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const rescaleDensity = useLabelStore((s) => s.rescaleDensity);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);

  const { warnings } = rescaleDesign(pages, label, label.dpmm, toDpmm);

  const scale = () => {
    rescaleDensity(toDpmm);
    onClose();
  };
  const keep = () => {
    setLabelConfig({ dpmm: toDpmm });
    onClose();
  };

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="density-rescale-title"
      portal
      boxClassName="bg-surface border border-border rounded shadow-lg flex flex-col w-[420px] max-w-[95vw]"
    >
      <div className="px-5 pt-5 pb-3">
        <h2 id="density-rescale-title" className="text-sm font-medium text-text">
          {td.title}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {td.fromToFmt.split("{from}").join(String(label.dpmm)).split("{to}").join(String(toDpmm))}
        </p>
        <p className="mt-2 text-xs text-text leading-relaxed">{td.question}</p>
        {warnings.length > 0 && (
          <p className="mt-2 text-xs text-amber-500 leading-relaxed">
            {td.adjustedFmt.split("{n}").join(String(warnings.length))}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={scale}
          autoFocus
          className="flex flex-col items-start px-3 py-2 rounded bg-accent text-bg hover:opacity-90 transition"
        >
          <span className="text-xs font-mono">{td.scale}</span>
          <span className="text-[10px] opacity-80">{td.scaleHint}</span>
        </button>
        <button
          type="button"
          onClick={keep}
          className="flex flex-col items-start px-3 py-2 rounded border border-border text-text hover:bg-surface-2 transition-colors"
        >
          <span className="text-xs font-mono">{td.keep}</span>
          <span className="text-[10px] text-muted">{td.keepHint}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="self-end px-4 py-1.5 rounded text-xs font-mono text-muted hover:text-text transition-colors"
        >
          {td.cancel}
        </button>
      </div>
    </DialogShell>
  );
}
