import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import type { Tlc39Props } from "./tlc39";

export const tlc39Panel: ObjectTypeUi<Tlc39Props> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.tlc39;
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <input
            className={inputCls}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label={loc.height}
              value={p.height}
              min={1}
              onChange={(height) => onChange({ height })}
              zplCmd="^BT"
            />
            <NumberInput
              label={loc.moduleWidth}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(moduleWidth) => onChange({ moduleWidth })}
              zplCmd="^BY"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label={loc.microPdfRowHeight}
              value={p.microPdfRowHeight}
              min={1}
              max={255}
              onChange={(microPdfRowHeight) => onChange({ microPdfRowHeight })}
              zplCmd="^BT"
            />
            <NumberInput
              label={loc.microPdfRows}
              value={p.microPdfRows}
              min={1}
              max={10}
              onChange={(microPdfRows) => onChange({ microPdfRows })}
              zplCmd="^BT"
            />
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BT" />
        </SectionCard>
      </>
    );
  },
};
