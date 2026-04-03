import { useLabelStore } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import { dotsToMm, mmToDots } from '../../lib/coordinates';
import t from '../../locales/en';

const inputCls = 'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs font-mono text-text focus:border-accent focus:outline-none';
const labelCls = 'font-mono text-[10px] text-muted uppercase tracking-wider';

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

      {/* Typ-Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className="font-mono text-xs text-accent">{definition?.icon}</span>
        <span className="text-xs font-medium text-text">{definition?.label}</span>
        <span className="font-mono text-[10px] text-muted ml-auto truncate">{obj.id.slice(0, 8)}</span>
      </div>

      <div className="p-3 flex flex-col gap-4">

        {/* Position */}
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

interface LabelConfigPanelProps {
  label: { widthMm: number; heightMm: number; dpmm: number };
  onUpdate: (config: Partial<{ widthMm: number; heightMm: number; dpmm: number }>) => void;
}

function LabelConfigPanel({ label, onUpdate }: LabelConfigPanelProps) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-text">{t.label.heading}</span>
      </div>

      <div className="p-3 flex flex-col gap-3">

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.label.width}</label>
            <input
              type="number"
              className={inputCls}
              value={label.widthMm}
              min={1}
              step={1}
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
              step={1}
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
