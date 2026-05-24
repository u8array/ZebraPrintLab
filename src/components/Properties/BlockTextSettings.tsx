import { useT } from "../../lib/useT";
import { labelCls } from "./styles";
import { NumberInput } from "./NumberInput";
import { JustifyButtons } from "./JustifyButtons";
import type { TextProps } from "../../registry/text";

interface Props {
  props: TextProps;
  onChange: (patch: Partial<TextProps>) => void;
}

/** Block-text (`^FB`) sub-panel: width / max-lines / justify /
 *  line-spacing plus inline validation hints. Hints are purely
 *  informational — never auto-correct user-set blockLines, since
 *  content can legitimately have fewer lines than max (CSV-bound
 *  rows vary) or more (intentional truncation). The editor surfaces
 *  the mismatch but leaves the choice to the user. */
export function BlockTextSettings({ props: p, onChange }: Props) {
  const t = useT();
  const contentLines = p.content.split("\n").length;
  const maxLines = p.blockLines ?? 1;
  const truncates = contentLines > maxLines;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
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
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.blockJustify}</label>
          <JustifyButtons
            value={p.blockJustify ?? "L"}
            onChange={(blockJustify) => onChange({ blockJustify })}
          />
        </div>
        <NumberInput
          label={t.registry.text.blockLineSpacing}
          value={p.blockLineSpacing ?? 0}
          onChange={(blockLineSpacing) => onChange({ blockLineSpacing })}
        />
      </div>
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
    </>
  );
}
