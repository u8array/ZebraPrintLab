import { useRef, useState } from "react";
import { Group, Line as KLine, Rect } from "react-konva";
import type Konva from "konva";
import type { LabelObject } from "../../types/Group";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { constrainLine, type ConstrainMode } from "../../lib/lineConstrain";
import { useColorScheme } from "../../lib/useColorScheme";
import { computePointSnap, type SnapRect } from "../../lib/snapGuides";
import { diagonalPolygonPoints } from "../../lib/shapeGeometry";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";

/** Endpoint-handle visuals — small white square with a thin selection
 *  stroke, mirroring the look of the Konva Transformer's anchors. The
 *  hit area is a separate, larger transparent square. */
const HANDLE_VISIBLE_SIZE = 7;
const HANDLE_HIT_SIZE = 14;

/**
 * Selection outline for a line — two parallel selection-coloured strokes
 * offset perpendicular to the body. Drawing alongside (not on top) keeps
 * the body's difference-blend intact for reverse (^LRY) lines and matches
 * the Illustrator-style stroke selection affordance. Returns null for
 * zero-length lines (degenerate input).
 *
 * Offset breakdown for a 1 px visual gap between body and selection edges:
 *   bodyStrokeWidth / 2 — half of the body (centre → body edge)
 *   0.5                 — half of the 1 px selection stroke
 *                         (centre → selection's body-side edge)
 *   1                   — actual gap requested between the two adjacent
 *                         edges
 */
function LineSelectionOutline({
  x1, y1, x2, y2,
  bodyStrokeWidth,
  color,
}: {
  x1: number; y1: number; x2: number; y2: number;
  bodyStrokeWidth: number;
  color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const off = bodyStrokeWidth / 2 + 1.5;
  const px = (-dy / len) * off;
  const py = (dx / len) * off;
  return (
    <>
      <KLine
        points={[x1 + px, y1 + py, x2 + px, y2 + py]}
        stroke={color}
        strokeWidth={1}
        lineCap="butt"
        listening={false}
      />
      <KLine
        points={[x1 - px, y1 - py, x2 - px, y2 - py]}
        stroke={color}
        strokeWidth={1}
        lineCap="butt"
        listening={false}
      />
    </>
  );
}

type LineLabelObject = Extract<LabelObject, { type: "line" }>;
type Props = Omit<KonvaObjectProps, "obj"> & { obj: LineLabelObject };

/** Line renderer. Hosted as its own component so hooks (useState for
 *  live endpoint drag) can run conditionally per object type without
 *  violating rules-of-hooks. The dispatcher in KonvaObject narrows
 *  `obj` before passing — no runtime cast needed here. */
export function LineObject({
  obj,
  scale,
  dpmm,
  offsetX,
  offsetY,
  isSelected,
  onSelect,
  onChange,
  snap,
  getOthersSnapshot,
  labelRect,
  setGuides,
}: Props) {
  const p = obj.props;
  const colors = useColorScheme();
  // All positions are absolute stage coordinates — the Group has no offset.
  // This eliminates any parent-child draggable conflict.
  const x1 = offsetX + dotsToPx(obj.x, scale, dpmm);
  const y1 = offsetY + dotsToPx(obj.y, scale, dpmm);
  const rad = (p.angle * Math.PI) / 180;
  const lenPx = dotsToPx(p.length, scale, dpmm);
  const x2 = x1 + lenPx * Math.cos(rad);
  const y2 = y1 + lenPx * Math.sin(rad);

  // Reverse (^LRY) uses a difference-blend body — print-correct: renders
  // black on the white label and inverts darker shapes underneath. The
  // body keeps that mode even while selected so the inversion visual
  // doesn't disappear and hide whatever is layered behind; the selection
  // highlight is rendered as a separate overlay below.
  const isReverse = !!p.reverse;
  const strokeColor = isReverse
    ? "#ffffff"
    : p.color === "B"
      ? "#000000"
      : "#cccccc";
  // Live thickness while the side handle is being dragged. Falls back to
  // the stored prop when no drag is in flight; commits to props on
  // dragEnd. Wrapping the rendering width in this state means the band,
  // selection outline and handle anchors all track the cursor in real
  // time without any one-frame delay on release.
  const [liveThicknessDots, setLiveThicknessDots] = useState<number | null>(null);
  const effectiveThicknessDots = liveThicknessDots ?? p.thickness;
  const rawStrokePx = Math.max(dotsToPx(effectiveThicknessDots, scale, dpmm), 1);

  // Option-A geometry (mirrors src/lib/shapeRender.ts):
  //   - Axis-aligned lines map to ^GB and extrude thickness downward
  //     (horizontal) or rightward (vertical) from (obj.x, obj.y) — the
  //     visible body is shifted by t/2 along that axis so the band fills
  //     y..y+t / x..x+t exactly. Handles stay at the band's start corner.
  //   - Diagonal lines map to ^GD: the conceptual line is the left long
  //     edge of a parallelogram and thickness extrudes purely in +x. The
  //     diagonalPolygonPoints helper builds the four vertices.
  //
  // The axis-aligned / diagonal pick is derived from the *live* display
  // endpoints rather than `p.angle` (which only updates on dragEnd).
  // Otherwise dragging a near-horizontal endpoint shows the body locked
  // to the horizontal band until release, then snaps to the parallelo-
  // gram — a visible jump the user noticed.

  // Live positions while handles are being dragged (snapped preview)
  const [livePt1, setLivePt1] = useState<{ x: number; y: number } | null>(null);
  const [livePt2, setLivePt2] = useState<{ x: number; y: number } | null>(null);

  // Live drag delta while the whole line is being dragged
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const dx = dragDelta.x;
  const dy = dragDelta.y;

  // Visual endpoints: handle-drag overrides whole-line delta
  const dispX1 = livePt1?.x ?? x1 + dx;
  const dispY1 = livePt1?.y ?? y1 + dy;
  const dispX2 = livePt2?.x ?? x2 + dx;
  const dispY2 = livePt2?.y ?? y2 + dy;

  // Mid-drag, an endpoint can be pulled inside the current thickness; the
  // onDragEnd commit then snaps thickness down to the new length, which
  // would look like a sudden band shrink on release. Cap the visual stroke
  // at the live endpoint distance so the band always tracks the t ≤ length
  // invariant we commit to. In steady state the data model already
  // satisfies this, so the cap is a no-op.
  const visualLenPx = Math.hypot(dispX2 - dispX1, dispY2 - dispY1);
  const lineStrokeWidth = Math.min(rawStrokePx, visualLenPx);
  const halfStrokePx = lineStrokeWidth / 2;

  // Half-pixel epsilon: constrainLine's auto-snap commits 45°-step
  // positions where ddx/ddy land exactly on axis-aligned values, but
  // float math can leave a tiny residue. <0.5 px collapses to "the
  // pixel grid sees this as axis-aligned" without false-positives.
  const ddxDisp = dispX2 - dispX1;
  const ddyDisp = dispY2 - dispY1;
  const isHorizontal = Math.abs(ddyDisp) < 0.5;
  const isVertical = Math.abs(ddxDisp) < 0.5;
  const isAxisAligned = isHorizontal || isVertical;
  const visualShiftX = isVertical ? halfStrokePx : 0;
  const visualShiftY = isHorizontal ? halfStrokePx : 0;

  // Shift forces the user-explicit 45°-step constraint; otherwise we use
  // Figma-style auto-snap (±5° tolerance to the nearest 45° step).
  const resolveMode = (shift: boolean): ConstrainMode =>
    shift ? "shift" : "autoSnap";

  // Cache the other-objects snapshot for the duration of a single endpoint
  // drag — captured lazily on the first onDragMove and cleared on
  // onDragEnd. Avoids re-querying every Konva node's clientRect per frame.
  const othersSnapshotRef = useRef<SnapRect[] | null>(null);

  /**
   * Run the projected endpoint position through object-snap (other shapes'
   * edges + label edges). Skips when shift is held — the user-explicit
   * 45°-step constraint would otherwise fight the snap-nudge.
   *
   * The snap pipeline (othersSnapshot, labelRect, returned guides) is in
   * stage-screen coords. The line's own drag math is in label-group local
   * coords (which coincide with stage at viewRotation=0 but diverge under
   * rotation). The `parent` Konva node is used to convert local↔stage so
   * the snap stays correct in rotated views.
   */
  function snapEndpoint(
    localPx: { x: number; y: number },
    shift: boolean,
    parent: Konva.Node | null,
  ): { x: number; y: number } {
    if (shift || !getOthersSnapshot || !labelRect || !setGuides || !parent) {
      setGuides?.([]);
      return localPx;
    }
    if (othersSnapshotRef.current === null) {
      othersSnapshotRef.current = getOthersSnapshot(obj.id);
    }
    const transform = parent.getAbsoluteTransform();
    const stagePx = transform.point(localPx);
    const result = computePointSnap(
      stagePx,
      othersSnapshotRef.current,
      undefined,
      labelRect,
    );
    setGuides(result.guides);
    const back = transform.copy().invert().point({ x: result.x, y: result.y });
    return { x: back.x, y: back.y };
  }

  function clearSnap() {
    othersSnapshotRef.current = null;
    setGuides?.([]);
  }

  /**
   * Full endpoint-drag pipeline: axis constraint → object snap → final
   * geometry derivation. Returns the same shape as `project` so call
   * sites stay symmetric; the snapped endpoint may sit slightly off the
   * axis the constraint chose, which is the standard Figma compromise
   * (snap nudges trump the auto-snap step, but shift still locks).
   */
  function endpointDrag(
    cursorXPx: number,
    cursorYPx: number,
    anchorXDots: number,
    anchorYDots: number,
    forStart: boolean,
    shift: boolean,
    parent: Konva.Node | null,
  ) {
    const projected = project(cursorXPx, cursorYPx, anchorXDots, anchorYDots, forStart, shift);
    const snappedPx = snapEndpoint(projected.movingPx, shift, parent);
    const snappedDotX = pxToDots(snappedPx.x - offsetX, scale, dpmm);
    const snappedDotY = pxToDots(snappedPx.y - offsetY, scale, dpmm);
    const dxDots = forStart ? anchorXDots - snappedDotX : snappedDotX - anchorXDots;
    const dyDots = forStart ? anchorYDots - snappedDotY : snappedDotY - anchorYDots;
    const g = constrainLine(dxDots, dyDots, "free");
    return {
      length: g.length,
      angle: g.angle,
      movingDotX: snappedDotX,
      movingDotY: snappedDotY,
      movingPx: snappedPx,
    };
  }

  // Project the cursor (`cursorPx`) toward the line endpoint that should
  // stay fixed (`anchorDots`), returning both the constrained line geometry
  // and the new "moving" endpoint in display pixels. `forStart=true` means
  // the user is dragging the START handle, so the geometry is computed from
  // new-start → fixed-end and the new start is `end - projected_delta`.
  // `forStart=false` is the END-handle case: start stays fixed, the new
  // end follows the projection from start.
  function project(
    cursorXPx: number,
    cursorYPx: number,
    anchorXDots: number,
    anchorYDots: number,
    forStart: boolean,
    shift: boolean,
  ) {
    const cursorXDots = snap(pxToDots(cursorXPx - offsetX, scale, dpmm));
    const cursorYDots = snap(pxToDots(cursorYPx - offsetY, scale, dpmm));
    // dx/dy is always the line direction (start → end), so for a
    // start-handle drag we flip the input vector.
    const inputDx = forStart
      ? anchorXDots - cursorXDots
      : cursorXDots - anchorXDots;
    const inputDy = forStart
      ? anchorYDots - cursorYDots
      : cursorYDots - anchorYDots;
    const g = constrainLine(inputDx, inputDy, resolveMode(shift));
    const movingDotX = forStart ? anchorXDots - g.dx : anchorXDots + g.dx;
    const movingDotY = forStart ? anchorYDots - g.dy : anchorYDots + g.dy;
    return {
      length: g.length,
      angle: g.angle,
      movingDotX,
      movingDotY,
      movingPx: {
        x: offsetX + dotsToPx(movingDotX, scale, dpmm),
        y: offsetY + dotsToPx(movingDotY, scale, dpmm),
      },
    };
  }

  // Diagonal-only: the parallelogram vertex list is reused by the body
  // (filled) and the selection outline (stroke), so compute it once.
  // Returns garbage for axis-aligned input — but the diagonal branch is
  // gated on !isAxisAligned, so it's only consumed when valid.
  const diagPoints = diagonalPolygonPoints(
    dispX1, dispY1, dispX2, dispY2, lineStrokeWidth,
  );

  // Thickness handle anchor — sits on the far long edge of the band:
  // bottom edge for horizontal lines, right edge otherwise. The handle's
  // perpendicular drag direction is then y for horizontal and x for
  // anything else, matching ZPL's ^GB / ^GD extrusion conventions.
  const lineCenterX = (dispX1 + dispX2) / 2;
  const lineCenterY = (dispY1 + dispY2) / 2;
  const thickHandleX =
    lineCenterX + (isHorizontal ? 0 : lineStrokeWidth);
  const thickHandleY =
    lineCenterY + (isHorizontal ? lineStrokeWidth : 0);

  return (
    <Group>
      {/* Visible line — tracks both whole-drag and handle-drag live.
          Difference blend keeps the reverse case print-correct: on the
          white label it renders black, over darker shapes it inverts
          those pixels. Stays in reverse mode even when selected so the
          inversion visualisation isn't masked. */}
      {isAxisAligned ? (
        <>
          <KLine
            points={[
              dispX1 + visualShiftX,
              dispY1 + visualShiftY,
              dispX2 + visualShiftX,
              dispY2 + visualShiftY,
            ]}
            stroke={strokeColor}
            strokeWidth={lineStrokeWidth}
            lineCap="butt"
            listening={false}
            globalCompositeOperation={isReverse ? "difference" : "source-over"}
          />
          {isSelected && (
            <LineSelectionOutline
              x1={dispX1 + visualShiftX}
              y1={dispY1 + visualShiftY}
              x2={dispX2 + visualShiftX}
              y2={dispY2 + visualShiftY}
              bodyStrokeWidth={lineStrokeWidth}
              color={colors.selection}
            />
          )}
        </>
      ) : (
        <>
          {/* Diagonal ^GD body — closed filled parallelogram rather than
              a centred stroke so the canvas matches Labelary's flat-top /
              pointy-side geometry. Reverse uses the same difference blend
              as the stroked case. */}
          <KLine
            points={diagPoints}
            closed
            fill={strokeColor}
            listening={false}
            globalCompositeOperation={isReverse ? "difference" : "source-over"}
          />
          {isSelected && (
            <KLine
              points={diagPoints}
              closed
              stroke={colors.selection}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              fill="transparent"
              listening={false}
            />
          )}
        </>
      )}
      {/* Wide transparent hit area — handles click-to-select and whole-line drag.
          id is here (not on the Group) so the Stage snap handler can find this node
          via e.target.id() and apply object-snap correctly. The hit area is
          shifted along with the visible body so clicks register where the
          user sees the line. */}
      <KLine
        id={obj.id}
        points={[
          x1 + visualShiftX,
          y1 + visualShiftY,
          x2 + visualShiftX,
          y2 + visualShiftY,
        ]}
        stroke="transparent"
        strokeWidth={Math.max(lineStrokeWidth, 14)}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={(e) => {
          // Snap the absolute start-point position to the grid (not
          // the delta), then derive the delta to apply. Snapping the
          // delta would let an off-grid line stay off-grid forever;
          // shapes, text and the endpoint handles in this same
          // component all snap absolute, so the line should too.
          const newX = snap(obj.x + pxToDots(e.target.x(), scale, dpmm));
          const newY = snap(obj.y + pxToDots(e.target.y(), scale, dpmm));
          const deltaXPx = dotsToPx(newX - obj.x, scale, dpmm);
          const deltaYPx = dotsToPx(newY - obj.y, scale, dpmm);
          e.target.position({ x: deltaXPx, y: deltaYPx });
          setDragDelta({ x: deltaXPx, y: deltaYPx });
        }}
        onDragEnd={(e) => {
          const deltaXPx = e.target.x();
          const deltaYPx = e.target.y();
          e.target.position({ x: 0, y: 0 });
          setDragDelta({ x: 0, y: 0 });
          onChange({
            x: obj.x + pxToDots(deltaXPx, scale, dpmm),
            y: obj.y + pxToDots(deltaYPx, scale, dpmm),
          });
        }}
      />
      {isSelected && (
        <>
          {/* Start point — dragging moves the origin; end point stays fixed.
              Visuals match the Konva Transformer anchors used for other
              shapes: small white square with a thin selection-coloured
              border. The hit area is the larger transparent Rect's box. */}
          <Rect
            x={(livePt1?.x ?? x1 + dx) - HANDLE_HIT_SIZE / 2}
            y={(livePt1?.y ?? y1 + dy) - HANDLE_HIT_SIZE / 2}
            width={HANDLE_HIT_SIZE}
            height={HANDLE_HIT_SIZE}
            fill="transparent"
            draggable={!obj.locked}
            onDragMove={(e) => {
              const endDotX = pxToDots(x2 - offsetX, scale, dpmm);
              const endDotY = pxToDots(y2 - offsetY, scale, dpmm);
              const r = endpointDrag(
                e.target.x() + HANDLE_HIT_SIZE / 2,
                e.target.y() + HANDLE_HIT_SIZE / 2,
                endDotX,
                endDotY,
                true,
                e.evt.shiftKey,
                e.target.getParent(),
              );
              e.target.position({
                x: r.movingPx.x - HANDLE_HIT_SIZE / 2,
                y: r.movingPx.y - HANDLE_HIT_SIZE / 2,
              });
              setLivePt1(r.movingPx);
            }}
            onDragEnd={(e) => {
              const cursor = livePt1 ?? {
                x: e.target.x() + HANDLE_HIT_SIZE / 2,
                y: e.target.y() + HANDLE_HIT_SIZE / 2,
              };
              e.target.position({
                x: x1 + dx - HANDLE_HIT_SIZE / 2,
                y: y1 + dy - HANDLE_HIT_SIZE / 2,
              });
              setLivePt1(null);
              const endDotX = pxToDots(x2 - offsetX, scale, dpmm);
              const endDotY = pxToDots(y2 - offsetY, scale, dpmm);
              const r = endpointDrag(
                cursor.x,
                cursor.y,
                endDotX,
                endDotY,
                true,
                e.evt.shiftKey,
                e.target.getParent(),
              );
              clearSnap();
              // Shrinking the line below the current thickness would
              // push the ZPL into the `^GB` promotion regime (t > length
              // → printed `t × t`); cap thickness to the new length so
              // the model preserves the t ≤ length invariant.
              onChange({
                x: r.movingDotX,
                y: r.movingDotY,
                props: {
                  length: r.length,
                  angle: r.angle,
                  thickness: Math.min(p.thickness, r.length),
                },
              });
            }}
          />
          <Rect
            x={(livePt1?.x ?? x1 + dx) - HANDLE_VISIBLE_SIZE / 2}
            y={(livePt1?.y ?? y1 + dy) - HANDLE_VISIBLE_SIZE / 2}
            width={HANDLE_VISIBLE_SIZE}
            height={HANDLE_VISIBLE_SIZE}
            fill="white"
            stroke={colors.selection}
            strokeWidth={1}
            listening={false}
          />
          {/* End point — dragging changes length & angle */}
          <Rect
            x={(livePt2?.x ?? x2 + dx) - HANDLE_HIT_SIZE / 2}
            y={(livePt2?.y ?? y2 + dy) - HANDLE_HIT_SIZE / 2}
            width={HANDLE_HIT_SIZE}
            height={HANDLE_HIT_SIZE}
            fill="transparent"
            draggable={!obj.locked}
            onDragMove={(e) => {
              const r = endpointDrag(
                e.target.x() + HANDLE_HIT_SIZE / 2,
                e.target.y() + HANDLE_HIT_SIZE / 2,
                obj.x,
                obj.y,
                false,
                e.evt.shiftKey,
                e.target.getParent(),
              );
              e.target.position({
                x: r.movingPx.x - HANDLE_HIT_SIZE / 2,
                y: r.movingPx.y - HANDLE_HIT_SIZE / 2,
              });
              setLivePt2(r.movingPx);
            }}
            onDragEnd={(e) => {
              const cursor = livePt2 ?? {
                x: e.target.x() + HANDLE_HIT_SIZE / 2,
                y: e.target.y() + HANDLE_HIT_SIZE / 2,
              };
              e.target.position({
                x: x2 + dx - HANDLE_HIT_SIZE / 2,
                y: y2 + dy - HANDLE_HIT_SIZE / 2,
              });
              setLivePt2(null);
              const r = endpointDrag(
                cursor.x,
                cursor.y,
                obj.x,
                obj.y,
                false,
                e.evt.shiftKey,
                e.target.getParent(),
              );
              clearSnap();
              onChange({
                props: {
                  length: r.length,
                  angle: r.angle,
                  thickness: Math.min(p.thickness, r.length),
                },
              });
            }}
          />
          <Rect
            x={(livePt2?.x ?? x2 + dx) - HANDLE_VISIBLE_SIZE / 2}
            y={(livePt2?.y ?? y2 + dy) - HANDLE_VISIBLE_SIZE / 2}
            width={HANDLE_VISIBLE_SIZE}
            height={HANDLE_VISIBLE_SIZE}
            fill="white"
            stroke={colors.selection}
            strokeWidth={1}
            listening={false}
          />
          {/* Thickness handle — drags perpendicular to the extrusion
              axis (y for horizontal, x for everything else). Clamps to
              the 1-dot minimum; flip-on-overshoot is deferred. */}
          <Rect
            x={thickHandleX - HANDLE_HIT_SIZE / 2}
            y={thickHandleY - HANDLE_HIT_SIZE / 2}
            width={HANDLE_HIT_SIZE}
            height={HANDLE_HIT_SIZE}
            fill="transparent"
            draggable={!obj.locked}
            onDragMove={(e) => {
              const cursorX = e.target.x() + HANDLE_HIT_SIZE / 2;
              const cursorY = e.target.y() + HANDLE_HIT_SIZE / 2;
              const extPx = isHorizontal
                ? cursorY - lineCenterY
                : cursorX - lineCenterX;
              // Cap at p.length so the line never enters the ZPL ^GB
              // promotion regime where thickness exceeds length and
              // Labelary would print `t × t` rather than the band the
              // user is dragging.
              const newT = Math.min(
                p.length,
                Math.max(1, Math.round(pxToDots(extPx, scale, dpmm))),
              );
              setLiveThicknessDots(newT);
              // Pin the Rect to the (possibly-clamped) anchor so
              // dragging past the minimum doesn't decouple the handle
              // from the band edge.
              const newStroke = Math.max(dotsToPx(newT, scale, dpmm), 1);
              e.target.position({
                x:
                  lineCenterX +
                  (isHorizontal ? 0 : newStroke) -
                  HANDLE_HIT_SIZE / 2,
                y:
                  lineCenterY +
                  (isHorizontal ? newStroke : 0) -
                  HANDLE_HIT_SIZE / 2,
              });
            }}
            onDragEnd={() => {
              const committed = liveThicknessDots;
              setLiveThicknessDots(null);
              if (committed !== null && committed !== p.thickness) {
                onChange({ props: { thickness: committed } });
              }
            }}
          />
          <Rect
            x={thickHandleX - HANDLE_VISIBLE_SIZE / 2}
            y={thickHandleY - HANDLE_VISIBLE_SIZE / 2}
            width={HANDLE_VISIBLE_SIZE}
            height={HANDLE_VISIBLE_SIZE}
            fill="white"
            stroke={colors.selection}
            strokeWidth={1}
            listening={false}
          />
        </>
      )}
    </Group>
  );
}
