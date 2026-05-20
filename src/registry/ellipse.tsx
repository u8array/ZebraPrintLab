import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import { fieldPos, wrapReverse } from './zplHelpers';
import { commitWidthHeightTransform } from './transformHelpers';

export interface EllipseProps {
  width: number;
  height: number;
  thickness: number;
  filled: boolean;
  color: 'B' | 'W';
  /** When true, resize keeps width === height. Set by the parser when
   *  an object round-trips through ^GC, by the "Circle" Properties-
   *  Panel toggle, or by the user. The transformer reads this to
   *  force uniform scale anchors. */
  lockAspect?: boolean;
  /** Field-level inversion via `^LRY`/`^LRN` wrap on emit. Round-trips
   *  through the parser's `^LR` state and matches the box/line/text
   *  reverse semantics. */
  reverse?: boolean;
}

export const ellipse: ObjectTypeDefinition<EllipseProps> = {
  label: 'Ellipse',
  icon: '○',
  group: 'shape',
  defaultProps: {
    width: 150,
    height: 100,
    thickness: 3,
    filled: false,
    color: 'B',
  },
  defaultSize: { width: 150, height: 100 },

  uniformScale: (p) => p.lockAspect === true,

  commitTransform: (obj, ctx) => {
    // When lockAspect is true, the transformer already constrains the
    // bbox to a square via forceSquareBox, so sx === sy here. We still
    // collapse to a single axis to keep width === height exact under
    // float rounding rather than relying on identical Math.round inputs.
    if (obj.props.lockAspect) {
      const uniform = { ...ctx, sx: Math.min(ctx.sx, ctx.sy), sy: Math.min(ctx.sx, ctx.sy) };
      return commitWidthHeightTransform(obj, uniform);
    }
    return commitWidthHeightTransform(obj, ctx);
  },

  toZPL: (obj) => {
    const p = obj.props;
    const thick = p.filled ? Math.min(p.width, p.height) : p.thickness;
    // Equal axes round-trip through Zebra's dedicated circle command
    // (one parameter shorter, pixel-equivalent). The parser maps either
    // ^GC or ^GE to an ellipse on import.
    const cmd =
      p.width === p.height
        ? `^GC${p.width},${thick},${p.color}`
        : `^GE${p.width},${p.height},${thick},${p.color}`;
    return wrapReverse(p.reverse, `${fieldPos(obj)}${cmd}^FS`);
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        {p.lockAspect ? (
          <NumberInput
            label={t.registry.circle.diameter}
            value={p.width}
            min={1}
            onChange={(d) => onChange({ width: d, height: d })}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label={t.registry.ellipse.width}
              value={p.width}
              min={1}
              onChange={(width) => onChange({ width })}
            />
            <NumberInput
              label={t.registry.ellipse.height}
              value={p.height}
              min={1}
              onChange={(height) => onChange({ height })}
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.lockAspect ?? false}
            onChange={(e) => {
              if (e.target.checked) {
                // Enabling lockAspect: collapse to the smaller axis so
                // the resulting circle fits inside the current ellipse
                // bbox. Picking max instead would push the shape past
                // the user's prior visual extent on one axis, which is
                // surprising; min keeps the move strictly inward.
                const d = Math.min(p.width, p.height);
                onChange({ lockAspect: true, width: d, height: d });
              } else {
                // Disabling: drop the flag (undefined keeps the model
                // shape parser-emitted props share — they never carry
                // an explicit `false`). Dimensions stay put so the
                // user can adjust them independently from here.
                onChange({ lockAspect: undefined });
              }
            }}
          />
          <span className={labelCls}>{t.registry.ellipse.lockAspect}</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.filled}
            onChange={(e) => onChange({ filled: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.ellipse.filled}</span>
        </label>

        {!p.filled && (
          <NumberInput
            label={t.registry.ellipse.thickness}
            value={p.thickness}
            min={1}
            onChange={(thickness) => onChange({ thickness })}
          />
        )}

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.ellipse.color}</label>
          <select
            className={inputCls}
            value={p.color}
            onChange={(e) => onChange({ color: e.target.value as EllipseProps['color'] })}
          >
            <option value="B">{t.registry.ellipse.colorB}</option>
            <option value="W">{t.registry.ellipse.colorW}</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.reverse ?? false}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.ellipse.reverse}</span>
        </label>
      </div>
    );
  },
};
