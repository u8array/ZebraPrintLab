import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';

export interface LineProps {
  /** Angle in degrees, 0 = rightward horizontal, clockwise positive (screen coords). */
  angle: number;
  length: number;
  thickness: number;
  color: 'B' | 'W';
  reverse?: boolean;
}

/**
 * Quick-orientation picker.
 *
 *  - `screenAngles`: the two valid angles **as the user sees them on
 *    screen** for that orientation. Stored angles are then derived by
 *    subtracting the current `viewRotation`, so clicking `—` always
 *    yields a line that *looks* horizontal regardless of how the canvas
 *    is rotated.
 *  - `path`: SVG <line> endpoints (12×12 viewbox) used as the visible
 *    button icon. Avoids font-rendering quirks of ASCII glyphs and
 *    keeps the four buttons visually consistent.
 */
const ORIENTATION_PICKER: readonly {
  id: string;
  screenAngles: readonly [number, number];
  path: { x1: number; y1: number; x2: number; y2: number };
}[] = [
  { id: 'h',  screenAngles: [0, 180],    path: { x1: 1,  y1: 6,  x2: 11, y2: 6 } },
  { id: 'v',  screenAngles: [90, -90],   path: { x1: 6,  y1: 1,  x2: 6,  y2: 11 } },
  { id: '/',  screenAngles: [-45, 135],  path: { x1: 1,  y1: 11, x2: 11, y2: 1 } },
  { id: '\\', screenAngles: [45, -135],  path: { x1: 1,  y1: 1,  x2: 11, y2: 11 } },
];

/** Smallest angular distance between two angles in degrees, accounting
 *  for the ±180° wrap. Returns a value in [0, 180]. */
function angleDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Pick a target stored-angle for the clicked orientation.
 *
 * The two `screenAngles` are converted to label-space by subtracting the
 * current view rotation. If the line's current angle already matches one
 * of those candidates exactly, we flip to the other (lets the user click
 * the same orientation button twice to reverse the line's direction).
 * Otherwise, the candidate closer to the current angle wins so the line
 * keeps its rough direction.
 */
export function pickAngle(
  currentAngle: number,
  screenAngles: readonly [number, number],
  viewRotation: number,
): number {
  const a = screenAngles[0] - viewRotation;
  const b = screenAngles[1] - viewRotation;
  // angleDistance (not strict ===) so equivalent-but-differently-normalised
  // values like 90° and -270° still trigger the flip-on-second-click path.
  const distA = angleDistance(currentAngle, a);
  const distB = angleDistance(currentAngle, b);
  if (distA < 0.5) return b;
  if (distB < 0.5) return a;
  return distA <= distB ? a : b;
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

    // Pure horizontal — angle 180 means the line extends LEFT from (obj.x, obj.y),
    // so the ^GB box must start at (obj.x - l) to overlap the same pixels.
    if (a === 0 || a === 180) {
      const bx = a === 180 ? obj.x - l : obj.x;
      const cmd = obj.positionType === 'FT' ? 'FT' : 'FO';
      return `${lr[0]}^${cmd}${bx},${obj.y}^GB${l},${t},${t},${p.color},0^FS${lr[1]}`;
    }
    // Pure vertical — angle 270 means the line extends UP from (obj.x, obj.y),
    // so the ^GB box must start at (obj.x, obj.y - l).
    if (a === 90 || a === 270) {
      const by = a === 270 ? obj.y - l : obj.y;
      const cmd = obj.positionType === 'FT' ? 'FT' : 'FO';
      return `${lr[0]}^${cmd}${obj.x},${by}^GB${t},${l},${t},${p.color},0^FS${lr[1]}`;
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
    const viewRotation = useLabelStore((s) => s.canvasSettings.viewRotation);
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.line.length}
            value={p.length}
            min={1}
            // Shrinking length below the current thickness would land
            // the model in the ^GB promotion regime where t > length
            // prints `t × t`; auto-clamp thickness down to match the
            // new length, mirroring the endpoint-handle drag.
            onChange={(length) =>
              onChange(
                length < p.thickness
                  ? { length, thickness: length }
                  : { length },
              )
            }
          />
          <NumberInput
            label={t.registry.line.angle}
            value={p.angle}
            min={-359}
            max={359}
            onChange={(angle) => onChange({ angle })}
          />
        </div>

        <NumberInput
          label={t.registry.line.thickness}
          value={p.thickness}
          min={1}
          // Capped at length so the ZPL output stays out of the ^GB
          // promotion regime (max(w, t) × max(h, t)), where the printer
          // would extend the line beyond its declared length.
          max={p.length}
          onChange={(thickness) => onChange({ thickness })}
        />

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

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.line.orientation}</label>
          <div className="flex gap-1">
            {ORIENTATION_PICKER.map(({ id, screenAngles, path }) => (
              <button
                key={id}
                type="button"
                className="flex-1 flex items-center justify-center px-2 py-1.5 rounded border bg-surface-2 border-border text-text hover:bg-border transition-colors"
                onClick={() =>
                  onChange({ angle: pickAngle(p.angle, screenAngles, viewRotation) })
                }
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className="stroke-current"
                  fill="none"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                >
                  <line x1={path.x1} y1={path.y1} x2={path.x2} y2={path.y2} />
                </svg>
              </button>
            ))}
          </div>
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
