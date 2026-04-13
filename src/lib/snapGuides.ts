export const SNAP_THRESHOLD_PX = 6;

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

  // Keep only the 2 nearest objects per direction from the dragged object's bounding box.
  // This prevents snapping to distant objects on the other side of the label.
  // 2 (not 1) because equal spacing needs a consecutive pair in the same direction.
  // leftOf/rightOf are mutually exclusive with overlapping, so no deduplication needed.
  const leftOf = others
    .filter(o => o.pos + o.size <= drag.pos)
    .sort((a, b) => (b.pos + b.size) - (a.pos + a.size))
    .slice(0, 2);
  const rightOf = others
    .filter(o => o.pos >= drag.pos + drag.size)
    .sort((a, b) => a.pos - b.pos)
    .slice(0, 2);
  const overlapping = others.filter(
    o => o.pos < drag.pos + drag.size && o.pos + o.size > drag.pos,
  );
  const nearby = [...leftOf, ...overlapping, ...rightOf];

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

  // Alignment: snap any of 3 drag anchors (start / center / end) to any of 3 other anchors
  for (const other of nearby) {
    const dragAnchors  = [drag.pos,  drag.pos  + drag.size  / 2, drag.pos  + drag.size ];
    const otherAnchors = [other.pos, other.pos + other.size / 2, other.pos + other.size];
    for (const da of dragAnchors) {
      for (const oa of otherAnchors) {
        const newPos     = drag.pos + (oa - da);
        // Guide spans between the two objects only (±8px padding)
        const perpFrom   = Math.min(drag.perp, other.perp) - 8;
        const perpTo     = Math.max(drag.perp + drag.perpSize, other.perp + other.perpSize) + 8;
        trySnap(newPos, [{ orientation: alignOrientation, type: 'align', pos: oa, from: perpFrom, to: perpTo }]);
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
    const dragAnchors  = [drag.pos, drag.pos + drag.size / 2, drag.pos + drag.size];
    const lblAnchors   = [labelAxis.pos, labelAxis.pos + labelAxis.size / 2, labelAxis.pos + labelAxis.size];
    const perpFrom     = labelExtent ? labelExtent.from : labelAxis.perp;
    const perpTo       = labelExtent ? labelExtent.to   : labelAxis.perp + labelAxis.perpSize;
    for (const da of dragAnchors) {
      for (const la of lblAnchors) {
        const newPos = drag.pos + (la - da);
        trySnap(newPos, [{ orientation: alignOrientation, type: 'align', pos: la, from: perpFrom, to: perpTo }]);
      }
    }
  }

  return { snapped, guides };
}
