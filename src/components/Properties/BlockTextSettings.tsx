import { useT } from "../../lib/useT";
import { labelCls } from "./styles";
import { NumberInput } from "./NumberInput";
import { JustifyButtons } from "./JustifyButtons";
import type { TextProps } from "../../registry/text";
import {
  isBlockTooNarrow,
  zebraGlyphAdvanceDots,
  zebraLineWidthDots,
  wrapBlockLines,
} from "../../lib/zebraTextLayout";
import { useLabelStore } from "../../store/labelStore";

interface Props {
  props: TextProps;
  onChange: (patch: Partial<TextProps>) => void;
}

/** Block-text (`^FB`) sub-panel: width / max-lines / justify /
 *  line-spacing plus inline validation hints. Hints are purely
 *  informational; never auto-correct user-set blockLines, since
 *  content can legitimately have fewer lines than max (CSV-bound
 *  rows vary) or more (intentional truncation). The editor surfaces
 *  the mismatch but leaves the choice to the user. */
export function BlockTextSettings({ props: p, onChange }: Props) {
  const t = useT();
  const blockDragMode = useLabelStore((s) => s.blockDragMode);
  const setBlockDragMode = useLabelStore((s) => s.setBlockDragMode);
  // Count wrapped lines, not just hard breaks, so soft-wrap overflow (a long
  // line spilling past blockLines) also trips the warning. Uses the printer
  // estimate (same basis as the blockLines cap); the canvas wrap may differ by
  // a line on scaled fonts, but this is an informational hint.
  const contentLines = wrapBlockLines(
    p.content,
    p.blockWidth ?? 0,
    (line) => zebraLineWidthDots(line, p.fontHeight, p.fontWidth),
  ).length;
  const maxLines = p.blockLines ?? 1;
  const truncates = contentLines > maxLines;
  const advance = Math.ceil(zebraGlyphAdvanceDots(p.fontHeight, p.fontWidth));
  const tooNarrow = isBlockTooNarrow(p.blockWidth ?? 0, p.fontHeight, p.fontWidth);
  return (
    // Indent + left border marks the sub-panel as belonging to the
    // FELDBLOCK checkbox above; same convention as the Font-Advanced
    // block in text.tsx.
    <div className="pl-3 border-l border-border flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <label className={labelCls}>{t.registry.text.dragMode}</label>
        <div className="flex rounded border border-border overflow-hidden text-xs">
          {(["frame", "glyph"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setBlockDragMode(m)}
              className={`px-2 py-0.5 transition-colors ${
                blockDragMode === m
                  ? "bg-accent text-surface"
                  : "text-muted hover:text-text"
              }`}
            >
              {m === "frame"
                ? t.registry.text.dragModeFrame
                : t.registry.text.dragModeGlyph}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className={labelCls}>{t.registry.text.blockJustify}</label>
        <JustifyButtons
          value={p.blockJustify ?? "L"}
          onChange={(blockJustify) => onChange({ blockJustify })}
        />
      </div>
      {/* items-end keeps the inputs flush even when only one label
          wraps to two lines (e.g. "BLOCKBREITE (PUNKTE)" vs "MAX. ZEILEN"). */}
      <div className="grid grid-cols-2 gap-2 items-end">
        <NumberInput
          label={t.registry.text.blockWidth}
          value={p.blockWidth ?? 0}
          min={1}
          onChange={(blockWidth) => onChange({ blockWidth })}
        />
        <NumberInput
          label={t.registry.text.blockLines}
          value={p.blockLines ?? 1}
          min={1}
          onChange={(blockLines) => onChange({ blockLines })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 items-end">
        <NumberInput
          label={t.registry.text.blockLineSpacing}
          value={p.blockLineSpacing ?? 0}
          onChange={(blockLineSpacing) => onChange({ blockLineSpacing })}
        />
        <NumberInput
          label={t.registry.text.blockHangingIndent}
          value={p.blockHangingIndent ?? 0}
          min={0}
          onChange={(blockHangingIndent) =>
            onChange({ blockHangingIndent: blockHangingIndent || undefined })
          }
        />
      </div>
      {tooNarrow && (
        <p className="font-mono text-[10px] text-warning">
          {t.registry.text.blockTooNarrowFmt
            .replaceAll("{w}", String(p.blockWidth))
            .replaceAll("{advance}", String(advance))}
        </p>
      )}
      {truncates && (
        <p className="font-mono text-[10px] text-warning">
          {t.registry.text.blockLinesExceededFmt
            .replaceAll("{n}", String(contentLines))
            .replaceAll("{max}", String(maxLines))}
        </p>
      )}
      {!truncates && contentLines < maxLines && (
        <p className="font-mono text-[10px] text-muted">
          {t.registry.text.blockLinesUsageFmt
            .replaceAll("{n}", String(contentLines))
            .replaceAll("{max}", String(maxLines))}
        </p>
      )}
    </div>
  );
}
