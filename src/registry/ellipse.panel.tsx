import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import type { EllipseProps } from './ellipse';

export const ellipsePanel: ObjectTypeUi<EllipseProps> = {
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
                // shape parser-emitted props share; they never carry
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
