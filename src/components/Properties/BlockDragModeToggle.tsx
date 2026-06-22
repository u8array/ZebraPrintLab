import { useT } from "../../lib/useT";
import { labelCls } from "./styles";
import { useLabelStore } from "../../store/labelStore";

/** Frame vs glyph drag-resize toggle shared by the ^FB and ^TB panels.
 *  Frame = the transformer reflows the block box; glyph = it scales the font.
 *  The mode is a global editor setting, not a per-object prop. */
export function BlockDragModeToggle() {
  const t = useT();
  const blockDragMode = useLabelStore((s) => s.blockDragMode);
  const setBlockDragMode = useLabelStore((s) => s.setBlockDragMode);
  return (
    <div className="flex items-center justify-between gap-2">
      <label className={labelCls}>{t.registry.text.dragMode}</label>
      <div className="flex rounded border border-border overflow-hidden text-xs">
        {(["frame", "glyph"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setBlockDragMode(m)}
            className={`px-2 py-0.5 transition-colors ${
              blockDragMode === m ? "bg-accent text-surface" : "text-muted hover:text-text"
            }`}
          >
            {m === "frame" ? t.registry.text.dragModeFrame : t.registry.text.dragModeGlyph}
          </button>
        ))}
      </div>
    </div>
  );
}
