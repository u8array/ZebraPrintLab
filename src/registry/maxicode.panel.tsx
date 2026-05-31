import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { validateMaxicodeBwip } from "../components/Canvas/bwipHelpers";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { type MaxicodeProps, ALL_MODES } from "./maxicode";

export const maxicodePanel: ObjectTypeUi<MaxicodeProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.maxicode;
    // Resolve the diagnostic line beneath the mode dropdown. Hard
    // errors (bwip-js encoder rejections, mostly SCM-format issues
    // in mode 2/3) win over the soft mode-6 advisory.
    const error = validateMaxicodeBwip(p.content, p.mode);
    const advisory = p.mode === 6 ? loc.mode6Advisory : null;
    const diagnostic = error
      ? { text: error, className: "text-error font-mono" }
      : advisory
        ? { text: advisory, className: "text-muted" }
        : null;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.mode}</label>
          <select
            className={inputCls}
            value={p.mode}
            onChange={(e) =>
              onChange({ mode: Number(e.target.value) as MaxicodeProps["mode"] })
            }
          >
            {ALL_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {diagnostic && (
            <p className={`text-[10px] leading-snug ${diagnostic.className}`}>
              {diagnostic.text}
            </p>
          )}
        </div>

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
