import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface LineProps {
  /** Angle in degrees, 0 = rightward horizontal, clockwise positive (screen coords). */
  angle: number;
  length: number;
  thickness: number;
  color: 'B' | 'W';
  reverse?: boolean;
}

export const line: ObjectTypeDefinition<LineProps> = {
  label: 'Line',
  icon: '—',
  group: 'shape',
  defaultProps: {
    angle: 0,
    length: 200,
    thickness: 3,
    color: 'B',
  },
  defaultSize: { width: 200, height: 3 },

  toZPL: (obj) => {
    const p = obj.props;
    const t = p.thickness;
    const l = p.length;
    const a = ((p.angle % 360) + 360) % 360; // normalise to [0, 360)
    const lr = p.reverse ? ['^LRY', '^LRN'] : ['', ''];

    // Pure horizontal
    if (a === 0 || a === 180) {
      return `${lr[0]}^FO${obj.x},${obj.y}^GB${l},${t},${t},${p.color},0^FS${lr[1]}`;
    }
    // Pure vertical
    if (a === 90 || a === 270) {
      return `${lr[0]}^FO${obj.x},${obj.y}^GB${t},${l},${t},${p.color},0^FS${lr[1]}`;
    }

    // Diagonal — use ^GD (bounding-box diagonal command)
    const rad = (a * Math.PI) / 180;
    const dx = l * Math.cos(rad);
    const dy = l * Math.sin(rad);
    const w = Math.max(1, Math.abs(Math.round(dx)));
    const h = Math.max(1, Math.abs(Math.round(dy)));
    const orientation = dx * dy >= 0 ? 'L' : 'R';
    const boxX = obj.x + (dx < 0 ? Math.round(dx) : 0);
    const boxY = obj.y + (dy < 0 ? Math.round(dy) : 0);
    return `${lr[0]}^FO${boxX},${boxY}^GD${w},${h},${t},${p.color},${orientation}^FS${lr[1]}`;
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.line.length}</label>
            <input
              type="number"
              className={inputCls}
              value={p.length}
              min={1}
              onChange={(e) => onChange({ length: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.line.angle}</label>
            <input
              type="number"
              className={inputCls}
              value={p.angle}
              min={-359}
              max={359}
              onChange={(e) => onChange({ angle: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.line.thickness}</label>
          <input
            type="number"
            className={inputCls}
            value={p.thickness}
            min={1}
            onChange={(e) => onChange({ thickness: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.line.color}</label>
          <select
            className={inputCls}
            value={p.color}
            onChange={(e) => onChange({ color: e.target.value as LineProps['color'] })}
          >
            <option value="B">{t.registry.line.colorB}</option>
            <option value="W">{t.registry.line.colorW}</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.reverse ?? false}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.line.reverse}</span>
        </label>
      </div>
    );
  },
};
