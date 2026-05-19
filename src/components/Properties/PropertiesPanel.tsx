import type { RefObject } from "react";
import { InformationCircleIcon, FolderPlusIcon } from "@heroicons/react/16/solid";
import { useLabelStore, useCurrentObjects } from "../../store/labelStore";
import type { LabelCanvasHandle } from "../Canvas/LabelCanvas";
import type { AlignAxis } from "../../lib/alignment";
import { ObjectRegistry } from "../../registry";
import { canGroupSelection, findObjectById, isGroup } from "../../types/Group";
import { BWIP_VISUAL_APPROX_TYPES } from "../Canvas/bwipConstants";
import { stripZplCommandChars } from "../../registry/zplHelpers";
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
import { parseIntOrUndef } from "../../lib/inputParse";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { AlignButtons } from "./AlignButtons";
import { inputCls, labelCls } from "./styles";
import type { LabelConfig } from "../../types/ObjectType";
import { ZPL_BUILTIN_FONT_IDS } from "../../lib/customFonts";

interface PropertiesPanelProps {
  /** Imperative handle on the canvas — used for actions that need live render
   *  bboxes (alignment, future zoom-to-selection, etc.). Required so the
   *  type system forces the caller to wire it up; the inner null-check on
   *  `.current` only covers the brief window before LabelCanvas mounts. */
  canvasRef: RefObject<LabelCanvasHandle | null>;
}

export function PropertiesPanel({ canvasRef }: PropertiesPanelProps) {
  const t = useT();
  const {
    selectedIds,
    updateObject,
    groupSelection,
    label,
    setLabelConfig,
    canvasSettings,
    setCanvasSettings,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const unit = canvasSettings.unit;
  // Walk the tree: when the layers panel drills into a nested child, the
  // selection holds a leaf id that's not at top level. A plain
  // top-level .find would miss it and the panel would silently fall
  // through to LabelConfigPanel.
  const firstId = selectedIds[0];
  const obj = firstId !== undefined ? findObjectById(objects, firstId) : undefined;
  const handleAlign = (axis: AlignAxis) =>
    canvasRef.current?.alignSelectionToLabel(axis);

  if (selectedIds.length > 1) {
    const canGroup = canGroupSelection(objects, selectedIds);
    return (
      <div className="flex flex-col">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
          <span className="font-mono text-xs text-accent">▣</span>
          <span className="text-xs font-medium text-text">
            {t.properties.multipleSelectedFmt.replace('{n}', String(selectedIds.length))}
          </span>
        </div>
        <div className="px-3 py-3 flex flex-col gap-3">
          <p className="text-xs text-muted">
            {t.properties.x} / {t.properties.y}: {t.properties.multipleSelectedHint}
          </p>
          <AlignButtons onAlign={handleAlign} />
          {canGroup && (
            <button
              type="button"
              onClick={groupSelection}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 text-text hover:bg-surface border border-border transition-colors"
            >
              <FolderPlusIcon className="w-3.5 h-3.5" />
              {t.properties.groupSelection}
            </button>
          )}
        </div>
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
  const groupRow = isGroup(obj);
  // Groups intentionally have no registry entry; surface a folder-shape
  // glyph here so the header reads as something rather than blank.
  const icon = groupRow ? '⊞' : definition?.icon;
  const typeLabel = groupRow
    ? t.types.group
    : (t.types as Record<string, string>)[obj.type] ?? definition?.label;

  return (
    <div className="flex flex-col">
      {/* Type header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className="font-mono text-xs text-accent">
          {icon}
        </span>
        <span className="text-xs font-medium text-text">
          {typeLabel}
        </span>
        {BWIP_VISUAL_APPROX_TYPES.has(obj.type) && (
          <InformationCircleIcon
            className="w-3.5 h-3.5 text-muted/60 cursor-help"
            title={t.properties.visualApproxHint}
          />
        )}
        <span className="font-mono text-[10px] text-muted ml-auto truncate">
          {obj.id.slice(0, 8)}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-4">
        {/* Name — currently exposed only for groups, since leaf rows still
            fall back to their registry label in the layers panel. The
            field lives on LabelObjectBase so adding it for other types
            later is a UI-only change. */}
        {groupRow && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.properties.name}</label>
            <input
              type="text"
              className={inputCls}
              value={obj.name ?? ''}
              placeholder={t.types.group}
              onChange={(e) =>
                updateObject(obj.id, { name: e.target.value || undefined })
              }
            />
          </div>
        )}

        {/* Position: groups have no meaningful x/y of their own (children
            store world coordinates), so the inputs are hidden. Align
            still applies — it expands to the group's leaves at the
            canvas layer. */}
        <div className="flex flex-col gap-2">
          {!groupRow && (
            <>
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
            </>
          )}
          <AlignButtons onAlign={handleAlign} />
        </div>

        <div className="border-t border-border" />

        {/* Per-type panel: only leaves have a registry entry, so TypePanel
            is never present for groups. The isGroup guard narrows obj for
            TypeScript at the call site since registry panels expect the
            leaf shape (props field present). */}
        {TypePanel && !groupRow && (
          <>
            <TypePanel
              obj={obj}
              onChange={(props) => updateObject(obj.id, { props })}
            />
            <div className="border-t border-border" />
          </>
        )}

        {/* Comment (^FX) — leaves only: groups emit no ZPL of their own
            so the comment would never reach the output. */}
        {!groupRow && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.properties.comment}</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={obj.comment ?? ""}
              onChange={(e) =>
                updateObject(obj.id, { comment: stripZplCommandChars(e.target.value) || undefined })
              }
            />
          </div>
        )}

        {/* Lock — paired with the LayersPanel lock icon; mirroring it here
            so a user already in PropertiesPanel can flip lock state without
            jumping panels. Lock itself is a meta-field bypass in the store,
            so the checkbox stays interactive even when the object is locked. */}
        <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!obj.locked}
            onChange={(e) =>
              updateObject(obj.id, { locked: e.target.checked || undefined })
            }
          />
          <span>{t.properties.lock}</span>
          <InformationCircleIcon
            className="w-3.5 h-3.5 text-muted/60 cursor-help shrink-0"
            title={t.properties.lockHint}
          />
        </label>

        {/* Include in ZPL output — paired with the LayersPanel eye toggle:
            visible controls editor render, includeInExport controls ZPL
            emission. Stored as undefined when on so default state stays
            absent from persisted JSON. */}
        <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={obj.includeInExport !== false}
            onChange={(e) =>
              updateObject(obj.id, { includeInExport: e.target.checked ? undefined : false })
            }
          />
          <span>{t.properties.includeInExport}</span>
          <InformationCircleIcon
            className="w-3.5 h-3.5 text-muted/60 cursor-help shrink-0"
            title={t.properties.includeInExportHint}
          />
        </label>
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

  // ^CF / ^A suggestions: built-in font letters plus every alias the
  // user has registered via ^CW. Set-based dedup keeps user-overridden
  // built-ins from appearing twice. The label on custom aliases shows
  // the referenced path so a bare letter is not mistaken for a built-in.
  const aliasPaths = new Map<string, string>();
  for (const m of label.customFonts ?? []) {
    if (m.alias) aliasPaths.set(m.alias, m.path);
  }
  const fontIdOptions = Array.from(
    new Set([
      ...ZPL_BUILTIN_FONT_IDS,
      ...aliasPaths.keys(),
    ]),
  ).map((id) => {
    const path = aliasPaths.get(id);
    // Strip the drive prefix (E:, R:, ...) from the display label;
    // the full path stays in the underlying customFonts entry and is
    // emitted verbatim to ZPL.
    return {
      value: id,
      label: path ? path.replace(/^[A-Z]:/, '') : undefined,
    };
  });

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

        <CollapsibleSection
          id="label-output"
          title={t.label.outputHeading}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
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
            <option value="">{t.label.printerDefault}</option>
            <option value="T">{t.label.mediaModeT}</option>
            <option value="V">{t.label.mediaModeV}</option>
            <option value="D">{t.label.mediaModeD}</option>
            <option value="K">{t.label.mediaModeK}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            {t.label.offsetsHeading}
            <InformationCircleIcon
              className="w-3.5 h-3.5 ml-1 inline-block align-text-bottom text-muted cursor-help"
              title={t.label.offsetsHint}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.labelHomeX}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.labelHomeX ?? ""}
                min={0}
                onChange={(e) =>
                  onUpdate({ labelHomeX: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.labelHomeY}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.labelHomeY ?? ""}
                min={0}
                onChange={(e) =>
                  onUpdate({ labelHomeY: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.labelTop}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.labelTop ?? ""}
                min={-120}
                max={120}
                onChange={(e) =>
                  onUpdate({ labelTop: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
          </div>
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
        </CollapsibleSection>

        <CollapsibleSection
          id="label-quantity-advanced"
          title={t.label.quantityAdvancedHeading}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.pauseCount}</label>
          <input
            type="number"
            className={inputCls}
            value={label.pauseCount ?? ""}
            min={0}
            max={99999999}
            onChange={(e) =>
              onUpdate({ pauseCount: parseIntOrUndef(e.target.value) })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.replicates}</label>
          <input
            type="number"
            className={inputCls}
            value={label.replicates ?? ""}
            min={0}
            max={99999999}
            onChange={(e) =>
              onUpdate({ replicates: parseIntOrUndef(e.target.value) })
            }
          />
        </div>

        <label
          className="flex items-center gap-2 text-xs"
          title={t.label.overridePauseCountHint}
        >
          <input
            type="checkbox"
            checked={label.overridePauseCount === "Y"}
            onChange={(e) =>
              onUpdate({
                overridePauseCount: e.target.checked ? "Y" : undefined,
              })
            }
          />
          {t.label.overridePauseCount}
        </label>
        </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="label-printer-settings"
          title={t.label.printerSettingsHeading}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            {t.label.speedHeading}
            <InformationCircleIcon
              className="w-3.5 h-3.5 ml-1 inline-block align-text-bottom text-muted cursor-help"
              title={t.label.printSpeedHint}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.speedPrint}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.printSpeed ?? ""}
                min={2}
                max={14}
                onChange={(e) =>
                  onUpdate({ printSpeed: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.speedSlew}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.slewSpeed ?? ""}
                min={2}
                max={14}
                onChange={(e) =>
                  onUpdate({ slewSpeed: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.speedBackfeed}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.backfeedSpeed ?? ""}
                min={2}
                max={14}
                onChange={(e) =>
                  onUpdate({ backfeedSpeed: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            {t.label.darknessHeading}
            <InformationCircleIcon
              className="w-3.5 h-3.5 ml-1 inline-block align-text-bottom text-muted cursor-help"
              title={t.label.darknessHint}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.darknessPermanent}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.darkness ?? ""}
                min={-30}
                max={30}
                onChange={(e) =>
                  onUpdate({ darkness: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.darknessInstant}
              </label>
              <input
                type="number"
                className={inputCls}
                value={label.instantDarkness ?? ""}
                min={0}
                max={30}
                onChange={(e) =>
                  onUpdate({ instantDarkness: parseIntOrUndef(e.target.value) })
                }
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.mediaType}</label>
          <select
            className={inputCls}
            value={label.mediaType ?? ""}
            onChange={(e) =>
              onUpdate({
                mediaType:
                  (e.target.value as LabelConfig["mediaType"]) || undefined,
              })
            }
          >
            <option value="">{t.label.printerDefault}</option>
            <option value="T">{t.label.mediaTypeT}</option>
            <option value="D">{t.label.mediaTypeD}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.printOrientation}</label>
          <select
            className={inputCls}
            value={label.printOrientation ?? ""}
            onChange={(e) =>
              onUpdate({
                printOrientation:
                  (e.target.value as LabelConfig["printOrientation"]) ||
                  undefined,
              })
            }
          >
            <option value="">{t.label.printerDefault}</option>
            <option value="N">{t.label.printOrientationN}</option>
            <option value="I">{t.label.printOrientationI}</option>
          </select>
          <label className="flex items-center gap-2 text-xs mt-1">
            <input
              type="checkbox"
              checked={label.mirror === "Y"}
              onChange={(e) =>
                onUpdate({ mirror: e.target.checked ? "Y" : undefined })
              }
            />
            {t.label.mirror}
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.defaultFont}</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.defaultFontId}
              </label>
              <input
                type="text"
                className={inputCls}
                maxLength={2}
                list="zpl-default-font-ids"
                value={label.defaultFontId ?? ""}
                onChange={(e) =>
                  onUpdate({ defaultFontId: e.target.value || undefined })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.defaultFontHeight}
              </label>
              <input
                type="number"
                className={inputCls}
                min={1}
                value={label.defaultFontHeight ?? ""}
                onChange={(e) =>
                  onUpdate({
                    defaultFontHeight: parseIntOrUndef(e.target.value),
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.defaultFontWidth}
              </label>
              <input
                type="number"
                className={inputCls}
                min={0}
                value={label.defaultFontWidth ?? ""}
                onChange={(e) =>
                  onUpdate({
                    defaultFontWidth: parseIntOrUndef(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </div>
        </div>
        </CollapsibleSection>
      </div>
      <datalist id="zpl-default-font-ids">
        {fontIdOptions.map((opt) => (
          <option key={opt.value} value={opt.value} label={opt.label} />
        ))}
      </datalist>
    </div>
  );
}

