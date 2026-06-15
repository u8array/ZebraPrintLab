// Pure geometry for the configurable safe-area (margin) inset. A uniform
// margin in mm, converted to dots, that align/pin and the canvas guide use
// so elements keep a consistent distance to the label edge.

import type { BoundingBoxDots } from "./objectBounds";
import type { LabelConfig } from "../types/LabelConfig";
import { mmToDots } from "./coordinates";

/** Inset rectangle (dots) for the label's safe area, or null when no safe
 *  area applies: unset/zero margin, or an inset so large the rect collapses. */
export function safeAreaRectDots(label: LabelConfig): BoundingBoxDots | null {
  const mm = label.safeAreaMm ?? 0;
  if (mm <= 0) return null;
  const inset = mmToDots(mm, label.dpmm);
  if (inset <= 0) return null;
  const width = mmToDots(label.widthMm, label.dpmm) - 2 * inset;
  const height = mmToDots(label.heightMm, label.dpmm) - 2 * inset;
  if (width <= 0 || height <= 0) return null;
  return { x: inset, y: inset, width, height };
}
