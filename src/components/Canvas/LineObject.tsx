import { useState } from "react";
import { Circle, Group, Line as KLine } from "react-konva";
import type { LabelObject } from "../../registry";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { constrainLine, type ConstrainMode } from "../../lib/lineConstrain";
import type { KonvaObjectProps } from "./konvaObjectProps";

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
}: Props) {
  const p = obj.props;
  // All positions are absolute stage coordinates — the Group has no offset.
  // This eliminates any parent-child draggable conflict.
  const x1 = offsetX + dotsToPx(obj.x, scale, dpmm);
  const y1 = offsetY + dotsToPx(obj.y, scale, dpmm);
  const rad = (p.angle * Math.PI) / 180;
  const lenPx = dotsToPx(p.length, scale, dpmm);
  const x2 = x1 + lenPx * Math.cos(rad);
  const y2 = y1 + lenPx * Math.sin(rad);

  // ^LR uses difference blend with white: white over white bg = black, white over black text = white
  const strokeColor =
    !isSelected && p.reverse
      ? "#ffffff"
      : p.color === "B"
        ? "#000000"
        : "#cccccc";
  const lineStrokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 1);

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

  // Shift forces the user-explicit 45°-step constraint; otherwise we use
  // Figma-style auto-snap (±5° tolerance to the nearest 45° step).
  const resolveMode = (shift: boolean): ConstrainMode =>
    shift ? "shift" : "autoSnap";

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

  return (
    <Group>
      {/* Visible line — tracks both whole-drag and handle-drag live */}
      <KLine
        points={[dispX1, dispY1, dispX2, dispY2]}
        stroke={isSelected ? "#6366f1" : strokeColor}
        strokeWidth={lineStrokeWidth}
        lineCap="square"
        listening={false}
        globalCompositeOperation={
          !isSelected && p.reverse ? "difference" : "source-over"
        }
      />
      {/* Wide transparent hit area — handles click-to-select and whole-line drag.
          id is here (not on the Group) so the Stage snap handler can find this node
          via e.target.id() and apply object-snap correctly. */}
      <KLine
        id={obj.id}
        points={[x1, y1, x2, y2]}
        stroke="transparent"
        strokeWidth={Math.max(lineStrokeWidth, 14)}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
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
          {/* Start point — dragging moves the origin; end point stays fixed */}
          <Circle
            x={livePt1?.x ?? x1 + dx}
            y={livePt1?.y ?? y1 + dy}
            radius={6}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const endDotX = pxToDots(x2 - offsetX, scale, dpmm);
              const endDotY = pxToDots(y2 - offsetY, scale, dpmm);
              const r = project(
                e.target.x(),
                e.target.y(),
                endDotX,
                endDotY,
                true,
                e.evt.shiftKey,
              );
              e.target.position(r.movingPx);
              setLivePt1(r.movingPx);
            }}
            onDragEnd={(e) => {
              const cursor = livePt1 ?? { x: e.target.x(), y: e.target.y() };
              e.target.position({ x: x1 + dx, y: y1 + dy });
              setLivePt1(null);
              const endDotX = pxToDots(x2 - offsetX, scale, dpmm);
              const endDotY = pxToDots(y2 - offsetY, scale, dpmm);
              const r = project(
                cursor.x,
                cursor.y,
                endDotX,
                endDotY,
                true,
                e.evt.shiftKey,
              );
              onChange({
                x: r.movingDotX,
                y: r.movingDotY,
                props: { length: r.length, angle: r.angle },
              });
            }}
          />
          {/* End point — dragging changes length & angle */}
          <Circle
            x={livePt2?.x ?? x2 + dx}
            y={livePt2?.y ?? y2 + dy}
            radius={6}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const r = project(
                e.target.x(),
                e.target.y(),
                obj.x,
                obj.y,
                false,
                e.evt.shiftKey,
              );
              e.target.position(r.movingPx);
              setLivePt2(r.movingPx);
            }}
            onDragEnd={(e) => {
              const cursor = livePt2 ?? { x: e.target.x(), y: e.target.y() };
              e.target.position({ x: x2 + dx, y: y2 + dy });
              setLivePt2(null);
              const r = project(
                cursor.x,
                cursor.y,
                obj.x,
                obj.y,
                false,
                e.evt.shiftKey,
              );
              onChange({ props: { length: r.length, angle: r.angle } });
            }}
          />
        </>
      )}
    </Group>
  );
}
