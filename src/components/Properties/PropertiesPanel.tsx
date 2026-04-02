import { useLabelStore } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import { dotsToMm, mmToDots } from '../../lib/coordinates';

const inputCls = 'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs font-mono text-text focus:border-accent focus:outline-none';
const labelCls = 'font-mono text-[10px] text-muted uppercase tracking-wider';

export function PropertiesPanel() {
  const { objects, selectedId, updateObject } = useLabelStore();
  const obj = objects.find((o) => o.id === selectedId);

  if (!obj) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="font-mono text-[11px] text-muted text-center leading-relaxed">
          Objekt auswählen<br />oder aus der Palette ziehen
        </p>
      </div>
    );
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
          <p className={labelCls}>Position (mm)</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>X</label>
              <input
                type="number"
                className={inputCls}
                value={dotsToMm(obj.x)}
                step={0.5}
                onChange={(e) => updateObject(obj.id, { x: mmToDots(Number(e.target.value)) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Y</label>
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

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Typ-spezifische Props */}
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
