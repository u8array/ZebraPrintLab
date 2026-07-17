import { isGroup, type LabelObject, type LeafObject, type Page } from "@zplab/core/types/Group";
import { getEntry } from "@zplab/core/registry/index";
import type { LabelConfig } from "@zplab/core/types/LabelConfig";

/** A field whose scaled value had to be clamped or snapped, so the rescale is
 *  not perfectly proportional and the user should know. */
export interface RescaleWarning {
  id: string;
  name: string;
  type: string;
  prop: string;
  reason: "moduleClamped" | "magnificationClamped" | "dimensionClamped" | "imageFloor" | "imageFixed" | "deviceFontSnap";
}

export interface RescaleResult {
  pages: Page[];
  label: LabelConfig;
  warnings: RescaleWarning[];
}

const MODULE_MAX = 10; // ^BY module-width ceiling (no per-type SSOT for the max).
const IMAGE_MIN_DOTS = 8;

// Dot-valued props scaled proportionally; absent or 0 (unset block dims) stay 0.
// `rounding` is excluded on purpose: ^GB's corner param is a 0-8 index, not
// dots, and the radius already scales because width/height do.
const SCALE_MIN1 = ["width", "height", "length", "thickness", "blockWidth", "blockHeight", "fontHeight", "rowHeight", "microPdfRowHeight"] as const;
// Dot-valued props that are legitimately 0 (auto width, no gap/indent).
const SCALE_MIN0 = ["fontWidth", "blockHangingIndent", "fpCharGap"] as const;
// Signed dot-valued props: ^FB line spacing can be negative (tighter leading,
// spec -9999..9999), so scale preserving sign rather than flooring at 0.
const SCALE_SIGNED = ["blockLineSpacing"] as const;

const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));
const labelOf = (leaf: LeafObject): string => (leaf.name && leaf.name.trim() ? leaf.name : leaf.type);

/** Scale an integer prop and clamp to its spec bounds, reporting whether the
 *  rounded value actually had to be pulled into range (a mere round is not a
 *  clamp, so it is not flagged). */
function scaleClamped(raw: number, factor: number, min: number, max: number) {
  const rounded = Math.round(raw * factor);
  const value = clamp(min, max, rounded);
  return { value, clamped: value !== rounded };
}

function rescaleLeaf(leaf: LeafObject, factor: number, warnings: RescaleWarning[]): LeafObject {
  const props = leaf.props as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...props };
  const warn = (prop: string, reason: RescaleWarning["reason"]) =>
    warnings.push({ id: leaf.id, name: labelOf(leaf), type: leaf.type, prop, reason });

  for (const k of SCALE_MIN1) {
    const v = props[k];
    if (typeof v === "number" && v > 0) next[k] = Math.max(1, Math.round(v * factor));
  }
  for (const k of SCALE_MIN0) {
    const v = props[k];
    if (typeof v === "number") next[k] = Math.max(0, Math.round(v * factor));
  }
  for (const k of SCALE_SIGNED) {
    const v = props[k];
    if (typeof v === "number") next[k] = Math.round(v * factor);
  }

  // Editable bitmaps scale their box and drop the stale GFA cache so it
  // re-encodes at the new resolution. Verbatim (^GF) and recall (^XG) graphics
  // carry fixed-resolution bytes: their footprint is locked (mirrors
  // image.commitTransform), only position scales, and we warn it cannot rescale.
  if (leaf.type === "image") {
    if (props.rawGf != null || props.storedAs != null) {
      warn("widthDots", "imageFixed");
    } else {
      for (const k of ["widthDots", "heightDots"] as const) {
        const v = props[k];
        if (typeof v === "number") {
          const ideal = Math.round(v * factor);
          next[k] = Math.max(IMAGE_MIN_DOTS, ideal);
          if (ideal < IMAGE_MIN_DOTS) warn(k, "imageFloor");
        }
      }
      if (typeof props._gfaCache === "string") next._gfaCache = undefined;
    }
  }

  // Clamp bounds come from the registry so a new symbology can't silently skip
  // them: module width via moduleWidthMin (^BY max 10), the single integer
  // module/magnification prop via uniformScaleProp.
  const entry = getEntry(leaf.type);
  if (typeof props.moduleWidth === "number") {
    const r = scaleClamped(props.moduleWidth, factor, entry?.moduleWidthMin ?? 1, MODULE_MAX);
    next.moduleWidth = r.value;
    if (r.clamped) warn("moduleWidth", "moduleClamped");
  }
  const usp = entry?.uniformScaleProp;
  if (usp && typeof props[usp.name] === "number") {
    const r = scaleClamped(props[usp.name] as number, factor, usp.min, usp.max);
    next[usp.name] = r.value;
    if (r.clamped) warn(usp.name, usp.name === "dimension" ? "dimensionClamped" : "magnificationClamped");
  }

  // Device fonts A-H render at discrete magnifications, so a non-integer factor
  // makes the printed size snap rather than scale exactly.
  if (leaf.type === "text" && factor !== 1) {
    const fontId = props.fontId;
    if (typeof fontId === "string" && /^[A-H]$/.test(fontId)) warn("fontHeight", "deviceFontSnap");
  }

  return { ...leaf, x: Math.round(leaf.x * factor), y: Math.round(leaf.y * factor), props: next } as unknown as LeafObject;
}

function rescaleObjects(objects: LabelObject[], factor: number, warnings: RescaleWarning[]): LabelObject[] {
  return objects.map((obj) =>
    isGroup(obj)
      ? { ...obj, children: rescaleObjects(obj.children, factor, warnings) }
      : rescaleLeaf(obj, factor, warnings),
  );
}

/** Rescale a whole design from `fromDpmm` to `toDpmm`, keeping the physical
 *  (mm) size constant by scaling every dot-valued field by the density ratio.
 *  Pure: returns new pages + label + the list of fields that clamped/snapped.
 *  Group nodes carry no positional geometry (children are absolute), so only
 *  leaves are scaled. Printer-calibration label fields (^LT/^LS/^ML) are left
 *  alone; only layout-affecting label dots (home, default font) scale. */
export function rescaleDesign(
  pages: Page[],
  label: LabelConfig,
  fromDpmm: number,
  toDpmm: number,
): RescaleResult {
  const warnings: RescaleWarning[] = [];
  if (fromDpmm === toDpmm || fromDpmm <= 0) {
    return { pages, label: { ...label, dpmm: toDpmm }, warnings };
  }
  const factor = toDpmm / fromDpmm;

  const nextPages = pages.map((p) => ({ ...p, objects: rescaleObjects(p.objects, factor, warnings) }));

  const nextLabel: LabelConfig = { ...label, dpmm: toDpmm };
  if (typeof label.labelHomeX === "number") nextLabel.labelHomeX = Math.max(0, Math.round(label.labelHomeX * factor));
  if (typeof label.labelHomeY === "number") nextLabel.labelHomeY = Math.max(0, Math.round(label.labelHomeY * factor));
  if (typeof label.defaultFontHeight === "number") nextLabel.defaultFontHeight = Math.max(1, Math.round(label.defaultFontHeight * factor));
  if (typeof label.defaultFontWidth === "number") nextLabel.defaultFontWidth = Math.max(0, Math.round(label.defaultFontWidth * factor));

  return { pages: nextPages, label: nextLabel, warnings };
}
