import { useLabelStore } from "../../store/labelStore";
import { ObjectRegistry } from "../../registry";
import { dotsToMm, mmToDots } from "../../lib/coordinates";
import {
  mmToUnit,
  unitToMm,
  unitLabel,
  unitStep,
  SNAP_DEFAULT_MM,
} from "../../lib/units";
import type { Unit } from "../../lib/units";
import { useT } from "../../lib/useT";
import { inputCls, labelCls } from "./styles";
import type { LabelConfig } from "../../types/ObjectType";

export function PropertiesPanel() {
  const t = useT();
  const {
    objects,
    selectedIds,
    updateObject,
    label,
    setLabelConfig,
    canvasSettings,
    setCanvasSettings,
  } = useLabelStore();
  const unit = canvasSettings.unit;
  const obj = objects.find((o) => o.id === selectedIds[0]);

  if (selectedIds.length > 1) {
    return (
      <div className="flex flex-col">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
          <span className="font-mono text-xs text-accent">▣</span>
          <span className="text-xs font-medium text-text">
            {selectedIds.length} objects selected
          </span>
        </div>
        <p className="px-3 py-3 text-xs text-muted">
          {t.properties.x} / {t.properties.y}: use arrow keys to move
        </p>
      </div>
    );
  }

  if (!obj) {
    return (
      <LabelConfigPanel
        label={label}
        onUpdate={setLabelConfig}
        unit={unit}
        onUnitChange={(u) =>
          setCanvasSettings({ unit: u, snapSizeMm: SNAP_DEFAULT_MM[u] })
        }
      />
    );
  }

  const definition = ObjectRegistry[obj.type];
  const TypePanel = definition?.PropertiesPanel;

  return (
    <div className="flex flex-col">
      {/* Type header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className="font-mono text-xs text-accent">
          {definition?.icon}
        </span>
        <span className="text-xs font-medium text-text">
          {(t.types as Record<string, string>)[obj.type] ?? definition?.label}
        </span>
        <span className="font-mono text-[10px] text-muted ml-auto truncate">
          {obj.id.slice(0, 8)}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-4">
        {/* Position */}
        <div className="flex flex-col gap-2">
          <p className={labelCls}>
            {t.properties.positionSection} ({unitLabel(unit)})
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t.properties.x}</label>
              <input
                type="number"
                className={inputCls}
                value={mmToUnit(dotsToMm(obj.x, label.dpmm), unit)}
                step={unitStep(unit)}
                onChange={(e) =>
                  updateObject(obj.id, {
                    x: mmToDots(
                      unitToMm(Number(e.target.value), unit),
                      label.dpmm,
                    ),
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t.properties.y}</label>
              <input
                type="number"
                className={inputCls}
                value={mmToUnit(dotsToMm(obj.y, label.dpmm), unit)}
                step={unitStep(unit)}
                onChange={(e) =>
                  updateObject(obj.id, {
                    y: mmToDots(
                      unitToMm(Number(e.target.value), unit),
                      label.dpmm,
                    ),
                  })
                }
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

        <div className="border-t border-border" />

        {/* Comment (^FX) */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.properties.comment}</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={obj.comment ?? ""}
            onChange={(e) =>
              updateObject(obj.id, { comment: e.target.value || undefined })
            }
          />
        </div>
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
  {
    label: '4" × 6"  — 101 × 152 mm',
    widthMm: 101.6,
    heightMm: 152.4,
    dpmm: 8,
  },
  {
    label: '4" × 4"  — 101 × 101 mm',
    widthMm: 101.6,
    heightMm: 101.6,
    dpmm: 8,
  },
  { label: '4" × 3"  — 101 × 76 mm', widthMm: 101.6, heightMm: 76.2, dpmm: 8 },
  { label: '4" × 2"  — 101 × 51 mm', widthMm: 101.6, heightMm: 50.8, dpmm: 8 },
  { label: '3" × 2"  — 76 × 51 mm', widthMm: 76.2, heightMm: 50.8, dpmm: 8 },
  { label: '2" × 1"  — 51 × 25 mm', widthMm: 50.8, heightMm: 25.4, dpmm: 8 },
  { label: "100 × 150 mm", widthMm: 100, heightMm: 150, dpmm: 8 },
  { label: "100 × 100 mm", widthMm: 100, heightMm: 100, dpmm: 8 },
  { label: "100 × 50 mm", widthMm: 100, heightMm: 50, dpmm: 8 },
  { label: "62 × 29 mm  (Brother)", widthMm: 62, heightMm: 29, dpmm: 12 },
  { label: "57 × 32 mm  (Brother)", widthMm: 57, heightMm: 32, dpmm: 12 },
  { label: "DIN A7  —  74 × 105 mm", widthMm: 74, heightMm: 105, dpmm: 8 },
  { label: "DIN A6  — 105 × 148 mm", widthMm: 105, heightMm: 148, dpmm: 8 },
  { label: "DIN A5  — 148 × 210 mm", widthMm: 148, heightMm: 210, dpmm: 8 },
  { label: "DIN A4  — 210 × 297 mm", widthMm: 210, heightMm: 297, dpmm: 8 },
];

// ── LabelConfigPanel ───────────────────────────────────────────────────────────

interface LabelConfigPanelProps {
  label: LabelConfig;
  onUpdate: (config: Partial<LabelConfig>) => void;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
}

function LabelConfigPanel({
  label,
  onUpdate,
  unit,
  onUnitChange,
}: LabelConfigPanelProps) {
  const t = useT();
  const matchedPreset = PRESETS.find(
    (p) =>
      p.widthMm === label.widthMm &&
      p.heightMm === label.heightMm &&
      p.dpmm === label.dpmm,
  );
  const presetValue = matchedPreset
    ? PRESETS.indexOf(matchedPreset).toString()
    : "custom";

  const handlePreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "custom") return;
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
          <select
            className={inputCls}
            value={presetValue}
            onChange={handlePreset}
          >
            <option value="custom">{t.label.presetCustom}</option>
            {PRESETS.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-border" />

        <div className="flex items-center justify-between">
          <span className={labelCls}>
            {t.label.width} / {t.label.height}
          </span>
          <div className="flex rounded overflow-hidden border border-border text-[10px] font-mono">
            {(["mm", "cm", "in"] as const).map((u) => (
              <button
                key={u}
                onClick={() => onUnitChange(u)}
                className={`px-1.5 py-0.5 transition-colors ${u === unit ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.label.width}</label>
            <input
              type="number"
              className={inputCls}
              value={mmToUnit(label.widthMm, unit)}
              min={mmToUnit(1, unit)}
              step={unitStep(unit)}
              onChange={(e) =>
                onUpdate({ widthMm: unitToMm(Number(e.target.value), unit) })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.label.height}</label>
            <input
              type="number"
              className={inputCls}
              value={mmToUnit(label.heightMm, unit)}
              min={mmToUnit(1, unit)}
              step={unitStep(unit)}
              onChange={(e) =>
                onUpdate({ heightMm: unitToMm(Number(e.target.value), unit) })
              }
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

        <div className="border-t border-border" />

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.mediaMode}</label>
          <select
            className={inputCls}
            value={label.mediaMode ?? ""}
            onChange={(e) =>
              onUpdate({
                mediaMode:
                  (e.target.value as LabelConfig["mediaMode"]) || undefined,
              })
            }
          >
            <option value="">{t.label.presetCustom}</option>
            <option value="T">{t.label.mediaModeT}</option>
            <option value="V">{t.label.mediaModeV}</option>
            <option value="D">{t.label.mediaModeD}</option>
            <option value="K">{t.label.mediaModeK}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.labelShift}</label>
          <input
            type="number"
            className={inputCls}
            value={label.labelShift ?? 0}
            onChange={(e) =>
              onUpdate({ labelShift: Number(e.target.value) || undefined })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.printQuantity}</label>
          <input
            type="number"
            className={inputCls}
            value={label.printQuantity ?? 1}
            min={1}
            onChange={(e) =>
              onUpdate({
                printQuantity:
                  Number(e.target.value) > 1
                    ? Number(e.target.value)
                    : undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
