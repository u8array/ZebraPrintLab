import { useId, type RefObject } from "react";
import { InformationCircleIcon, FolderPlusIcon } from "@heroicons/react/16/solid";
import { useLabelStore, useCurrentObjects } from "../../store/labelStore";
import type { LabelCanvasHandle } from "../Canvas/LabelCanvas";
import type { AlignOp, DistributeAxis, AlignRef } from "../../lib/align";
import type { AlignSelectionRef } from "../../store/slices/uiSlice";
import { getEntry } from "../../registry";
import { getPanel } from "../../registry/panels";
import { canGroupSelection, findObjectById, isGroup } from "../../types/Group";
import { BWIP_APPROX_SEVERITY } from "../../lib/bwipConstants";
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
import { SectionCard, StaticSectionCard } from "./SectionCard";
import { UnitNumberInput } from "./UnitNumberInput";
import { FieldLabel, ZplCmd } from "./ZplCmd";
import { Tooltip } from "../ui/Tooltip";
import { Select } from "../ui/Select";
import { fontSelectGroups } from "./fontSelectGroups";
import { AlignToolbar } from "./AlignToolbar";
import { inputCls, labelCls } from "./styles";
import { fieldGridCols, fieldGridCell } from "../ui/formStyles";
import type { LabelConfig } from "../../types/LabelConfig";

/** Optional dot value from a unit-string input: empty stays unset, otherwise
 *  the entered unit value is converted back to dots. */
function dotsFromUnitOrUndef(raw: string, unit: Unit, dpmm: number): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(mmToDots(unitToMm(n, unit), dpmm));
}

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
    <Tooltip content={title}>
      <InformationCircleIcon className="w-3.5 h-3.5 text-muted/60 cursor-help" />
    </Tooltip>
  );
}

/** POSITION section with align + distribute tools and the Align-To
 *  selector; same Figma/Sketch/Affinity convention used across leaf,
 *  group and multi-select panels. `unitSuffix` shows only when X/Y
 *  inputs sit below (leaf case). `useId` ties the section label to the
 *  toolbar group so screen readers announce a labelled button group. */
function PositionSectionHeader({
  unitSuffix,
  hideHeading,
  onAlign,
  onDistribute,
  onTidy,
  alignRef,
  onAlignRefChange,
  selectionCount,
}: {
  unitSuffix?: string;
  /** Hide the visible heading (kept for screen readers) when a card title
   *  already names the section, avoiding a duplicate label. */
  hideHeading?: boolean;
  onAlign: (op: AlignOp, ref: AlignRef) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onTidy: () => void;
  alignRef: AlignSelectionRef;
  onAlignRefChange: (ref: AlignSelectionRef) => void;
  selectionCount: number;
}) {
  const t = useT();
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className={hideHeading ? "sr-only" : labelCls}>
        {t.properties.positionSection}
        {unitSuffix ? ` (${unitSuffix})` : ""}
      </p>
      <AlignToolbar
        onAlign={onAlign}
        onDistribute={onDistribute}
        onTidy={onTidy}
        alignRef={alignRef}
        onAlignRefChange={onAlignRefChange}
        selectionCount={selectionCount}
        ariaLabelledBy={labelId}
      />
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
    groupSelection,
    label,
    setLabelConfig,
    canvasSettings,
    setCanvasSettings,
    alignRef,
    setAlignRef,
    showZplCommands,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const unit = canvasSettings.unit;
  // Walk the tree: when the layers panel drills into a nested child, the
  // selection holds a leaf id that's not at top level. A plain
  // top-level .find would miss it and the panel would silently fall
  // through to LabelConfigPanel.
  const firstId = selectedIds[0];
  const obj = firstId !== undefined ? findObjectById(objects, firstId) : undefined;
  const handleAlign = (op: AlignOp, ref: AlignRef) =>
    canvasRef.current?.alignSelection(op, ref);
  const handleDistribute = (axis: DistributeAxis) =>
    canvasRef.current?.distributeSelection(axis);
  const handleTidy = () => canvasRef.current?.tidySelection();

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
            <PositionSectionHeader
              onAlign={handleAlign}
              onDistribute={handleDistribute}
              onTidy={handleTidy}
              alignRef={alignRef}
              onAlignRefChange={setAlignRef}
              selectionCount={selectedIds.length}
            />
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
  // Power-user mode swaps the mnemonic chip for the type's ZPL command, matching
  // the palette icon slot. Groups have no command, so they keep the glyph.
  const headerBadge = showZplCommands && !groupRow ? definition?.zplCmd ?? icon : icon;
  const typeLabel = groupRow
    ? t.types.group
    : (t.types as Record<string, string>)[obj.type] ?? definition?.label;

  return (
    <div className="flex flex-col">
      {/* Type header: icon in an accent-tinted chip, id as a surface pill. */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2.5">
        <span className="flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-md bg-accent-dim text-accent font-mono text-xs font-semibold shrink-0">
          {headerBadge}
        </span>
        <span className="text-[13px] font-semibold text-text">
          {typeLabel}
        </span>
        <BwipApproxIcon type={obj.type} />

        <span className="font-mono text-[9px] text-muted bg-surface-2 px-1.5 py-0.5 rounded ml-auto shrink-0">
          {obj.id.slice(0, 8)}
        </span>
      </div>

      {/* Panel stays bg-surface (bg-bg would merge with the canvas); each
          SectionCard lifts off it via border + shadow. */}
      <div className="p-2 flex flex-col gap-2">
        {/* Name field: groups only (leaf rows fall back to their registry
            label in the layers panel). */}
        {groupRow && (
          <StaticSectionCard title={t.properties.name}>
            <input
              type="text"
              className={inputCls}
              aria-label={t.properties.name}
              value={obj.name ?? ''}
              placeholder={t.types.group}
              onChange={(e) =>
                updateObject(obj.id, { name: e.target.value || undefined })
              }
            />
          </StaticSectionCard>
        )}

        {/* Per-type panel first; each panel renders its own SectionCards
            (Content and/or Settings). Binding lives inside the content field
            (VariableContentField), so the panel sees the raw obj and plain
            prop writes; no content re-routing here. */}
        {TypePanel && !groupRow && (
          // Key by id so switching objects remounts the panel and resets its
          // transient reveal state (e.g. the Typography "Advanced" toggle).
          <TypePanel
            key={obj.id}
            obj={obj}
            onChange={(props: object) => updateObject(obj.id, { props })}
          />
        )}

        {/* Position & alignment. Groups have no per-leaf x/y (children store
            world coordinates), so the inputs are hidden; align still applies
            and expands to the group's leaves at the canvas layer. The card
            title names the section, so the inner heading is sr-only. */}
        <SectionCard
          id="properties-position"
          title={
            groupRow
              ? t.properties.positionSection
              : `${t.properties.positionSection} (${unitLabel(unit)})`
          }
        >
          {!groupRow && (
            <div className={`grid grid-cols-2 ${fieldGridCols}`}>
              <div className={fieldGridCell}>
                <FieldLabel cmd={obj.positionType === "FT" ? "^FT" : "^FO"}>
                  {t.properties.x}
                </FieldLabel>
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
              <div className={fieldGridCell}>
                <FieldLabel cmd={obj.positionType === "FT" ? "^FT" : "^FO"}>
                  {t.properties.y}
                </FieldLabel>
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
          )}
          <PositionSectionHeader
            hideHeading
            unitSuffix={!groupRow ? unitLabel(unit) : undefined}
            onAlign={handleAlign}
            onDistribute={handleDistribute}
            onTidy={handleTidy}
            alignRef={alignRef}
            onAlignRefChange={setAlignRef}
            selectionCount={selectedIds.length}
          />
        </SectionCard>

        {/* Options: comment (^FX, leaves only), lock, include-in-export.
            Collapsed by default since these are set rarely. */}
        <SectionCard
          id="properties-options"
          title={t.properties.optionsSection}
          defaultOpen={false}
        >
          {!groupRow && (
            <div className="flex flex-col gap-1">
              <FieldLabel cmd="^FX">{t.properties.comment}</FieldLabel>
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

          {/* Lock mirrors the LayersPanel lock icon; meta-field bypass keeps
              the checkbox interactive even when the object is locked. */}
          <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!obj.locked}
              onChange={(e) =>
                updateObject(obj.id, { locked: e.target.checked || undefined })
              }
            />
            <span>{t.properties.lock}</span>
            <Tooltip content={t.properties.lockHint}>
              <InformationCircleIcon className="w-3.5 h-3.5 text-muted/60 cursor-help shrink-0" />
            </Tooltip>
          </label>

          {/* includeInExport controls ZPL emission (vs the eye toggle's
              editor visibility); stored undefined when on. */}
          <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={obj.includeInExport !== false}
              onChange={(e) =>
                updateObject(obj.id, { includeInExport: e.target.checked ? undefined : false })
              }
            />
            <span>{t.properties.includeInExport}</span>
            <Tooltip content={t.properties.includeInExportHint}>
              <InformationCircleIcon className="w-3.5 h-3.5 text-muted/60 cursor-help shrink-0" />
            </Tooltip>
          </label>
        </SectionCard>
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
    label: '4" × 6" (101 × 152 mm)',
    widthMm: 101.6,
    heightMm: 152.4,
    dpmm: 8,
  },
  {
    label: '4" × 4" (101 × 101 mm)',
    widthMm: 101.6,
    heightMm: 101.6,
    dpmm: 8,
  },
  { label: '4" × 3" (101 × 76 mm)', widthMm: 101.6, heightMm: 76.2, dpmm: 8 },
  { label: '4" × 2" (101 × 51 mm)', widthMm: 101.6, heightMm: 50.8, dpmm: 8 },
  { label: '3" × 2" (76 × 51 mm)', widthMm: 76.2, heightMm: 50.8, dpmm: 8 },
  { label: '2" × 1" (51 × 25 mm)', widthMm: 50.8, heightMm: 25.4, dpmm: 8 },
  { label: "100 × 150 mm", widthMm: 100, heightMm: 150, dpmm: 8 },
  { label: "100 × 100 mm", widthMm: 100, heightMm: 100, dpmm: 8 },
  { label: "100 × 50 mm", widthMm: 100, heightMm: 50, dpmm: 8 },
  { label: "62 × 29 mm  (Brother)", widthMm: 62, heightMm: 29, dpmm: 12 },
  { label: "57 × 32 mm  (Brother)", widthMm: 57, heightMm: 32, dpmm: 12 },
  { label: "DIN A7 (74 × 105 mm)", widthMm: 74, heightMm: 105, dpmm: 8 },
  { label: "DIN A6 (105 × 148 mm)", widthMm: 105, heightMm: 148, dpmm: 8 },
  { label: "DIN A5 (148 × 210 mm)", widthMm: 148, heightMm: 210, dpmm: 8 },
  { label: "DIN A4 (210 × 297 mm)", widthMm: 210, heightMm: 297, dpmm: 8 },
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

  const handlePreset = (value: string) => {
    if (value === "custom") return;
    const p = PRESETS[Number(value)];
    if (!p) return;
    onUpdate({ widthMm: p.widthMm, heightMm: p.heightMm, dpmm: p.dpmm });
  };

  // ^CF / ^A suggestions: the shared resolver returns the same union
  // (built-ins + every ^CW alias + every built-in preview binding) the
  // per-text font dropdown uses, so the global default selector and
  // the per-field selector show identical labels. A preview TTF wins
  // over the printer path in the suffix because it is what the canvas
  // is actually rendering with.
  const fontGroups = fontSelectGroups(label, t, t.label.defaultFontIdNone);

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-text">{t.label.heading}</span>
      </div>

      <div className="p-2 flex flex-col gap-2">
        <StaticSectionCard title={t.label.formatSection}>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.label.preset}</label>
          <Select<string>
            value={presetValue}
            onChange={handlePreset}
            groups={[
              {
                options: [
                  { value: "custom", label: t.label.presetCustom },
                  ...PRESETS.map((p, i) => ({ value: String(i), label: p.label })),
                ],
              },
            ]}
          />
        </div>

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

        <div className={`grid grid-cols-2 ${fieldGridCols}`}>
          <div className={fieldGridCell}>
            <FieldLabel cmd="^PW">{t.label.width}</FieldLabel>
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
          <div className={fieldGridCell}>
            <FieldLabel cmd="^LL">{t.label.height}</FieldLabel>
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
          <Select<number>
            value={label.dpmm}
            onChange={(value) => onUpdate({ dpmm: value })}
            groups={[
              {
                options: [
                  { value: 6, label: t.label.dpmm6 },
                  { value: 8, label: t.label.dpmm8 },
                  { value: 12, label: t.label.dpmm12 },
                  { value: 24, label: t.label.dpmm24 },
                ],
              },
            ]}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            {t.label.safeArea}
            <Tooltip content={t.label.safeAreaHint}>
              <InformationCircleIcon className="w-3.5 h-3.5 ml-1 inline-block align-text-bottom text-muted cursor-help" />
            </Tooltip>
          </label>
          <input
            type="number"
            className={inputCls}
            value={
              label.safeAreaMm === undefined ? "" : mmToUnit(label.safeAreaMm, unit)
            }
            min={0}
            step={unitStep(unit)}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const mm = raw === "" ? undefined : unitToMm(Number(raw), unit);
              onUpdate({ safeAreaMm: mm !== undefined && mm > 0 ? mm : undefined });
            }}
          />
        </div>
        </StaticSectionCard>

        <SectionCard
          id="label-output"
          title={t.label.outputHeading}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            {t.label.offsetsHeading}
            <Tooltip content={t.label.offsetsHint}>
              <InformationCircleIcon className="w-3.5 h-3.5 ml-1 inline-block align-text-bottom text-muted cursor-help" />
            </Tooltip>
          </label>
          <div className={`grid grid-cols-3 ${fieldGridCols}`}>
            <div className={fieldGridCell}>
              <div className="flex items-start justify-between gap-2">
                <label className="text-[10px] text-muted">{`${t.label.labelHomeX} (${unitLabel(unit)})`}</label>
                <ZplCmd cmd="^LH" />
              </div>
              <input
                type="number"
                className={inputCls}
                value={label.labelHomeX === undefined ? "" : mmToUnit(dotsToMm(label.labelHomeX, label.dpmm), unit)}
                min={0}
                step={unitStep(unit)}
                onChange={(e) =>
                  onUpdate({ labelHomeX: dotsFromUnitOrUndef(e.target.value, unit, label.dpmm) })
                }
              />
            </div>
            <div className={fieldGridCell}>
              <div className="flex items-start justify-between gap-2">
                <label className="text-[10px] text-muted">{`${t.label.labelHomeY} (${unitLabel(unit)})`}</label>
                <ZplCmd cmd="^LH" />
              </div>
              <input
                type="number"
                className={inputCls}
                value={label.labelHomeY === undefined ? "" : mmToUnit(dotsToMm(label.labelHomeY, label.dpmm), unit)}
                min={0}
                step={unitStep(unit)}
                onChange={(e) =>
                  onUpdate({ labelHomeY: dotsFromUnitOrUndef(e.target.value, unit, label.dpmm) })
                }
              />
            </div>
            <div className={fieldGridCell}>
              <div className="flex items-start justify-between gap-2">
                <label className="text-[10px] text-muted">{`${t.label.labelTop} (${unitLabel(unit)})`}</label>
                <ZplCmd cmd="^LT" />
              </div>
              <input
                type="number"
                className={inputCls}
                value={label.labelTop === undefined ? "" : mmToUnit(dotsToMm(label.labelTop, label.dpmm), unit)}
                min={mmToUnit(dotsToMm(-120, label.dpmm), unit)}
                max={mmToUnit(dotsToMm(120, label.dpmm), unit)}
                step={unitStep(unit)}
                onChange={(e) =>
                  onUpdate({ labelTop: dotsFromUnitOrUndef(e.target.value, unit, label.dpmm) })
                }
              />
            </div>
          </div>
        </div>

        <UnitNumberInput
          label={t.label.labelShift}
          valueDots={label.labelShift}
          allowUnset
          onChangeDots={(labelShift) => onUpdate({ labelShift })}
          zplCmd="^LS"
        />

        <div className="flex flex-col gap-1">
          <FieldLabel cmd="^PQ">{t.label.printQuantity}</FieldLabel>
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
        </SectionCard>

        <SectionCard
          id="label-quantity-advanced"
          title={t.label.quantityAdvancedHeading}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <FieldLabel cmd="^PQ">{t.label.pauseCount}</FieldLabel>
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
          <FieldLabel cmd="^PQ">{t.label.replicates}</FieldLabel>
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

        <label className="flex w-full items-center gap-2 text-xs">
          <Tooltip content={t.label.overridePauseCountHint}>
            <input
              type="checkbox"
              checked={label.overridePauseCount === "Y"}
              onChange={(e) =>
                onUpdate({
                  overridePauseCount: e.target.checked ? "Y" : undefined,
                })
              }
            />
          </Tooltip>
          {t.label.overridePauseCount}
        </label>
        </div>
        </SectionCard>

        <SectionCard
          id="label-fonts"
          title={t.label.defaultFont}
          defaultOpen={false}
        >
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <FieldLabel cmd="^CF">{t.label.defaultFontId}</FieldLabel>
          <Select
            aria-label={t.label.defaultFontId}
            value={label.defaultFontId ?? ""}
            groups={fontGroups}
            onChange={(v) => onUpdate({ defaultFontId: v || undefined })}
          />
        </div>
        <div className={`grid grid-cols-2 ${fieldGridCols}`}>
          <UnitNumberInput
            label={t.label.defaultFontHeight}
            valueDots={label.defaultFontHeight}
            minDots={1}
            allowUnset
            onChangeDots={(defaultFontHeight) => onUpdate({ defaultFontHeight })}
            zplCmd="^CF"
            className={fieldGridCell}
          />
          <UnitNumberInput
            label={t.label.defaultFontWidth}
            valueDots={label.defaultFontWidth}
            minDots={0}
            allowUnset
            onChangeDots={(defaultFontWidth) => onUpdate({ defaultFontWidth })}
            zplCmd="^CF"
            className={fieldGridCell}
          />
        </div>
        </div>
        </SectionCard>
      </div>
    </div>
  );
}

