import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { validateMaxicodeBwip } from "../components/Canvas/bwipHelpers";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { type ZplRotation } from "./rotation";
import { RotationSelect } from "../components/Properties/RotationSelect";

/** Maxicode is a fixed-physical-size 2D symbology (1.11" × 1.054"
 *  at standard scale, ~28 × 26 mm). Unlike QR or DataMatrix it has
 *  no per-module magnification — the printer always renders a
 *  single fixed size. Therefore no `commitTransform` and no
 *  magnification prop; only the data, mode, and rotation vary. */

/** All modes the spec defines. Editor exposes every one and lets
 *  bwip-js validate the (content, mode) pair on encode:
 *   2 = US carrier SCM (numeric postal code)
 *   3 = international SCM (alphanumeric postal code)
 *   4 = standard symbol, no SCM
 *   5 = full EEC standard symbol
 *   6 = reader programming
 *  Modes 2/3 require a Structured Carrier Message payload — bwip-js
 *  surfaces a precise error ("Expected postcode followed by group
 *  separator character") that the panel displays inline. Mode 6
 *  always encodes successfully but produces a scanner-configuration
 *  symbol rather than user data, so an informational advisory is
 *  shown instead of an error. */
const ALL_MODES = [2, 3, 4, 5, 6] as const;

/** Default physical footprint of a Maxicode at 8 dpmm: spec is
 *  ~28 × 26.9 mm; converted to dots that's 224 × 216. */
const MAXICODE_DEFAULT_FOOTPRINT = { width: 224, height: 216 } as const;

/** Mode 4 = standard symbol with arbitrary payload, the only mode
 *  most users without UPS-domain knowledge can reach for without
 *  hitting an SCM-format error. */
const MAXICODE_DEFAULT_MODE = 4 as const;

export interface MaxicodeProps {
  content: string;
  mode: 2 | 3 | 4 | 5 | 6;
  rotation: ZplRotation;
}

export const maxicode: ObjectTypeDefinition<MaxicodeProps> = {
  label: "Maxicode",
  icon: "⬡",
  group: "code-2d",
  bindable: true,
  defaultProps: {
    content: "1234567890",
    mode: MAXICODE_DEFAULT_MODE,
    rotation: "N",
  },
  // Fixed-size symbol — the printer always renders at standard
  // Maxicode dimensions, so the resize transformer is disabled
  // (heightLocked) and no commitTransform is needed.
  defaultSize: MAXICODE_DEFAULT_FOOTPRINT,
  heightLocked: true,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // ^BVa,b,c,d: orientation, mode, symbol number (structured
    // append), total symbols. We don't expose structured append, so
    // emit fixed (1, 1) — the printer treats those as standalone.
    return [
      fieldPos(obj),
      `^BV${p.rotation},${p.mode},1,1`,
      fdFieldFor(obj, p.content, ctx),
    ].join("");
  },

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
