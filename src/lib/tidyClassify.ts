// Pure classifier separating structural label primitives (full-label frames,
// width/height-spanning dividers) from grid content for "tidy up". On a label a
// frame box and divider lines are scaffolding, not row/column items, so a naive
// tidy must exclude them. Decoupled from Konva/store; operates on model-space
// dot bboxes (see objectBounds.ts).

import type { BoundingBoxDots } from "./objectBounds";

export type TidyClass = "frame" | "divider" | "content";

/** Only shape primitives can be structural. */
const SHAPE_TYPES = new Set(["box", "ellipse", "line"]);

const FRAME_COVERAGE = 0.8;
const DIVIDER_THIN_DOTS = 8;
const DIVIDER_LONG_FRACTION = 0.5;

/** Classify one object for tidy. Everything that isn't a shape primitive is
 *  always content; only box/ellipse/line can be a frame or divider. */
export function classifyForTidy(
  type: string,
  box: BoundingBoxDots,
  labelWidthDots: number,
  labelHeightDots: number,
): TidyClass {
  if (!SHAPE_TYPES.has(type)) return "content";

  if (
    (type === "box" || type === "ellipse") &&
    box.width >= FRAME_COVERAGE * labelWidthDots &&
    box.height >= FRAME_COVERAGE * labelHeightDots
  ) {
    return "frame";
  }

  if (type === "line") return "divider";

  // A thin, long box spanning most of one label dimension is a rule, not an item.
  const thin = Math.min(box.width, box.height) <= DIVIDER_THIN_DOTS;
  const longAxisLabel = box.width >= box.height ? labelWidthDots : labelHeightDots;
  const long = Math.max(box.width, box.height) >= DIVIDER_LONG_FRACTION * longAxisLabel;
  if (type === "box" && thin && long) return "divider";

  return "content";
}

export interface TidyItem {
  id: string;
  type: string;
  box: BoundingBoxDots;
}

/** Ids to actually tidy: the 'content' objects. If fewer than 2 qualify, fall
 *  back to ALL input ids so a 2-shape selection still tidies (the structural
 *  heuristic only helps when there's real content to arrange). */
export function selectTidyTargets(
  items: readonly TidyItem[],
  labelWDots: number,
  labelHDots: number,
): string[] {
  const content = items.filter(
    (it) => classifyForTidy(it.type, it.box, labelWDots, labelHDots) === "content",
  );
  if (content.length < 2) return items.map((it) => it.id);
  return content.map((it) => it.id);
}
