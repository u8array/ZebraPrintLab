import { getFontFamily } from "../../lib/fontCache";
import { useFontCacheVersion } from "../../hooks/useFontCacheVersion";
import { Circle, Ellipse, Group, Rect, Text } from "react-konva";
import { BarcodeObject } from "./BarcodeObject";
import { LineObject } from "./LineObject";
import { ImageObject } from "./ImageObject";
import type Konva from "konva";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { outlineInset } from "../../lib/shapeGeometry";
import { useColorScheme } from "../../lib/useColorScheme";
import {
  objectToDisplay,
  displayToObject,
  ZPL_FONT_HEIGHT_TO_CSS_RATIO,
} from "./textPositionTransforms";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";

type Props = KonvaObjectProps;

/**
 * Selection outline drawn as a separate (non-listening) overlay so the
 * underlying shape can keep its own stroke / fill / globalCompositeOperation
 * without compromise. Sits at local (0, 0) inside the parent Group so it
 * follows drag translations together with the body.
 */
function SelectionOverlay({
  width,
  height,
  strokeWidth,
  color,
  cornerRadius,
}: {
  width: number;
  height: number;
  strokeWidth: number;
  color: string;
  cornerRadius?: number;
}) {
  return (
    <Rect
      x={0}
      y={0}
      width={width}
      height={height}
      stroke={color}
      strokeWidth={Math.max(strokeWidth, 1.5)}
      strokeScaleEnabled={false}
      fill="transparent"
      cornerRadius={cornerRadius}
      listening={false}
    />
  );
}

const BARCODE_TYPES = new Set([
  "code128",
  "code39",
  "ean13",
  "ean8",
  "upca",
  "upce",
  "interleaved2of5",
  "code93",
  "pdf417",
  "qrcode",
  "datamatrix",
  "code11",
  "industrial2of5",
  "standard2of5",
  "codabar",
  "logmars",
  "msi",
  "plessey",
  "gs1databar",
  "planet",
  "postal",
  "aztec",
  "micropdf417",
  "codablock",
]);

export function KonvaObject(props_: Props) {
  // Pass `obj` explicitly after the spread so each per-type renderer
  // receives the narrowed type (LineLabelObject, ImageLabelObject)
  // rather than the wide LabelObject. Without the explicit prop the
  // spread would re-widen and the renderer would need a runtime cast.
  const { obj } = props_;
  if (obj.type === "line") return <LineObject {...props_} obj={obj} />;
  if (obj.type === "image") return <ImageObject {...props_} obj={obj} />;
  if (BARCODE_TYPES.has(obj.type)) return <BarcodeObject {...props_} />;
  return <KonvaObjectInner {...props_} />;
}

/**
 * Per-type Konva renderer dispatcher (`KonvaObject` above narrows by
 * `obj.type` and routes to the right component / case).
 *
 * Convention for adding a new shape type:
 *
 *  1. `id={obj.id}` sits on the **outermost render node**. Single-node
 *     shapes (e.g. plain Text, Ellipse, Circle) put it on that shape;
 *     multi-node shapes (Text+reverse, Box, Image, Line) wrap their
 *     parts in a `<Group>` and put the id there. Stage-level lookups
 *     (`stage.findOne(#id)`, snap, alt+click cycle) all walk up to the
 *     id'd ancestor, so this stays consistent.
 *
 *  2. Selection visuals: a single shape can put its own selection stroke
 *     on itself (`stroke={isSelected ? colors.selection : ...}`). A
 *     shape whose body uses `globalCompositeOperation: "difference"`
 *     for ZPL `^LRY` (currently Box and Line) needs an extra
 *     `<SelectionOverlay>` Rect drawn with normal blending, so the
 *     selection stroke isn't itself blended into a wrong colour. The
 *     overlay sits inside the same Group as the body so drag
 *     translations move both together.
 */
function KonvaObjectInner({
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
  useFontCacheVersion();
  const colors = useColorScheme();
  // For text/serial, ^FT (baseline) needs converting to Konva's top-left
  // anchor and the rotation introduces a 15-dot alignment offset. The
  // helper handles both; non-text types pass through unchanged.
  const display =
    obj.type === "text" || obj.type === "serial"
      ? objectToDisplay(obj.x, obj.y, obj.props, obj.positionType)
      : { x: obj.x, y: obj.y };

  const x = offsetX + dotsToPx(display.x, scale, dpmm);
  const y = offsetY + dotsToPx(display.y, scale, dpmm);

  // Snap a stage-position to the nearest grid point, returns stage-position.
  const snapPos = (stageX: number, stageY: number) => ({
    x:
      offsetX +
      dotsToPx(snap(pxToDots(stageX - offsetX, scale, dpmm)), scale, dpmm),
    y:
      offsetY +
      dotsToPx(snap(pxToDots(stageY - offsetY, scale, dpmm)), scale, dpmm),
  });

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.position(snapPos(e.target.x(), e.target.y()));
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const draggedX = pxToDots(e.target.x() - offsetX, scale, dpmm);
    const draggedY = pxToDots(e.target.y() - offsetY, scale, dpmm);
    // Inverse of the FT/rotation correction applied at render: without
    // it, drag would save the Konva top-left position instead of the
    // ZPL coordinate and re-render would jump.
    const final =
      obj.type === "text" || obj.type === "serial"
        ? displayToObject(draggedX, draggedY, obj.props, obj.positionType)
        : { x: draggedX, y: draggedY };

    onChange({
      x: final.x,
      y: final.y,
    });
  };

  if (obj.type === "text") {
    const p = obj.props;
    const fontSize = Math.max(
      dotsToPx(p.fontHeight, scale, dpmm) / ZPL_FONT_HEIGHT_TO_CSS_RATIO,
      6,
    );
    const fontFamily = p.printerFontName
      ? (getFontFamily(p.printerFontName) ?? "'Roboto Condensed', sans-serif")
      : "'Roboto Condensed', sans-serif";
    const zplRotationDeg: Record<typeof p.rotation, number> = {
      N: 0,
      R: 90,
      I: 180,
      B: 270,
    };

    if (p.reverse) {
      const approxW = fontSize * p.content.length * 0.62;
      const approxH = fontSize * 1.3;
      return (
        <Group
          id={obj.id}
          x={x}
          y={y}
          rotation={zplRotationDeg[p.rotation]}
          draggable={!obj.locked}
          {...selectionHandlers(onSelect)}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <Rect
            width={approxW}
            height={approxH}
            fill="#000000"
            stroke={isSelected ? colors.selection : undefined}
            strokeWidth={isSelected ? 1.5 : 0}
          />
          <Text
            text={p.content}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fontStyle="bold"
            fill="#ffffff"
            y={approxH * 0.1}
          />
        </Group>
      );
    }

    return (
      <Text
        id={obj.id}
        x={x}
        y={y}
        text={p.content}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontStyle="bold"
        rotation={zplRotationDeg[p.rotation]}
        fill="#000000"
        stroke={isSelected ? colors.selection : undefined}
        strokeWidth={isSelected ? 1 : 0}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === "serial") {
    const p = obj.props;
    const fontSize = Math.max(
      dotsToPx(p.fontHeight, scale, dpmm) / ZPL_FONT_HEIGHT_TO_CSS_RATIO,
      6,
    );
    const zplRotationDeg: Record<typeof p.rotation, number> = {
      N: 0,
      R: 90,
      I: 180,
      B: 270,
    };
    return (
      <Text
        id={obj.id}
        x={x}
        y={y}
        text={`#${p.content}`}
        fontSize={fontSize}
        fontFamily="'Roboto Condensed', sans-serif"
        fontStyle="bold"
        rotation={zplRotationDeg[p.rotation]}
        fill="#000000"
        stroke={isSelected ? colors.selection : undefined}
        strokeWidth={isSelected ? 1 : 0}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === "box") {
    const p = obj.props;
    const w = dotsToPx(p.width, scale, dpmm);
    const h = dotsToPx(p.height, scale, dpmm);
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    const cornerRadius =
      p.rounding * dotsToPx(Math.min(p.width, p.height) / 8, scale, dpmm);
    // Option-A geometry (delegated to lib/shapeGeometry.ts so the Konva
    // canvas, the @napi-rs pixel-regression renderer, and any future
    // consumer share one definition of ZPL ^GB extrusion). Centred
    // stroke on the inset rect places the band exactly inside the
    // declared bbox; the firmware's clamp-to-solid rule is handled by
    // `renderFilled`.
    const insetGeom = outlineInset(w, h, strokeWidth, p.filled);
    const renderFilled = insetGeom.renderFilled;
    const insetCornerRadius = renderFilled
      ? cornerRadius
      : Math.max(0, cornerRadius - strokeWidth / 2);

    // Inverted (^LRY) regions print as a knockout. The difference-blend
    // body renders print-correctly: on the white label it produces black
    // (white-on-white inverted = black ink in print), and over darker
    // shapes it inverts those pixels — matching what Zebra firmware
    // actually prints. The body keeps that mode even while selected so
    // the inversion visualisation doesn't disappear and hide whatever
    // is layered behind. The selection outline is rendered as a separate
    // overlay rect with normal blending.
    //
    // Special-cases:
    //  - reverse + filled drops the body stroke. Konva renders fill then
    //    stroke; with the difference blend the fill flips the destination
    //    to black and the (white) stroke then flips back to white inside
    //    the rect, producing a b/w/b banding artefact. The stroke and
    //    fill carry the same colour anyway so dropping it is visually
    //    identical without the artefact.
    //  - colour W filled (non-reverse) uses the light-grey shape colour
    //    for the fill too, otherwise white-on-white would make filled
    //    and outlined indistinguishable on canvas.
    const isReverse = !!p.reverse;
    const shapeColor = p.color === "B" ? "#000000" : "#cccccc";
    // `renderFilled` includes the firmware clamp-to-solid case, so a
    // very-thick outline picks the filled fill/stroke pair instead of
    // collapsing into a degenerate inset rect.
    const stroke = isReverse
      ? renderFilled
        ? "transparent"
        : "#ffffff"
      : shapeColor;
    const fill = isReverse
      ? renderFilled
        ? "#ffffff"
        : "transparent"
      : renderFilled
        ? shapeColor
        : "transparent";
    // Wrap body + selection overlay in a draggable Group so both move
    // together during a drag — without this the selection-stroke rect
    // stays at the start position while the body translates, leaving a
    // visible ghost outline behind the moving box until drag-end.
    // id sits on the Group (not the inner Rect) so onTransformEnd reads the
    // Group's absolute position via node.x()/y(); putting id on the Rect
    // would return its local (0, 0) and the post-resize commit would land
    // off-canvas. The Transformer + altClickCycle + snap all walk up to
    // the id'd ancestor, so finding the Group via findOne(#id) is fine.
    // Group.width/height defaults to 0; commitWidthHeightTransform doesn't
    // need them (it uses obj.props.width * sx).
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <Rect
          x={insetGeom.offset}
          y={insetGeom.offset}
          width={insetGeom.width}
          height={insetGeom.height}
          stroke={stroke}
          strokeWidth={renderFilled ? 0 : strokeWidth}
          strokeScaleEnabled={false}
          fill={fill}
          cornerRadius={insetCornerRadius}
          globalCompositeOperation={isReverse ? "difference" : "source-over"}
        />
        {isSelected && (
          <SelectionOverlay
            width={w}
            height={h}
            // Constant-thin selection stroke (decoupled from the body
            // thickness) so a thick outline box doesn't get a thick
            // selection halo. Matches the LineSelectionOutline pattern.
            strokeWidth={1.5}
            color={colors.selection}
            cornerRadius={cornerRadius}
          />
        )}
      </Group>
    );
  }

  if (obj.type === "ellipse") {
    const p = obj.props;
    const rx = dotsToPx(p.width, scale, dpmm) / 2;
    const ry = dotsToPx(p.height, scale, dpmm) / 2;
    const stroke = p.color === "B" ? "#000000" : "#cccccc";
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    // Option-A geometry — same outlineInset() definition as the box
    // path so the firmware's clamp-to-solid rule stays consistent
    // across shapes; only the centred-stroke placement differs.
    const insetGeom = outlineInset(rx * 2, ry * 2, strokeWidth, p.filled);
    const renderFilled = insetGeom.renderFilled;
    const insetRx = insetGeom.width / 2;
    const insetRy = insetGeom.height / 2;
    const fill = renderFilled
      ? p.color === "B"
        ? "#000000"
        : "#ffffff"
      : "transparent";
    return (
      <Ellipse
        id={obj.id}
        x={x + rx}
        y={y + ry}
        radiusX={insetRx}
        radiusY={insetRy}
        stroke={isSelected ? colors.selection : stroke}
        strokeWidth={
          isSelected
            ? Math.max(strokeWidth, 1.5)
            : renderFilled
              ? 0
              : strokeWidth
        }
        strokeScaleEnabled={false}
        fill={fill}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={(e) => {
          // Center-anchored: snap the top-left corner, then re-add radius
          const snapped = snapPos(e.target.x() - rx, e.target.y() - ry);
          e.target.position({ x: snapped.x + rx, y: snapped.y + ry });
        }}
        onDragEnd={(e) => {
          onChange({
            x: pxToDots(e.target.x() - rx - offsetX, scale, dpmm),
            y: pxToDots(e.target.y() - ry - offsetY, scale, dpmm),
          });
        }}
      />
    );
  }

  if (obj.type === "circle") {
    const p = obj.props;
    const r = dotsToPx(p.diameter, scale, dpmm) / 2;
    const stroke = p.color === "B" ? "#000000" : "#cccccc";
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    // Option-A geometry — same outlineInset() definition as box/ellipse.
    const insetGeom = outlineInset(r * 2, r * 2, strokeWidth, p.filled);
    const renderFilled = insetGeom.renderFilled;
    const insetR = insetGeom.width / 2;
    const fill = renderFilled
      ? p.color === "B"
        ? "#000000"
        : "#ffffff"
      : "transparent";
    return (
      <Circle
        id={obj.id}
        x={x + r}
        y={y + r}
        radius={insetR}
        stroke={isSelected ? colors.selection : stroke}
        strokeWidth={
          isSelected
            ? Math.max(strokeWidth, 1.5)
            : renderFilled
              ? 0
              : strokeWidth
        }
        strokeScaleEnabled={false}
        fill={fill}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={(e) => {
          const snapped = snapPos(e.target.x() - r, e.target.y() - r);
          e.target.position({ x: snapped.x + r, y: snapped.y + r });
        }}
        onDragEnd={(e) => {
          onChange({
            x: pxToDots(e.target.x() - r - offsetX, scale, dpmm),
            y: pxToDots(e.target.y() - r - offsetY, scale, dpmm),
          });
        }}
      />
    );
  }

  return null;
}
