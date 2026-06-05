import { useFontCacheVersion } from "../../hooks/useFontCacheVersion";
import { Ellipse, Group, Line, Rect, Shape, Text } from "react-konva";
import { lookupBoundVariable, shouldShowFallbackTint } from "../../lib/variableBinding";
import { BarcodeObject } from "./BarcodeObject";
import { LineObject } from "./LineObject";
import { ImageObject } from "./ImageObject";
import type Konva from "konva";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { outlineInset } from "../../lib/shapeGeometry";
import { reverseShapeStyle } from "./reverseShapeStyle";
import { useColorScheme } from "../../lib/useColorScheme";
import { useLabelStore } from "../../store/labelStore";
import { applyBindingToObject, buildActiveCsvRow, clockCtxFromLabel } from "../../lib/variableBinding";
import { ZPL_FONT_HEIGHT_TO_CSS_RATIO } from "../../lib/labelGeometry/textPositionTransforms";
import { getTextRenderMetrics } from "../../lib/labelGeometry/textRenderMetrics";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";
import { DEFAULT_GS_SYMBOL_META, GS_SYMBOLS } from "../../registry/symbol";
import { GS_SYMBOL_PATHS, GS_VECTOR_CODES, type GsVectorCode } from "../../registry/gsSymbolPaths";
import { blockBoundsDots, zebraAlignOffsetDots, zebraLineWidthDots } from "../../lib/zebraTextLayout";
import type { LeafObject } from "../../registry";
import type { TextProps } from "../../registry/text";
import type { SerialProps } from "../../registry/serial";

type Props = KonvaObjectProps;

/** Non-listening selection overlay tracing the declared bbox; decoupled
 *  from the body so thick outlines still get a clean marker. */
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

/** Ellipse-shaped counterpart of `SelectionOverlay` for ^GE / ^GC bodies. */
function EllipseSelectionOverlay({
  rx,
  ry,
  color,
}: {
  rx: number;
  ry: number;
  color: string;
}) {
  return (
    <Ellipse
      x={rx}
      y={ry}
      radiusX={rx}
      radiusY={ry}
      stroke={color}
      strokeWidth={1.5}
      strokeScaleEnabled={false}
      fill="transparent"
      listening={false}
    />
  );
}

/** Canvas projection of ^FP (direction is a single letter, V/R exclusive). */
function applyFpToContent(content: string, fpDirection: "H" | "V" | "R" | undefined): string {
  if (fpDirection === "V") return [...content].join("\n");
  if (fpDirection === "R") return [...content].reverse().join("");
  return content;
}

/** Reversed block's left edge sits this fraction of fontHeight right of
 *  `FO - totalAdvance`. Per Labelary pixel scan. */
const FPR_ANCHOR_LEFT_PADDING_RATIO = 0.8;

interface BaseTextProps {
  fontSize: number;
  fontFamily: string;
  fontStyle: "bold";
  scaleX: number;
  rotation: number;
  fill: string;
  stroke: string | undefined;
  strokeWidth: number;
  letterSpacing?: number;
  /** Horizontal shift per glyph (used by ^FPR). */
  offsetXPx?: number;
}

/** One `<Text>` per line at Zebra alignment offset when ^FB is active.
 *  Konva's own Text.align uses canvas measureText which over-estimates
 *  A0 advances and drifts noticeably on centred blocks. */
type TextFieldObj =
  | (LeafObject & { type: "text"; props: TextProps })
  | (LeafObject & { type: "serial"; props: SerialProps });

function TextFieldContent({
  obj,
  content,
  base,
  scale,
  dpmm,
  fontVersion,
}: {
  obj: TextFieldObj;
  content: string;
  base: BaseTextProps;
  scale: number;
  dpmm: number;
  fontVersion: number;
}) {
  const shift = base.offsetXPx ?? 0;
  if (obj.type !== "text") {
    return <Text key={fontVersion} x={shift} y={0} text={content} {...base} />;
  }
  const { blockWidth, blockJustify, blockLineSpacing, fontHeight, fontWidth } = obj.props;
  if (!blockWidth) {
    return <Text key={fontVersion} x={shift} y={0} text={content} {...base} />;
  }
  const justify = blockJustify ?? "L";
  const lineStepPx = base.fontSize + dotsToPx(blockLineSpacing ?? 0, scale, dpmm);
  return (
    <>
      {content.split("\n").map((line, i) => {
        const lineWidthDots = zebraLineWidthDots(line, fontHeight, fontWidth);
        const offsetDots = zebraAlignOffsetDots(lineWidthDots, blockWidth, justify);
        return (
          <Text
            key={`${fontVersion}-${i}`}
            x={dotsToPx(offsetDots, scale, dpmm)}
            y={i * lineStepPx}
            text={line}
            {...base}
          />
        );
      })}
    </>
  );
}

/** Dashed wrap guide at ^FB blockWidth. The invisible Rect over the
 *  full block extent anchors the Group's clientRect so the Transformer
 *  covers the FO-aligned area regardless of C/R justify. */
function BlockWrapGuide({
  blockWidthDots,
  blockLines,
  blockLineSpacing,
  fontHeight,
  scale,
  dpmm,
  color,
}: {
  blockWidthDots: number;
  blockLines: number;
  blockLineSpacing: number;
  fontHeight: number;
  scale: number;
  dpmm: number;
  color: string;
}) {
  const bounds = blockBoundsDots({ blockWidthDots, blockLines, blockLineSpacing, fontHeight });
  const widthPx = dotsToPx(bounds.width, scale, dpmm);
  const heightPx = dotsToPx(bounds.height, scale, dpmm);
  return (
    <>
      <Rect
        x={dotsToPx(bounds.x, scale, dpmm)}
        y={dotsToPx(bounds.y, scale, dpmm)}
        width={widthPx}
        height={heightPx}
        fill="transparent"
        listening={false}
      />
      <Line
        points={[widthPx, 0, widthPx, heightPx]}
        stroke={color}
        strokeWidth={1}
        dash={[4, 3]}
        listening={false}
      />
    </>
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
  "maxicode",
  "micropdf417",
  "codablock",
  "upcEanExtension",
  "code49",
  "tlc39",
]);

export function KonvaObject(props_: Props) {
  const variables = useLabelStore((s) => s.variables);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const csvRenderMode = useLabelStore((s) => s.canvasSettings.csvRenderMode);
  const label = useLabelStore((s) => s.label);
  const active = buildActiveCsvRow(csvDataset, csvMapping);
  const obj = applyBindingToObject(
    props_.obj, variables, active, csvRenderMode, clockCtxFromLabel(label),
  );
  const renderProps = obj === props_.obj ? props_ : { ...props_, obj };

  const boundVariable = lookupBoundVariable(obj, variables);
  const showFallbackTint = shouldShowFallbackTint(
    boundVariable, csvDataset, csvMapping, csvRenderMode,
  );

  const shape =
    obj.type === "line" ? <LineObject {...renderProps} obj={obj} /> :
    obj.type === "image" ? <ImageObject {...renderProps} obj={obj} /> :
    BARCODE_TYPES.has(obj.type) ? <BarcodeObject {...renderProps} /> :
    <KonvaObjectInner {...renderProps} />;

  if (!showFallbackTint) return shape;

  // Skip tint for content-derived-width shapes (barcodes); badge covers them.
  const props = (obj as { props?: { width?: unknown; height?: unknown } }).props;
  const wDots = typeof props?.width === "number" ? props.width : 0;
  const hDots = typeof props?.height === "number" ? props.height : 0;
  if (wDots <= 0 || hDots <= 0) return shape;
  const { scale, dpmm, offsetX, offsetY } = props_;
  const tintX = dotsToPx(obj.x, scale, dpmm) - offsetX;
  const tintY = dotsToPx(obj.y, scale, dpmm) - offsetY;
  const tintW = dotsToPx(wDots, scale, dpmm);
  const tintH = dotsToPx(hDots, scale, dpmm);

  return (
    <Group>
      <Rect
        x={tintX}
        y={tintY}
        width={tintW}
        height={tintH}
        fill="#fb923c"
        opacity={0.12}
        listening={false}
      />
      {shape}
    </Group>
  );
}

/** New shape types: put `id={obj.id}` on the outermost Group (stage
 *  lookups walk up to it) and use the selection-overlay components
 *  rather than re-tracing the body's stroke. */
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
  const fontVersion = useFontCacheVersion();
  const colors = useColorScheme();
  // Pass label so metrics resolves uploaded-TTF previews. ZPL emit/parse
  // call without `label` so round-trip stays PrintLab-based.
  const label = useLabelStore((s) => s.label);
  const requestContentEditorFocus = useLabelStore((s) => s.requestContentEditorFocus);
  const setSidebarTab = useLabelStore((s) => s.setSidebarTab);
  const selectObjects = useLabelStore((s) => s.selectObjects);
  // obj.x/y is the EM-bbox top-left; ZPL anchor delta is applied only
  // at the zplGenerator/zplParser boundary.
  const baseMetrics = getTextRenderMetrics(obj, undefined, label);
  const textMetrics =
    baseMetrics && (obj.type === "text" || obj.type === "serial")
      ? {
          ...baseMetrics,
          fontSizePx: Math.max(
            dotsToPx(obj.props.fontHeight, scale, dpmm) /
              ZPL_FONT_HEIGHT_TO_CSS_RATIO,
            6,
          ),
        }
      : null;

  const x = offsetX + dotsToPx(obj.x, scale, dpmm);
  const y = offsetY + dotsToPx(obj.y, scale, dpmm);

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
    onChange({
      x: pxToDots(e.target.x() - offsetX, scale, dpmm),
      y: pxToDots(e.target.y() - offsetY, scale, dpmm),
    });
  };

  if ((obj.type === "text" || obj.type === "serial") && textMetrics) {
    const p = obj.props;
    const { content, fontFamily, fontScaleX, fontSizePx } = textMetrics;
    const zplRotationDeg: Record<typeof p.rotation, number> = {
      N: 0,
      R: 90,
      I: 180,
      B: 270,
    };

    // Labelary ignores ^FP gap in V mode; mirror that on canvas while
    // still round-tripping the value through ZPL emit.
    const fpDirection = obj.type === "text" ? obj.props.fpDirection : undefined;
    const fpCharGap = obj.type === "text" ? obj.props.fpCharGap ?? 0 : 0;
    const fpContent = applyFpToContent(content, fpDirection);
    const fpLetterSpacingPx =
      fpDirection !== "V" && fpCharGap > 0 ? dotsToPx(fpCharGap, scale, dpmm) : 0;
    let fpShiftXPx = 0;
    if (fpDirection === "R" && content.length > 1) {
      const anchorPadDots = obj.props.fontHeight * FPR_ANCHOR_LEFT_PADDING_RATIO;
      const reservedPx = dotsToPx(textMetrics.inkWidthDots - anchorPadDots, scale, dpmm);
      const gapPx = (content.length - 1) * fpLetterSpacingPx;
      fpShiftXPx = -(reservedPx + gapPx);
    }

    if (obj.type === "text" && obj.props.reverse) {
      // Match the printer's ^GB knockout exactly: width = measured ink,
      // height = font height. Mirrors the generator's `^GB inkW, fontHeight`.
      const approxW = dotsToPx(textMetrics.inkWidthDots, scale, dpmm);
      const approxH = fontSizePx;
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
            // Drop Konva's text-width cache on @font-face load.
            key={fontVersion}
            text={fpContent}
            fontSize={fontSizePx}
            fontFamily={fontFamily}
            fontStyle="bold"
            scaleX={fontScaleX}
            fill="#ffffff"
            letterSpacing={fpLetterSpacingPx}
            x={fpShiftXPx}
            y={0}
          />
        </Group>
      );
    }

    // Outer Group stays axis-aligned for the Transformer; rotation is
    // applied to the inner Text. Direct rotation on the transformer's
    // node produces drift and 1e15-class numbers on commit.
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        // selectObjects directly so leaf-in-group pierces auto-promotion.
        onDblClick={() => {
          if (obj.locked) return;
          selectObjects([obj.id]);
          setSidebarTab("properties");
          requestContentEditorFocus(obj.id);
        }}
        onDblTap={() => {
          if (obj.locked) return;
          selectObjects([obj.id]);
          setSidebarTab("properties");
          requestContentEditorFocus(obj.id);
        }}
      >
        <TextFieldContent
          obj={obj as TextFieldObj}
          content={fpContent}
          base={{
            fontSize: fontSizePx,
            fontFamily,
            fontStyle: "bold",
            scaleX: fontScaleX,
            rotation: zplRotationDeg[p.rotation],
            fill: "#000000",
            stroke: isSelected ? colors.selection : undefined,
            strokeWidth: isSelected ? 1 : 0,
            letterSpacing: fpLetterSpacingPx,
            offsetXPx: fpShiftXPx,
          }}
          scale={scale}
          dpmm={dpmm}
          fontVersion={fontVersion}
        />
        {obj.type === "text" && isSelected && obj.props.blockWidth && (
          <BlockWrapGuide
            blockWidthDots={obj.props.blockWidth}
            blockLines={obj.props.blockLines ?? 1}
            blockLineSpacing={obj.props.blockLineSpacing ?? 0}
            fontHeight={obj.props.fontHeight}
            scale={scale}
            dpmm={dpmm}
            color={colors.accent}
          />
        )}
      </Group>
    );
  }

  if (obj.type === "symbol") {
    const p = obj.props;
    const w = dotsToPx(p.width, scale, dpmm);
    const h = dotsToPx(p.height, scale, dpmm);
    // A/B/C: vector paths from Labelary. D/E (trademarked UL/CSA) and
    // unknown codes fall to the placeholder branch.
    const vectorPath = GS_VECTOR_CODES.has(p.symbol)
      ? GS_SYMBOL_PATHS[p.symbol as GsVectorCode]
      : null;
    // Zebra rotates only the glyph; bbox stays at (w, h). sceneFunc bakes
    // rotation into rel + canvas rotate.
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
        {/* Hit area for both vector and placeholder branches (both listening=false). */}
        <Rect width={w} height={h} fill="transparent" />
        {vectorPath ? (() => {
            // Custom Shape with Path2D + even-odd fill: Konva.Path has no
            // fillRule, so ®/© holes can't be carved via nonzero. `rel`
            // is the per-rotation glyph rect measured from Labelary;
            // ?? rel.N guards malformed-import rotation strings.
            const rel = vectorPath.rel[p.rotation] ?? vectorPath.rel.N;
            const glyphW = vectorPath.bbox.maxX - vectorPath.bbox.minX;
            const glyphH = vectorPath.bbox.maxY - vectorPath.bbox.minY;
            const renderW = w * rel.w;
            const renderH = h * rel.h;
            const renderX = w * rel.x;
            const renderY = h * rel.y;
            return (
              <Shape
                listening={false}
                sceneFunc={(ctx) => {
                  ctx.save();
                  ctx.translate(renderX, renderY);
                  // R/B swap effective W/H because upright glyph is sideways.
                  if (p.rotation === "R") {
                    ctx.translate(renderW, 0);
                    ctx.rotate(Math.PI / 2);
                    ctx.scale(renderH / glyphW, renderW / glyphH);
                  } else if (p.rotation === "I") {
                    ctx.translate(renderW, renderH);
                    ctx.rotate(Math.PI);
                    ctx.scale(renderW / glyphW, renderH / glyphH);
                  } else if (p.rotation === "B") {
                    ctx.translate(0, renderH);
                    ctx.rotate(-Math.PI / 2);
                    ctx.scale(renderH / glyphW, renderW / glyphH);
                  } else {
                    ctx.scale(renderW / glyphW, renderH / glyphH);
                  }
                  ctx.translate(-vectorPath.bbox.minX, -vectorPath.bbox.minY);
                  const path = new Path2D(vectorPath.d);
                  ctx.fillStyle = "#000000";
                  // Reach into Konva's underlying 2D context for the
                  // path/rule overload that Konva's wrapper omits.
                  ctx._context.fill(path, "evenodd");
                  ctx.restore();
                }}
              />
            );
          })() : (
            <>
              <Rect
                width={w}
                height={h}
                stroke="#9ca3af"
                strokeWidth={Math.max(1, Math.min(w, h) * 0.04)}
                strokeScaleEnabled={false}
                dash={[Math.max(4, w * 0.06), Math.max(3, w * 0.04)]}
                cornerRadius={Math.min(w, h) * 0.15}
                fill="transparent"
                listening={false}
              />
              <Text
                x={0}
                y={0}
                width={w}
                height={h}
                align="center"
                verticalAlign="middle"
                text={(GS_SYMBOLS.find((s) => s.code === p.symbol) ?? DEFAULT_GS_SYMBOL_META).glyph}
                fontSize={Math.min(h, w) * 0.5}
                fontFamily="'Courier New', monospace"
                fontStyle="bold"
                fill="#6b7280"
                listening={false}
              />
            </>
          )}
        {isSelected && (
          <Rect
            width={w}
            height={h}
            stroke={colors.selection}
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            fill="transparent"
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (obj.type === "box") {
    const p = obj.props;
    const w = dotsToPx(p.width, scale, dpmm);
    const h = dotsToPx(p.height, scale, dpmm);
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    const cornerRadius =
      p.rounding * dotsToPx(Math.min(p.width, p.height) / 8, scale, dpmm);
    // promoteFilled=true: ^GB extrudes solid to max(w,t) x max(h,t)
    // (see shapeRender.ts). ^GE/^GC collapse without promotion.
    const insetGeom = outlineInset(w, h, strokeWidth, p.filled, true);
    const renderFilled = insetGeom.renderFilled;
    const insetCornerRadius = renderFilled
      ? cornerRadius
      : Math.max(0, cornerRadius - strokeWidth / 2);

    const { stroke, fill, globalCompositeOperation } = reverseShapeStyle(
      p.reverse,
      p.color,
      renderFilled,
    );
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
          globalCompositeOperation={globalCompositeOperation}
        />
        {isSelected && (
          <SelectionOverlay
            width={w}
            height={h}
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
    const w = dotsToPx(p.width, scale, dpmm);
    const h = dotsToPx(p.height, scale, dpmm);
    const rx = w / 2;
    const ry = h / 2;
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    const insetGeom = outlineInset(w, h, strokeWidth, p.filled);
    const renderFilled = insetGeom.renderFilled;
    const insetRx = insetGeom.width / 2;
    const insetRy = insetGeom.height / 2;
    const { stroke, fill, globalCompositeOperation } = reverseShapeStyle(
      p.reverse,
      p.color,
      renderFilled,
    );
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
        <Ellipse
          x={rx}
          y={ry}
          radiusX={insetRx}
          radiusY={insetRy}
          stroke={stroke}
          strokeWidth={renderFilled ? 0 : strokeWidth}
          strokeScaleEnabled={false}
          fill={fill}
          globalCompositeOperation={globalCompositeOperation}
        />
        {isSelected && (
          <EllipseSelectionOverlay rx={rx} ry={ry} color={colors.selection} />
        )}
      </Group>
    );
  }

  return null;
}
