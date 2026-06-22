// Pure HRI text-zone resolution shared by the barcode renderer (getDisplaySize)
// and the group-rotation bbox probe, so zone height and side never drift apart.

import { ObjectRegistry, type LeafObject } from "../registry";
import {
  EAN_TEXT_ZONE_DOTS,
  LOGMARS_TEXT_ZONE_DOTS,
  upcSuppTextZoneDots,
  EAN_UPC_TYPES,
} from "./bwipConstants";

const TEXT_ZONE_DOTS_BY_TYPE: Partial<Record<string, number>> = {
  ean13: EAN_TEXT_ZONE_DOTS,
  ean8: EAN_TEXT_ZONE_DOTS,
  upca: EAN_TEXT_ZONE_DOTS,
  upce: EAN_TEXT_ZONE_DOTS,
  logmars: LOGMARS_TEXT_ZONE_DOTS,
};

/** Firmware-reserved HRI text-zone height in dots. ^BS reserves it only when
 *  printInterpretation is on; other EAN/UPC reserve the fixed guard zone always. */
export function barcodeTextZoneDots(obj: LeafObject): number {
  if (obj.type === "upcEanExtension") {
    const p = obj.props as { printInterpretation?: boolean; moduleWidth?: number };
    return p.printInterpretation ? upcSuppTextZoneDots(p.moduleWidth ?? 2) : 0;
  }
  return TEXT_ZONE_DOTS_BY_TYPE[obj.type] ?? 0;
}

/** HRI sits above the bars when the per-object toggle is set or the symbology
 *  hardcodes it (logmars/^BS). Single source so render and bbox agree (PR #90). */
export function resolveHriAbove(obj: LeafObject): boolean {
  return !!(
    (obj.props as { printInterpretationAbove?: boolean }).printInterpretationAbove ||
    ObjectRegistry[obj.type]?.hri?.textAbove
  );
}

/** Side the zone trims from the bars. EAN/UPC keep their guard tails below the
 *  bars regardless of HRI position, so the zone never flips above for them. */
export function barcodeZoneAbove(obj: LeafObject): boolean {
  return resolveHriAbove(obj) && !EAN_UPC_TYPES.has(obj.type);
}
