export const SNAP_THRESHOLD_PX = 6;
/** Extra px the alignment guide extends beyond the dragged + matched objects. */
const GUIDE_PADDING_PX = 8;

/**
 * Edge-only point snap used for line endpoint resize. Unlike computeSnap,
 * which treats the drag as a sized rect and considers other shapes'
 * centres as snap targets (sensible for whole-object alignment, weird
 * for endpoint alignment — picking the middle of a neighbour line as a
 * snap target produces the "snaps to 50%" artefact users reported).
 * Considers only edges of others + the label rect.
 */
export function computePointSnap(
  point: { x: number; y: number },
  others: SnapRect[],
  threshold = SNAP_THRESHOLD_PX,
  labelRect?: SnapRect,
): { x: number; y: number; guides: SnapGuide[] } {
  const snapAxisPt = (
    drag: number,
    dragPerp: number,
    axis: 'x' | 'y',
  ): { value: number; guides: SnapGuide[] } => {
    let bestDelta = Infinity;
    let bestValue = drag;
    let bestGuides: SnapGuide[] = [];
    const consider = (target: number, perpFrom: number, perpTo: number) => {
      const d = Math.abs(target - drag);
      if (d > threshold || d > bestDelta) return;
      const guideOrientation: 'H' | 'V' = axis === 'x' ? 'V' : 'H';
      const guide: SnapGuide = {
        orientation: guideOrientation,
        type: 'align',
        pos: target,
        from: Math.min(dragPerp, perpFrom) - GUIDE_PADDING_PX,
        to: Math.max(dragPerp, perpTo) + GUIDE_PADDING_PX,
      };
      if (d < bestDelta) {
        // Strictly closer — replace the best candidate.
        bestDelta = d;
        bestValue = target;
        bestGuides = [guide];
      } else if (target === bestValue) {
        // Same edge value at the same distance — accumulate so each
        // contributing object draws its own guide line.
        bestGuides.push(guide);
      }
    };
    for (const o of others) {
      const startEdge = axis === 'x' ? o.x : o.y;
      const endEdge = startEdge + (axis === 'x' ? o.width : o.height);
      const perpStart = axis === 'x' ? o.y : o.x;
      const perpEnd = perpStart + (axis === 'x' ? o.height : o.width);
      consider(startEdge, perpStart, perpEnd);
      consider(endEdge, perpStart, perpEnd);
    }
    if (labelRect) {
      // Label edges *and* center are valid endpoint snap targets. Centre
      // is intentionally only allowed for the label (not for other
      // objects) — endpoint alignment to a neighbour's midpoint produced
      // the "50 %" artefact this helper was created to avoid.
      const startEdge = axis === 'x' ? labelRect.x : labelRect.y;
      const size = axis === 'x' ? labelRect.width : labelRect.height;
      const endEdge = startEdge + size;
      const center = startEdge + size / 2;
      const perpStart = axis === 'x' ? labelRect.y : labelRect.x;
      const perpEnd = perpStart + (axis === 'x' ? labelRect.height : labelRect.width);
      consider(startEdge, perpStart, perpEnd);
      consider(center, perpStart, perpEnd);
      consider(endEdge, perpStart, perpEnd);
    }
    return { value: bestValue, guides: bestGuides };
  };

  const xRes = snapAxisPt(point.x, point.y, 'x');
  const yRes = snapAxisPt(point.y, point.x, 'y');
  return { x: xRes.value, y: yRes.value, guides: [...xRes.guides, ...yRes.guides] };
}

export interface SnapRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  // 'V' = vertical line drawn at x=pos, from y=from to y=to
  // 'H' = horizontal line drawn at y=pos, from x=from to x=to
  orientation: 'H' | 'V';
  /** 'align' = edge/center alignment guide; 'space' = equal-spacing indicator */
  type: 'align' | 'space';
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  /** Snapped bounding-box top-left in stage pixels */
  x: number;
  y: number;
  guides: SnapGuide[];
}

interface AxisInfo {
  pos: number;
  size: number;
  perp: number;
  perpSize: number;
}

interface AnchorCandidate {
  /** Anchor position to align against (start, center, or end of the candidate). */
  value: number;
  /** Guide line emitted when this anchor wins. */
  guide: SnapGuide;
}

/**
 * The 3 anchors of `other` (start/center/end) as alignment candidates.
 * Guide spans the perpendicular extent covering both `drag*` and `other`.
 */
function objectAnchorCandidates(
  other: AxisInfo,
  dragPerp: number,
  dragPerpSize: number,
  alignOrientation: 'H' | 'V',
): AnchorCandidate[] {
  const oStart = other.pos;
  const oCenter = other.pos + other.size / 2;
  const oEnd = other.pos + other.size;
  const perpFrom = Math.min(dragPerp, other.perp) - GUIDE_PADDING_PX;
  const perpTo = Math.max(dragPerp + dragPerpSize, other.perp + other.perpSize) + GUIDE_PADDING_PX;
  return [oStart, oCenter, oEnd].map(value => ({
    value,
    guide: { orientation: alignOrientation, type: 'align', pos: value, from: perpFrom, to: perpTo },
  }));
}

/** The 3 anchors of the label rect (start/center/end) as alignment candidates. */
function labelAnchorCandidates(
  labelAxis: AxisInfo,
  alignOrientation: 'H' | 'V',
  labelExtent: { from: number; to: number } | undefined,
): AnchorCandidate[] {
  const lStart = labelAxis.pos;
  const lCenter = labelAxis.pos + labelAxis.size / 2;
  const lEnd = labelAxis.pos + labelAxis.size;
  const perpFrom = labelExtent ? labelExtent.from : labelAxis.perp;
  const perpTo = labelExtent ? labelExtent.to : labelAxis.perp + labelAxis.perpSize;
  return [lStart, lCenter, lEnd].map(value => ({
    value,
    guide: { orientation: alignOrientation, type: 'align', pos: value, from: perpFrom, to: perpTo },
  }));
}

/**
 * Keep only the 2 nearest objects per direction from the drag axis. Prevents
 * snapping to distant objects on the other side of the label, and bounds the
 * candidate count for performance. Equal-spacing math (drag-only) needs 2 (not
 * 1) per side because it operates on consecutive pairs.
 */
function filterNearby(dragPos: number, dragSize: number, others: AxisInfo[]): AxisInfo[] {
  const dragEnd = dragPos + dragSize;
  const leftOf = others
    .filter(o => o.pos + o.size <= dragPos)
    .sort((a, b) => (b.pos + b.size) - (a.pos + a.size))
    .slice(0, 2);
  const rightOf = others
    .filter(o => o.pos >= dragEnd)
    .sort((a, b) => a.pos - b.pos)
    .slice(0, 2);
  const overlapping = others.filter(
    o => o.pos < dragEnd && o.pos + o.size > dragPos,
  );
  return [...leftOf, ...overlapping, ...rightOf];
}

/**
 * Computes object-snap for a dragged rect against stationary rects.
 * All values are stage pixels. Returns the snapped position and guide lines.
 */
export function computeSnap(
  dragged: SnapRect,
  others: SnapRect[],
  threshold = SNAP_THRESHOLD_PX,
  /** Label bounds in stage pixels — guide lines extend to these boundaries */
  labelBounds?: { x: number; y: number; width: number; height: number },
  /** Full-size label rect for edge/center snapping — kept separate so it doesn't
   *  interfere with the nearest-2-per-direction object filtering. */
  labelRect?: SnapRect,
): SnapResult {
  const xDrag: AxisInfo = { pos: dragged.x, size: dragged.width,  perp: dragged.y, perpSize: dragged.height };
  const yDrag: AxisInfo = { pos: dragged.y, size: dragged.height, perp: dragged.x, perpSize: dragged.width  };
  const xOthers = others.map<AxisInfo>(o => ({ pos: o.x, size: o.width,  perp: o.y, perpSize: o.height }));
  const yOthers = others.map<AxisInfo>(o => ({ pos: o.y, size: o.height, perp: o.x, perpSize: o.width  }));

  const xLabelExtent = labelBounds ? { from: labelBounds.y, to: labelBounds.y + labelBounds.height } : undefined;
  const yLabelExtent = labelBounds ? { from: labelBounds.x, to: labelBounds.x + labelBounds.width } : undefined;

  // Label rect anchors — tested separately, outside the nearest-2 filter
  const xLblAxis = labelRect ? { pos: labelRect.x, size: labelRect.width, perp: labelRect.y, perpSize: labelRect.height } : undefined;
  const yLblAxis = labelRect ? { pos: labelRect.y, size: labelRect.height, perp: labelRect.x, perpSize: labelRect.width } : undefined;

  const { snapped: x, guides: xGuides } = snapAxis(xDrag, xOthers, threshold, 'V', xLabelExtent, xLblAxis);
  const { snapped: y, guides: yGuides } = snapAxis(yDrag, yOthers, threshold, 'H', yLabelExtent, yLblAxis);

  return { x, y, guides: [...xGuides, ...yGuides] };
}

function snapAxis(
  drag: AxisInfo,
  others: AxisInfo[],
  threshold: number,
  // Guide orientation for alignment snaps — perpendicular to the movement axis.
  // Equal-spacing guides use the opposite orientation.
  alignOrientation: 'H' | 'V',
  /** If provided, guide lines extend to these label boundaries instead of object edges ±8px */
  labelExtent?: { from: number; to: number },
  /** Label rect axis info — tested for alignment only (edges + center), outside nearest-2 filter */
  labelAxis?: AxisInfo,
): { snapped: number; guides: SnapGuide[] } {
  const spaceOrientation: 'H' | 'V' = alignOrientation === 'V' ? 'H' : 'V';
  let bestDelta = Infinity;
  let snapped = drag.pos;
  let guides: SnapGuide[] = [];

  const nearby = filterNearby(drag.pos, drag.size, others);

  function trySnap(newPos: number, newGuides: SnapGuide[]) {
    const d = Math.abs(newPos - drag.pos);
    if (d < threshold && d < bestDelta) {
      bestDelta = d;
      snapped = newPos;
      guides = newGuides;
    } else if (d < threshold && d === bestDelta && newPos === snapped) {
      // Same snap position — accumulate guides (e.g. object align + label center)
      guides.push(...newGuides);
    }
  }

  // Alignment: any of 3 drag anchors (start / center / end) → any of 3 other anchors.
  const dragAnchors = [drag.pos, drag.pos + drag.size / 2, drag.pos + drag.size];
  for (const other of nearby) {
    for (const cand of objectAnchorCandidates(other, drag.perp, drag.perpSize, alignOrientation)) {
      for (const da of dragAnchors) {
        trySnap(drag.pos + (cand.value - da), [cand.guide]);
      }
    }
  }

  // Equal spacing: check consecutive pairs (sorted by position)
  const sorted = [...nearby].sort((a, b) => a.pos - b.pos);

  for (let i = 0; i + 1 < sorted.length; i++) {
    const a    = sorted[i];
    const b    = sorted[i + 1];
    if (!a || !b) continue;
    const aEnd = a.pos + a.size;
    const bEnd = b.pos + b.size;
    const gap  = b.pos - aEnd;
    if (gap <= 0) continue;

    const perpMin = Math.min(drag.perp, a.perp, b.perp);
    const perpMax = Math.max(drag.perp + drag.perpSize, a.perp + a.perpSize, b.perp + b.perpSize);
    const perpMid = (perpMin + perpMax) / 2;

    // Place dragged right after b
    trySnap(bEnd + gap, [
      { orientation: spaceOrientation, type: 'space', pos: perpMid, from: aEnd,       to: b.pos },
      { orientation: spaceOrientation, type: 'space', pos: perpMid, from: bEnd,       to: bEnd + gap },
    ]);

    // Place dragged right before a
    const beforeA = a.pos - gap - drag.size;
    trySnap(beforeA, [
      { orientation: spaceOrientation, type: 'space', pos: perpMid, from: beforeA + drag.size, to: a.pos },
      { orientation: spaceOrientation, type: 'space', pos: perpMid, from: aEnd,                to: b.pos },
    ]);

    // Place dragged between a and b with equal gaps on both sides
    const innerSpace = b.pos - aEnd;
    if (innerSpace > drag.size) {
      const equalGap = (innerSpace - drag.size) / 2;
      const idealPos = aEnd + equalGap;
      trySnap(idealPos, [
        { orientation: spaceOrientation, type: 'space', pos: perpMid, from: aEnd,                 to: idealPos },
        { orientation: spaceOrientation, type: 'space', pos: perpMid, from: idealPos + drag.size, to: b.pos },
      ]);
    }
  }

  // Label alignment: snap to label edges and center (separate from object nearest-2 filter)
  if (labelAxis) {
    for (const cand of labelAnchorCandidates(labelAxis, alignOrientation, labelExtent)) {
      for (const da of dragAnchors) {
        trySnap(drag.pos + (cand.value - da), [cand.guide]);
      }
    }
  }

  return { snapped, guides };
}

// ─── Resize-time snap ────────────────────────────────────────────────────────

export interface ActiveEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export interface ResizeSnapResult {
  /** Snapped bounding-box top-left + size in stage pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  guides: SnapGuide[];
}

/**
 * Derive which edges of `newBox` are moving relative to `oldBox`. Used to
 * decide which edges should participate in resize-time snapping (the static
 * edges have nothing to align).
 *
 * The default tolerance is 2 screen pixels so Konva's per-frame FP scale-
 * driven node-position drift (sub-pixel on a pure single-edge drag, more
 * at low zoom) doesn't flip a static edge to "active" — that previously
 * let the object-snap pull a bottom-edge resize sideways/up.
 */
export function deriveActiveEdges(
  oldBox: SnapRect,
  newBox: SnapRect,
  tolerance = 2,
): ActiveEdges {
  return {
    left: Math.abs(newBox.x - oldBox.x) > tolerance,
    right: Math.abs((newBox.x + newBox.width) - (oldBox.x + oldBox.width)) > tolerance,
    top: Math.abs(newBox.y - oldBox.y) > tolerance,
    bottom: Math.abs((newBox.y + newBox.height) - (oldBox.y + oldBox.height)) > tolerance,
  };
}

interface EdgeMatch {
  /** Distance from the drag edge in px; Infinity = no match. */
  delta: number;
  /** Pixel position to snap the active edge to. */
  pos: number;
  /** Guides emitted when this match is selected. */
  guides: SnapGuide[];
}

/**
 * Sentinel "no match yet" value. Returns a fresh object so callers can never
 * accidentally bleed mutations (e.g. pushing into `guides`) into a shared
 * reference.
 */
function noMatch(): EdgeMatch {
  return { delta: Infinity, pos: 0, guides: [] };
}

function considerEdge(current: EdgeMatch, candidatePos: number, dragPos: number, guide: SnapGuide, threshold: number): EdgeMatch {
  const d = Math.abs(candidatePos - dragPos);
  if (d >= threshold) return current;
  if (d < current.delta) return { delta: d, pos: candidatePos, guides: [guide] };
  if (d === current.delta && candidatePos === current.pos) {
    return { ...current, guides: [...current.guides, guide] };
  }
  return current;
}

interface ResizeAxisInput {
  /** Active leading edge (left for X, top for Y). */
  posActive: boolean;
  /** Active trailing edge (right for X, bottom for Y). */
  endActive: boolean;
  /** Current dragged value for the leading edge. */
  pos: number;
  /** Current dragged size. */
  size: number;
  /** Perpendicular extent of the dragged box, used for guide line spans. */
  perp: number;
  perpSize: number;
}

interface AxisSnapResult {
  pos: number;
  size: number;
  guides: SnapGuide[];
}

function snapResizeAxis(
  drag: ResizeAxisInput,
  others: AxisInfo[],
  threshold: number,
  alignOrientation: 'H' | 'V',
  labelAxis?: AxisInfo,
  labelExtent?: { from: number; to: number },
): AxisSnapResult {
  const dragEnd = drag.pos + drag.size;
  const nearby = filterNearby(drag.pos, drag.size, others);

  // Resize alignment ignores the dragged center by design — only edges align.
  const candidates: AnchorCandidate[] = [];
  for (const o of nearby) {
    candidates.push(...objectAnchorCandidates(o, drag.perp, drag.perpSize, alignOrientation));
  }
  if (labelAxis) {
    candidates.push(...labelAnchorCandidates(labelAxis, alignOrientation, labelExtent));
  }

  let leadMatch = noMatch();
  let endMatch = noMatch();
  for (const c of candidates) {
    if (drag.posActive) leadMatch = considerEdge(leadMatch, c.value, drag.pos, c.guide, threshold);
    if (drag.endActive) endMatch = considerEdge(endMatch, c.value, dragEnd, c.guide, threshold);
  }

  // Edge matches adjust pos OR size depending on which side is moving.
  // The applied snap takes whichever edge has the smaller delta — both edges
  // may have matches, but snapping both simultaneously would fight.
  let pos = drag.pos;
  let size = drag.size;
  const guides: SnapGuide[] = [];

  if (leadMatch.delta < Infinity && leadMatch.delta <= endMatch.delta) {
    pos = leadMatch.pos;
    size = dragEnd - pos;
    guides.push(...leadMatch.guides);
  } else if (endMatch.delta < Infinity) {
    size = endMatch.pos - drag.pos;
    guides.push(...endMatch.guides);
  }

  return { pos, size, guides };
}

/**
 * Computes resize-time snap for a transformer-driven box against stationary
 * rects. Only the edges in `activeEdges` participate. Returns the adjusted
 * box and any guide lines to render.
 *
 * Distinct from `computeSnap` (drag) because the application is different:
 * drag shifts the bbox; resize moves a single edge, changing the size.
 */
export function computeResizeSnap(
  newBox: SnapRect,
  others: SnapRect[],
  activeEdges: ActiveEdges,
  threshold = SNAP_THRESHOLD_PX,
  /** Label bounds used for guide-line spans. */
  labelBounds?: { x: number; y: number; width: number; height: number },
  /** Full-size label rect for edge / center anchor matching. */
  labelRect?: SnapRect,
): ResizeSnapResult {
  const xOthers = others.map<AxisInfo>(o => ({ pos: o.x, size: o.width,  perp: o.y, perpSize: o.height }));
  const yOthers = others.map<AxisInfo>(o => ({ pos: o.y, size: o.height, perp: o.x, perpSize: o.width  }));

  const xLabelExtent = labelBounds ? { from: labelBounds.y, to: labelBounds.y + labelBounds.height } : undefined;
  const yLabelExtent = labelBounds ? { from: labelBounds.x, to: labelBounds.x + labelBounds.width } : undefined;

  const xLblAxis = labelRect ? { pos: labelRect.x, size: labelRect.width,  perp: labelRect.y, perpSize: labelRect.height } : undefined;
  const yLblAxis = labelRect ? { pos: labelRect.y, size: labelRect.height, perp: labelRect.x, perpSize: labelRect.width  } : undefined;

  const xResult = snapResizeAxis(
    {
      posActive: activeEdges.left,
      endActive: activeEdges.right,
      pos: newBox.x, size: newBox.width,
      perp: newBox.y, perpSize: newBox.height,
    },
    xOthers, threshold, 'V', xLblAxis, xLabelExtent,
  );
  const yResult = snapResizeAxis(
    {
      posActive: activeEdges.top,
      endActive: activeEdges.bottom,
      pos: newBox.y, size: newBox.height,
      perp: newBox.x, perpSize: newBox.width,
    },
    yOthers, threshold, 'H', yLblAxis, yLabelExtent,
  );

  return {
    x: xResult.pos,
    y: yResult.pos,
    width: xResult.size,
    height: yResult.size,
    guides: [...xResult.guides, ...yResult.guides],
  };
}
