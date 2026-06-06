import { useId, type RefObject } from "react";
import { InformationCircleIcon, FolderPlusIcon } from "@heroicons/react/16/solid";
import { useLabelStore, useCurrentObjects } from "../../store/labelStore";
import type { LabelCanvasHandle } from "../Canvas/LabelCanvas";
import type { AlignAxis } from "../../lib/alignment";
import { getEntry } from "../../registry";
import { getPanel } from "../../registry/panels";
import { canGroupSelection, findObjectById, isGroup } from "../../types/Group";
import { BWIP_APPROX_SEVERITY } from "../Canvas/bwipConstants";
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
import { VariableBindingControl } from "../Variables/VariableBindingControl";
import { applyBindingToObject, clockCtxFromLabel, lookupBoundVariable } from "../../lib/variableBinding";
import { inputCls, labelCls } from "./styles";
import type { LabelConfig } from "../../types/LabelConfig";
import {
  getAvailableFontIds,
  stripDrivePrefix,
} from "../../lib/customFonts";

/** Tooltip-icon flagging that the canvas render is approximate for
 *  the given object type. Two severities collapse into one icon
 *  with a per-severity hint string. Returns null when the type's
 *  render is fully trusted (no entry in BWIP_APPROX_SEVERITY). */
function BwipApproxIcon({ type }: { type: string }) {
  const t = useT();
  const severity = BWIP_APPROX_SEVERITY.get(type);
  if (!severity) return null;
  const title =
    severity === "approx"
      ? t.properties.visualApproxHint
      : t.properties.visualApproxUnverifiedHint;
  return (
    <InformationCircleIcon
      className="w-3.5 h-3.5 text-muted/60 cursor-help"
      title={title}
    />
  );
}

/** POSITION section header with centre-on-label tools docked right;
 *  same Figma/Sketch/Affinity convention used across leaf, group and
 *  multi-select panels. `unitSuffix` shows only when X/Y inputs sit
 *  below (leaf case); group + multi-select pass it bare. `useId`
 *  ties the label to the AlignButtons group so screen readers
 *  announce "Position, button group" instead of three loose icons. */
function PositionSectionHeader({
  unitSuffix,
  onAlign,
}: {
  unitSuffix?: string;
  onAlign: (axis: AlignAxis) => void;
}) {
  const t = useT();
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <p id={labelId} className={labelCls}>
        {t.properties.positionSection}
        {unitSuffix ? ` (${unitSuffix})` : ""}
      </p>
      <AlignButtons onAlign={onAlign} ariaLabelledBy={labelId} />
    </div>
  );
}

interface PropertiesPanelProps {
  /** Imperative handle on the canvas; required for actions that need
   *  live render bboxes (alignment). The inner null-check on `.current`
   *  covers the brief window before LabelCanvas mounts. */
  canvasRef: RefObject<LabelCanvasHandle | null>;
}

export function PropertiesPanel({ canvasRef }: PropertiesPanelProps) {
  const t = useT();
  const {
    selectedIds,
    updateObject,
    updateVariable,
    variables,
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
          <div className="flex flex-col gap-2">
            <PositionSectionHeader onAlign={handleAlign} />
            <p className="text-xs text-muted">
              {t.properties.x} / {t.properties.y}: {t.properties.multipleSelectedHint}
            </p>
          </div>
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

  const definition = getEntry(obj.type);
  const TypePanel = getPanel(obj.type)?.PropertiesPanel;
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
        <BwipApproxIcon type={obj.type} />

        <span className="font-mono text-[10px] text-muted ml-auto truncate">
          {obj.id.slice(0, 8)}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-4">
        {/* Name field: exposed only for groups; leaf rows fall back to
            their registry label in the layers panel. The field is on
            LabelObjectBase so adding it for other types would not need
            a schema change. */}
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
            still applies; it expands to the group's leaves at the
            canvas layer. */}
        <div className="flex flex-col gap-2">
          {groupRow ? (
            // Groups have no per-leaf position inputs; header alone.
            <PositionSectionHeader onAlign={handleAlign} />
          ) : (
            <>
              <PositionSectionHeader onAlign={handleAlign} unitSuffix={unitLabel(unit)} />
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
        </div>

        <div className="border-t border-border" />

        {/* Variable binding: shown for types that emit a ^FD content
            block (text + barcodes minus serial). Collapsed by default
            for unbound fields so beginners aren't distracted; opens
            automatically when the field is already bound so the
            binding state is visible without an extra click. The
            CollapsibleSection persists the user's manual toggle
            per-state in localStorage (separate ids for bound vs
            unbound), so each preference sticks. */}
        {definition?.bindable && !groupRow && (
          <>
            <CollapsibleSection
              id={obj.variableId ? 'properties-variable-bound' : 'properties-variable-unbound'}
              title={t.variables.sectionTitle}
              defaultOpen={!!obj.variableId}
            >
              <VariableBindingControl obj={obj} />
            </CollapsibleSection>
            <div className="border-t border-border" />
          </>
        )}

        {/* Per-type panel: only leaves have a registry entry, so TypePanel
            is never present for groups. The isGroup guard narrows obj for
            TypeScript at the call site since registry panels expect the
            leaf shape (props field present).

            When a binding is active we hand TypePanel a patched obj where
            props.content is the variable's defaultValue (so the CONTENT
            input mirrors the canvas) and we re-route content edits into
            updateVariable so typing into the per-type input directly
            edits the variable's default. Non-content props (fontHeight,
            rotation, …) keep flowing to updateObject untouched. */}
        {TypePanel && !groupRow && (() => {
          const boundVariable = lookupBoundVariable(obj, variables);
          const patchedObj = boundVariable
            ? applyBindingToObject(obj, variables, null, "preview", clockCtxFromLabel(label))
            : obj;
          const handleChange = boundVariable
            ? (props: object) => {
                const next = { ...(props as Record<string, unknown>) };
                if (typeof next.content === 'string') {
                  updateVariable(boundVariable.id, {
                    defaultValue: next.content,
                  });
                  delete next.content;
                }
                if (Object.keys(next).length > 0) {
                  updateObject(obj.id, { props: next });
                }
              }
            : (props: object) => updateObject(obj.id, { props });
          return (
            <>
              <TypePanel obj={patchedObj} onChange={handleChange} />
              <div className="border-t border-border" />
            </>
          );
        })()}

        {/* Comment (^FX); leaves only: groups emit no ZPL of their own
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

        {/* Lock; paired with the LayersPanel lock icon; mirroring it here
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

        {/* Include in ZPL output; paired with the LayersPanel eye toggle:
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

  // ^CF / ^A suggestions: the shared resolver returns the same union
  // (built-ins + every ^CW alias + every built-in preview binding) the
  // per-text font dropdown uses, so the global default selector and
  // the per-field selector show identical labels. A preview TTF wins
  // over the printer path in the suffix because it is what the canvas
  // is actually rendering with.
  const fontIdOptions = getAvailableFontIds(label).map((opt) => {
    const previewName =
      opt.previewFontName ??
      (opt.path ? stripDrivePrefix(opt.path) : undefined);
    return { value: opt.id, label: previewName };
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
          id="label-fonts"
          title={t.label.fontsHeading}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.defaultFont}</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">
                {t.label.defaultFontId}
              </label>
              <select
                className={inputCls}
                value={label.defaultFontId ?? ""}
                onChange={(e) =>
                  onUpdate({ defaultFontId: e.target.value || undefined })
                }
              >
                <option value="">{t.label.defaultFontIdNone}</option>
                {fontIdOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value}
                    {opt.label ? ` — ${opt.label}` : ""}
                  </option>
                ))}
              </select>
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
    </div>
  );
}

