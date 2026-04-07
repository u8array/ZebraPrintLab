import { useLabelStore } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import { dotsToMm, mmToDots } from '../../lib/coordinates';
import t from '../../locales/en';
import { inputCls, labelCls } from './styles';

export function PropertiesPanel() {
  const { objects, selectedId, updateObject, label, setLabelConfig } = useLabelStore();
  const obj = objects.find((o) => o.id === selectedId);

  if (!obj) {
    return <LabelConfigPanel label={label} onUpdate={setLabelConfig} />;
  }

  const definition = ObjectRegistry[obj.type];
  const TypePanel = definition?.PropertiesPanel;

  return (
    <div className="flex flex-col">

      {/* Type header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className="font-mono text-xs text-accent">{definition?.icon}</span>
        <span className="text-xs font-medium text-text">{definition?.label}</span>
        <span className="font-mono text-[10px] text-muted ml-auto truncate">{obj.id.slice(0, 8)}</span>
      </div>

      <div className="p-3 flex flex-col gap-4">

        {/* Position (mm) */}
        <div className="flex flex-col gap-2">
          <p className={labelCls}>{t.properties.positionSection}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t.properties.x}</label>
              <input
                type="number"
                className={inputCls}
                value={dotsToMm(obj.x)}
                step={0.5}
                onChange={(e) => updateObject(obj.id, { x: mmToDots(Number(e.target.value)) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t.properties.y}</label>
              <input
                type="number"
                className={inputCls}
                value={dotsToMm(obj.y)}
                step={0.5}
                onChange={(e) => updateObject(obj.id, { y: mmToDots(Number(e.target.value)) })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {TypePanel && (
          <TypePanel
            obj={obj}
            onChange={(props) => updateObject(obj.id, { props })}
          />
        )}

      </div>
    </div>
  );
}

// ── Label presets ──────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  widthMm: number;
  heightMm: number;
  dpmm: number;
}

const PRESETS: Preset[] = [
  { label: '4" × 6"  — 101 × 152 mm',  widthMm: 101.6, heightMm: 152.4, dpmm: 8 },
  { label: '4" × 4"  — 101 × 101 mm',  widthMm: 101.6, heightMm: 101.6, dpmm: 8 },
  { label: '4" × 3"  — 101 × 76 mm',   widthMm: 101.6, heightMm: 76.2,  dpmm: 8 },
  { label: '4" × 2"  — 101 × 51 mm',   widthMm: 101.6, heightMm: 50.8,  dpmm: 8 },
  { label: '3" × 2"  — 76 × 51 mm',    widthMm: 76.2,  heightMm: 50.8,  dpmm: 8 },
  { label: '2" × 1"  — 51 × 25 mm',    widthMm: 50.8,  heightMm: 25.4,  dpmm: 8 },
  { label: '100 × 150 mm',             widthMm: 100,   heightMm: 150,   dpmm: 8 },
  { label: '100 × 100 mm',             widthMm: 100,   heightMm: 100,   dpmm: 8 },
  { label: '100 × 50 mm',              widthMm: 100,   heightMm: 50,    dpmm: 8 },
  { label: '62 × 29 mm  (Brother)',     widthMm: 62,    heightMm: 29,    dpmm: 12 },
  { label: '57 × 32 mm  (Brother)',     widthMm: 57,    heightMm: 32,    dpmm: 12 },
];

// ── LabelConfigPanel ───────────────────────────────────────────────────────────

interface LabelConfigPanelProps {
  label: { widthMm: number; heightMm: number; dpmm: number };
  onUpdate: (config: Partial<{ widthMm: number; heightMm: number; dpmm: number }>) => void;
}

function LabelConfigPanel({ label, onUpdate }: LabelConfigPanelProps) {
  const matchedPreset = PRESETS.find(
    (p) => p.widthMm === label.widthMm && p.heightMm === label.heightMm && p.dpmm === label.dpmm,
  );
  const presetValue = matchedPreset ? PRESETS.indexOf(matchedPreset).toString() : 'custom';

  const handlePreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'custom') return;
    const p = PRESETS[Number(e.target.value)];
    if (!p) return;
    onUpdate({ widthMm: p.widthMm, heightMm: p.heightMm, dpmm: p.dpmm });
  };

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-text">{t.label.heading}</span>
      </div>

      <div className="p-3 flex flex-col gap-3">

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.preset}</label>
          <select className={inputCls} value={presetValue} onChange={handlePreset}>
            <option value="custom">{t.label.presetCustom}</option>
            {PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="border-t border-border" />

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.label.width}</label>
            <input
              type="number"
              className={inputCls}
              value={label.widthMm}
              min={1}
              step={0.5}
              onChange={(e) => onUpdate({ widthMm: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.label.height}</label>
            <input
              type="number"
              className={inputCls}
              value={label.heightMm}
              min={1}
              step={0.5}
              onChange={(e) => onUpdate({ heightMm: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.dpmm}</label>
          <select
            className={inputCls}
            value={label.dpmm}
            onChange={(e) => onUpdate({ dpmm: Number(e.target.value) })}
          >
            <option value={6}>{t.label.dpmm6}</option>
            <option value={8}>{t.label.dpmm8}</option>
            <option value={12}>{t.label.dpmm12}</option>
            <option value={24}>{t.label.dpmm24}</option>
          </select>
        </div>

      </div>
    </div>
  );
}
