import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos, fdField } from "./zplHelpers";
import { commitUniformScaleTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";

const MAGNIFICATION_MIN = 1;
const MAGNIFICATION_MAX = 10;
const EC_LEVEL_MIN = 0;
// NumberInput can't express the discontinuous AztecProps domain — use the
// highest valid value (Rune = 300) as the upper bound.
const EC_LEVEL_MAX = 300;

export interface AztecProps {
  content: string;
  magnification: number; // module size in dots
  ecLevel: number; // 0=default, 1-99=error correction %, 101-104=compact, 201-232=full, 300=rune
  rotation: ZplRotation;
}

export const aztec: ObjectTypeDefinition<AztecProps> = {
  label: "Aztec",
  icon: "◇",
  group: "code-2d",
  defaultProps: {
    content: "1234567890",
    magnification: 4,
    ecLevel: 0,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 200 },

  commitTransform: commitUniformScaleTransform('magnification', MAGNIFICATION_MIN, MAGNIFICATION_MAX),

  toZPL: (obj) => {
    const p = obj.props;
    // ^B0 a,b,c,d,e,f,g = orientation, magnification, ecic, errorControl,
    // menuSymbol, numberOfSymbols, structuredID. ecLevel=0 is Zebra's
    // documented default for errorControl, so emitting it as-is is valid.
    return [
      fieldPos(obj),
      `^B0${p.rotation},${p.magnification},N,${p.ecLevel}`,
      fdField(p.content),
    ].join("");
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.aztec;
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

        <NumberInput
          label={loc.magnification}
          value={p.magnification}
          min={MAGNIFICATION_MIN}
          max={MAGNIFICATION_MAX}
          onChange={(magnification) => onChange({ magnification })}
        />

        <NumberInput
          label={loc.ecLevel}
          value={p.ecLevel}
          min={EC_LEVEL_MIN}
          max={EC_LEVEL_MAX}
          onChange={(ecLevel) => onChange({ ecLevel })}
        />

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
