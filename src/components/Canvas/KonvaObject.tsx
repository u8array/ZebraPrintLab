import { getFontFamily } from "../../lib/fontCache";
import { useFontCacheVersion } from "../../hooks/useFontCacheVersion";
import { Circle, Ellipse, Group, Rect, Text } from "react-konva";
import { BarcodeObject } from "./BarcodeObject";
import { LineObject } from "./LineObject";
import { ImageObject } from "./ImageObject";
import type Konva from "konva";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { objectToDisplay, displayToObject } from "./textPositionTransforms";
import type { KonvaObjectProps } from "./konvaObjectProps";

type Props = KonvaObjectProps;

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
    const fontSize = Math.max(dotsToPx(p.fontHeight, scale, dpmm) / 1.3, 6);
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
          draggable
          onClick={(e) =>
            onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
          }
          onTap={() => onSelect(false)}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <Rect
            width={approxW}
            height={approxH}
            fill="#000000"
            stroke={isSelected ? "#6366f1" : undefined}
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
        stroke={isSelected ? "#6366f1" : undefined}
        strokeWidth={isSelected ? 1 : 0}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === "serial") {
    const p = obj.props;
    const fontSize = Math.max(dotsToPx(p.fontHeight, scale, dpmm) / 1.3, 6);
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
        stroke={isSelected ? "#6366f1" : undefined}
        strokeWidth={isSelected ? 1 : 0}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
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

    const useReverse = !isSelected && p.reverse;
    const stroke = useReverse
      ? "#ffffff"
      : p.color === "B"
        ? "#000000"
        : "#cccccc";
    const fill = useReverse
      ? p.filled
        ? "#ffffff"
        : "transparent"
      : p.filled
        ? p.color === "B"
          ? "#000000"
          : "#ffffff"
        : "transparent";
    return (
      <Rect
        id={obj.id}
        x={x}
        y={y}
        width={w}
        height={h}
        stroke={isSelected ? "#6366f1" : stroke}
        strokeWidth={isSelected ? Math.max(strokeWidth, 1.5) : strokeWidth}
        strokeScaleEnabled={false}
        fill={fill}
        cornerRadius={cornerRadius}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        globalCompositeOperation={
          !isSelected && p.reverse ? "difference" : "source-over"
        }
      />
    );
  }

  if (obj.type === "ellipse") {
    const p = obj.props;
    const rx = dotsToPx(p.width, scale, dpmm) / 2;
    const ry = dotsToPx(p.height, scale, dpmm) / 2;
    const stroke = p.color === "B" ? "#000000" : "#cccccc";
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    const fill = p.filled
      ? p.color === "B"
        ? "#000000"
        : "#ffffff"
      : "transparent";
    return (
      <Ellipse
        id={obj.id}
        x={x + rx}
        y={y + ry}
        radiusX={rx}
        radiusY={ry}
        stroke={isSelected ? "#6366f1" : stroke}
        strokeWidth={isSelected ? Math.max(strokeWidth, 1.5) : strokeWidth}
        strokeScaleEnabled={false}
        fill={fill}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
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
    const fill = p.filled
      ? p.color === "B"
        ? "#000000"
        : "#ffffff"
      : "transparent";
    return (
      <Circle
        id={obj.id}
        x={x + r}
        y={y + r}
        radius={r}
        stroke={isSelected ? "#6366f1" : stroke}
        strokeWidth={isSelected ? Math.max(strokeWidth, 1.5) : strokeWidth}
        strokeScaleEnabled={false}
        fill={fill}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
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
