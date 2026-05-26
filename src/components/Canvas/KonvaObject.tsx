import { useMemo } from "react";
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
import { applyBindingToObject, buildActiveCsvRow } from "../../lib/variableBinding";
import { ZPL_FONT_HEIGHT_TO_CSS_RATIO } from "./textPositionTransforms";
import { getTextRenderMetrics } from "./textRenderMetrics";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";
import { DEFAULT_GS_SYMBOL_META, GS_SYMBOLS } from "../../registry/symbol";
import { GS_SYMBOL_PATHS, GS_VECTOR_CODES, type GsVectorCode } from "../../registry/gsSymbolPaths";
import { zebraAlignOffsetDots, zebraLineWidthDots } from "../../lib/zebraTextLayout";
import type { LeafObject } from "../../registry";
import type { TextProps } from "../../registry/text";
import type { SerialProps } from "../../registry/serial";

type Props = KonvaObjectProps;

/**
 * Selection outline drawn as a separate (non-listening) overlay so the
 * underlying shape can keep its own stroke / fill / globalCompositeOperation
 * without compromise. Sits at local (0, 0) inside the parent Group so it
 * follows drag translations together with the body. Tracing the declared
 * bbox (not the inset body) means a thick outline shape gets a marker on
 * its outer pixel, matching the user's mental model of selection.
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

/** Shared `<Text>` props baked once per render of a text/serial field.
 *  Every Text node in the field (single-line or per-^FB-line) uses
 *  the same font / scale / rotation / fill / selection-stroke; only
 *  `key`, `text`, and `(x, y)` vary across them. */
interface BaseTextProps {
  fontSize: number;
  fontFamily: string;
  fontStyle: "bold";
  scaleX: number;
  rotation: number;
  fill: string;
  stroke: string | undefined;
  strokeWidth: number;
}

/** Render a text/serial field as either a single Konva `<Text>` or,
 *  when `^FB` is active on a text object, one `<Text>` per line at a
 *  Zebra-style alignment offset. Per-line + offset against ZPL's
 *  documented 5:9 A0 advance (`zebraTextLayout`) keeps the canvas
 *  centred / right-aligned output aligned with Labelary — Konva's
 *  own `Text.align` uses canvas `measureText` which over-estimates
 *  A0 glyph widths and drifts noticeably for centred blocks. */
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
  if (obj.type !== "text") {
    return <Text key={fontVersion} x={0} y={0} text={content} {...base} />;
  }
  const { blockWidth, blockJustify, blockLineSpacing, fontHeight, fontWidth } = obj.props;
  if (!blockWidth) {
    return <Text key={fontVersion} x={0} y={0} text={content} {...base} />;
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

/** Dashed vertical guide at `^FB` blockWidth so the user sees where
 *  the printer wraps. Rendered only while the text is selected;
 *  height matches `blockLines * lineStep` to cover the full block. */
function BlockWrapGuide({
  blockWidthDots,
  blockLines,
  blockLineSpacing,
  fontSizePx,
  scale,
  dpmm,
  color,
}: {
  blockWidthDots: number;
  blockLines: number;
  blockLineSpacing: number;
  fontSizePx: number;
  scale: number;
  dpmm: number;
  color: string;
}) {
  const lineStep = fontSizePx + dotsToPx(blockLineSpacing, scale, dpmm);
  const guideX = dotsToPx(blockWidthDots, scale, dpmm);
  return (
    <Line
      points={[guideX, 0, guideX, blockLines * lineStep]}
      stroke={color}
      strokeWidth={1}
      dash={[4, 3]}
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
  "upcEanExtension",
  "code49",
]);

export function KonvaObject(props_: Props) {
  // Substitute the bound variable's resolved value into `props.content`
  // before any per-type renderer touches the obj. Keeps Konva blissfully
  // unaware of the binding mechanism: every shape draws what would
  // print for the currently active CSV row (or the variable's
  // defaultValue when no CSV is in play). `applyBindingToObject`
  // is identity-preserving when the obj isn't bound, so memoisation
  // downstream isn't affected for the common case.
  const variables = useLabelStore((s) => s.variables);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const csvRenderMode = useLabelStore((s) => s.canvasSettings.csvRenderMode);
  // useMemo so applyBindingToObject's identity-preservation downstream
  // isn't defeated by a fresh ActiveCsvRow object on every render.
  const active = useMemo(
    () => buildActiveCsvRow(csvDataset, csvMapping),
    [csvDataset, csvMapping],
  );
  const obj = applyBindingToObject(props_.obj, variables, active, csvRenderMode);
  const renderProps = obj === props_.obj ? props_ : { ...props_, obj };

  // Bounds-tint when bound field is rendering fallback (no CSV cell
  // for this variable). The rule lives in lib so it's testable
  // without Konva; see shouldShowFallbackTint for the full predicate.
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

  // Read declared bbox from props. Shapes with explicit width/height
  // (text, box, ellipse, image, qrcode, datamatrix) produce a visible
  // tint; barcodes whose width is derived from content length (Code39,
  // Code128, EAN-13, …) silently skip — their bars are visually
  // distinctive enough that fallback ambiguity is less acute, and the
  // source-state badge in the Variables panel covers them.
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

/**
 * Per-type Konva renderer dispatcher (`KonvaObject` above narrows by
 * `obj.type` and routes to the right component / case).
 *
 * Convention for adding a new shape type:
 *
 *  1. `id={obj.id}` sits on the **outermost render node**. Every shape
 *     wraps body plus selection overlay in a `<Group>` and puts the id
 *     there. Stage-level lookups (`stage.findOne(#id)`, snap, alt+click
 *     cycle) all walk up to the id'd ancestor, so this stays consistent.
 *
 *  2. Selection visuals: shapes draw a dedicated overlay component
 *     (`SelectionOverlay` for rectangular bodies, `EllipseSelectionOverlay`
 *     for ^GE / ^GC) that traces the declared outer bbox. Decoupling the
 *     marker from the body means a thick outline (or a ^LRY difference-
 *     blended body) keeps a clean blue marker on its outer pixel rather
 *     than re-tracing the body's stroke. The overlay sits inside the same
 *     Group as the body so drag translations move both together.
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
  const fontVersion = useFontCacheVersion();
  const colors = useColorScheme();
  // Pass the whole label config so the metrics helper can resolve
  // either a per-field `fontId` or the label-wide `defaultFontId` to
  // an uploaded preview TTF. ZPL emit/parse intentionally call the
  // metrics without `label`, so their ink-width stays PrintLab-ZPL
  // based and the round-trip is unaffected.
  const label = useLabelStore((s) => s.label);
  const requestContentEditorFocus = useLabelStore((s) => s.requestContentEditorFocus);
  const setSidebarTab = useLabelStore((s) => s.setSidebarTab);
  const selectObjects = useLabelStore((s) => s.selectObjects);
  // obj.x/y is the Konva render position (top-left of the EM bbox) —
  // identical to what every other shape stores. The ZPL anchor (^FO
  // cap-top / ^FT baseline) lives at obj.x/y + zplAnchorDelta and is
  // applied only at the I/O boundary by zplGenerator / zplParser, so
  // every in-editor interaction (drag, resize, snap, smart-align) sees
  // a shape-agnostic single coordinate system.
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

    if (obj.type === "text" && obj.props.reverse) {
      // ZPL `^A0,h,w` lets `w` differ from `h` to stretch each glyph
      // horizontally. `w=0` is Zebra shorthand for "match the height".
      // Konva mirrors this with a scaleX on the text node: the FO anchor
      // stays at (x, y) but the rendered glyphs occupy (w/h)·advance.
      // Use the measured ink width (already in dot space, mirrored to
      // CSS px via dotsToPx) so the inverted background bbox tracks the
      // actual rendered text rather than a length-based guess.
      // Match the printer's ^GB knockout-background exactly: width =
      // measured ink width, height = font height in CSS px. Earlier
      // versions padded the height to 1.3× for visual breathing room
      // but that hid what the printer actually emits — the canvas now
      // mirrors the same `^GB inkW, fontHeight` shape the generator
      // produces, so the preview matches Labelary and the real device.
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
            // Force re-mount on font-cache changes so Konva's internal
            // text-width cache is dropped; otherwise a width measured
            // before @font-face finished loading sticks and the rotated
            // bbox lands a few dots off.
            key={fontVersion}
            text={content}
            fontSize={fontSizePx}
            fontFamily={fontFamily}
            fontStyle="bold"
            scaleX={fontScaleX}
            fill="#ffffff"
            y={0}
          />
        </Group>
      );
    }

    // Wrap in an unrotated Group with the rotated Text inside so the
    // Konva node carrying obj.id (which the Transformer attaches to) is
    // axis-aligned even when ZPL rotation is R/I/B. Same trick that lets
    // box / ellipse resize cleanly: the transformer math runs on an
    // axis-aligned bbox, with the inner rotation just changing how the
    // glyphs paint within that bbox. Without this, Konva.Text's rotation
    // attached directly to the transformer's node makes resize math
    // produce drift, runaway scale, and 1e15-class numbers on commit.
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        // selectObjects directly (not onSelect) so a leaf inside a
        // group pierces the group's auto-promotion.
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
          content={content}
          base={{
            fontSize: fontSizePx,
            fontFamily,
            fontStyle: "bold",
            scaleX: fontScaleX,
            rotation: zplRotationDeg[p.rotation],
            fill: "#000000",
            stroke: isSelected ? colors.selection : undefined,
            strokeWidth: isSelected ? 1 : 0,
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
            fontSizePx={fontSizePx}
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
    // A/B/C have real vector paths sourced from Labelary (pixel-true
    // to Zebra firmware). D/E are trademarked UL/CSA logos we can't
    // ship — render a clearly-placeholder dashed gray box with the
    // letters so the user knows the printer will substitute the real
    // logo. Unknown codes (D/E or malformed import) take the same
    // placeholder branch via the null path here.
    const vectorPath = GS_VECTOR_CODES.has(p.symbol)
      ? GS_SYMBOL_PATHS[p.symbol as GsVectorCode]
      : null;
    // The field bbox itself doesn't rotate — Zebra keeps the ^FO
    // anchor and (w, h) extent fixed and rotates only the glyph
    // inside. Skip the outer rotatedGroupTransform; sceneFunc bakes
    // rotation into the per-rotation `rel` rect + a canvas rotate
    // for the path orientation.
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
        {/* Single hit area for the whole field bbox — picks up clicks
            both for the vector-path branch and the placeholder branch
            below (both of which render with listening={false}). One
            source of truth for "where in this Group counts as a hit"
            instead of duplicating a transparent Rect inside each
            branch. */}
        <Rect width={w} height={h} fill="transparent" />
        {vectorPath ? (() => {
            // Konva.Path has no fillRule prop, so the holes in ® / ©
            // (inner ring carved out of the outer disc) can't be
            // expressed via Path's nonzero fill. Drop down to a
            // custom Shape that builds a Path2D from the d-string
            // and fills it with the native even-odd rule — handles
            // both the holed glyphs and the multi-letter ™ uniformly.
            //
            // `rel[rotation]` carries the post-rotation glyph rect
            // inside the declared bbox, measured directly from
            // Labelary so Zebra's per-rotation anchor offsets match
            // pixel-for-pixel.
            // Defensive ?? rel.N for the malformed-import case where
            // a JSON-restored object slips a non-N/R/I/B rotation
            // string past the type system; falling back to the
            // upright entry keeps the canvas from crashing on bad
            // data instead of throwing inside sceneFunc.
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
                  // For each rotation: pre-translate so the post-rotation
                  // glyph bbox starts at (0, 0) within the rel rect,
                  // then rotate, then scale upright path coords to fit
                  // the (renderW × renderH) target. R/B swap effective
                  // W/H because the upright glyph is sideways on screen.
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
                  // Konva.Context exposes the underlying 2D canvas
                  // context as `_context`; reach for it directly so
                  // we can call `fill(path, "evenodd")` — the Konva
                  // wrapper doesn't surface the path/rule overload.
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
    // Option-A geometry (delegated to lib/shapeGeometry.ts so the Konva
    // canvas, the @napi-rs pixel-regression renderer, and any future
    // consumer share one definition of ZPL ^GB extrusion). Centred
    // stroke on the inset rect places the band exactly inside the
    // declared bbox; the firmware's clamp-to-solid rule is handled by
    // `renderFilled`.
    // promoteFilled=true: see note in shapeRender.ts — ^GB rects extrude
    // their solid fill to max(w,t) × max(h,t) per Zebra firmware. The
    // ellipse branch below leaves this off because ^GE / ^GC
    // collapse to solid at their declared bbox without promotion.
    const insetGeom = outlineInset(w, h, strokeWidth, p.filled, true);
    const renderFilled = insetGeom.renderFilled;
    const insetCornerRadius = renderFilled
      ? cornerRadius
      : Math.max(0, cornerRadius - strokeWidth / 2);

    // Inverted (^LRY) paint is delegated to reverseShapeStyle so box
    // and ellipse share the same colour rules — the helper covers the
    // stroke/fill swap for filled outlines (banding workaround) and
    // the difference-blend that produces the print-correct knockout.
    const { stroke, fill, globalCompositeOperation } = reverseShapeStyle(
      p.reverse,
      p.color,
      renderFilled,
    );
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
          globalCompositeOperation={globalCompositeOperation}
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
    const w = dotsToPx(p.width, scale, dpmm);
    const h = dotsToPx(p.height, scale, dpmm);
    const rx = w / 2;
    const ry = h / 2;
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
    // Option-A geometry — same outlineInset() definition as the box
    // path so the firmware's clamp-to-solid rule stays consistent
    // across shapes; only the centred-stroke placement differs.
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
