import React, { useCallback, useRef } from "react";
import bwipjs from "bwip-js/browser";
import { Image as KImage, Group, Rect, Text } from "react-konva";
import type Konva from "konva";
import { BARCODE_1D_TYPES, ObjectRegistry } from "../../registry";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { useColorScheme } from "../../lib/useColorScheme";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";
import {
  buildBwipOptions,
  cleanBwipError,
  getDisplaySize,
  get1DBwipScale,
  getEanUpcLayout,
  type BarcodeDisplaySize,
  type EanUpcType,
} from "./bwipHelpers";
import { objectRotation } from "../../registry/rotation";
import { rotatedGroupTransform } from "./rotatedGroupTransform";
import { buildEanUpcDigitOverlay } from "./eanUpcDigitNodes";
import {
  QR_FO_Y_OFFSET_DOTS,
  QR_FT_MODULE_OFFSET,
  EAN_UPC_TYPES,
} from "./bwipConstants";

export function BarcodeObject({
  obj,
  scale,
  dpmm,
  offsetX,
  offsetY,
  isSelected,
  onSelect,
  onChange,
  snap,
}: KonvaObjectProps) {
  const groupRef = useRef<Konva.Group>(null);
  const textRef = useRef<Konva.Text>(null);
  const colors = useColorScheme();

  // Exclude the HRI text from the parent Group's getClientRect. This anchors
  // the resize at the bar top (logmars: was anchoring at text top above bars)
  // and keeps the Transformer's bbox tight around the bars, eliminating the
  // (h + textArea)*sy vs h*sy + textArea discrepancy during drag.
  const setTextRef = useCallback((node: Konva.Text | null) => {
    textRef.current = node;
    if (node) {
      node.getSelfRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
    }
  }, []);

  // Multi-text HRI variants (EAN/UPC digits) are wrapped in a Group whose
  // getClientRect is overridden to zero, so the parent barcode Group's
  // bbox collapses to the bar image only. Same intent as setTextRef but
  // applied at the group level: avoids threading the ref through 10+
  // individual Text components.
  const excludeGroupFromBbox = useCallback((node: Konva.Group | null) => {
    if (node) {
      node.getClientRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
    }
  }, []);

  const opts = buildBwipOptions(obj, scale, dpmm);
  let barcodeCanvas: HTMLCanvasElement | null = null;
  let errorMsg: string | null = null;
  if (opts) {
    const canvas = document.createElement("canvas");
    try {
      // buildBwipOptions returns Record<string, unknown> on purpose: the
      // option fields differ across barcode types (ean13 vs code128 vs …)
      // and per-type narrowing would duplicate the switch already in
      // buildBwipOptions. bwip-js' toCanvas signature uses a strict
      // literal-string union, so the structural cast bridges the two.
      bwipjs.toCanvas(canvas, opts as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
      barcodeCanvas = canvas;
    } catch (e) {
      errorMsg = cleanBwipError(e);
    }
  }

  // Single object holding the full ZPL footprint (w/h) and the bar
  // sub-rectangle (barW/barH/barLeftPx/barTopPx). Defaults zero out
  // when the bwip canvas hasn't rendered yet.
  const dim: BarcodeDisplaySize = barcodeCanvas
    ? getDisplaySize(obj, barcodeCanvas, scale, dpmm)
    : { w: 0, h: 0, barW: 0, barH: 0, barLeftPx: 0, barTopPx: 0,
        upright: { w: 0, h: 0, barW: 0, barH: 0, barLeftPx: 0, barTopPx: 0 } };

  // Y delta in dots between the FT baseline (bar bottom) and the bbox
  // top-left, plus the QR-specific firmware offset. Used forward in the
  // render path and inverted in the drag-end handler.
  //   FT-positioned: subtract this from FT.y to get bbox-top-Y
  //   FO-positioned: zero except for QR's +10-dot artifact
  // Computed once and reused so render and drag-end stay in lockstep.
  const ftYShiftDots = (() => {
    let d = 0;
    if (barcodeCanvas) {
      d += pxToDots(dim.barH, scale, dpmm);
    } else if (BARCODE_1D_TYPES.has(obj.type)) {
      d += (obj.props as { height: number }).height;
    }
    if (obj.type === "qrcode") {
      // Zebra firmware artifact: ^FT for QR shifts the symbol up by exactly
      // 3 modules (= 3 * magnification dots), independent of dpmm or content.
      // Verified against Labelary across magnifications 4–10 at 8 and 12 dpmm.
      // Leading theory: firmware reserves a dummy text-interpretation bbox
      // even though QR codes have no human-readable text.
      d += QR_FT_MODULE_OFFSET *
        (obj.props as { magnification: number }).magnification;
    }
    return d;
  })();

  // Zebra firmware artifact: ^FO QR codes render with a hardcoded +10-dot
  // Y-offset, independent of magnification and dpmm. Verified via Labelary.
  const foYShiftDots = obj.type === "qrcode" ? QR_FO_Y_OFFSET_DOTS : 0;

  const displayX = obj.x;
  const displayY = obj.positionType === "FT"
    ? obj.y - ftYShiftDots
    : obj.y + foYShiftDots;

  // Bars draw at FO; bbox top-left shifts by (-barLeftPx, -barTopPx)
  // when the text zone extends LEFT/ABOVE the bars (rotated EAN/UPC,
  // inverted EAN/UPC/LOGMARS). The Konva Group is positioned at bbox
  // top-left and KImage offsets back to land bars at FO.
  const x = offsetX + dotsToPx(displayX, scale, dpmm) - dim.barLeftPx;
  const y = offsetY + dotsToPx(displayY, scale, dpmm) - dim.barTopPx;

  const snapPos = (sx: number, sy: number) => ({
    x:
      offsetX +
      dotsToPx(snap(pxToDots(sx - offsetX, scale, dpmm)), scale, dpmm),
    y:
      offsetY +
      dotsToPx(snap(pxToDots(sy - offsetY, scale, dpmm)), scale, dpmm),
  });

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.position(snapPos(e.target.x(), e.target.y()));
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Inverse of the render-path math: Group origin is bbox top-left,
    // FO/FT semantics anchor at the bars, so we add back the bbox shift
    // (barLeftPx/barTopPx) before converting pixels to dots, then undo
    // the FT/FO Y-shift to recover the saved obj.x/obj.y.
    const finalX = pxToDots(
      e.target.x() + dim.barLeftPx - offsetX,
      scale,
      dpmm,
    );
    const yDots = pxToDots(
      e.target.y() + dim.barTopPx - offsetY,
      scale,
      dpmm,
    );
    const finalY = obj.positionType === "FT"
      ? yDots + ftYShiftDots
      : yDots - foYShiftDots;
    onChange({ x: finalX, y: finalY });
  };

  if (barcodeCanvas) {
    // Konva crop prop is undefined when no cropping is needed; passing it
    // selectively skips bwip's internal padding (e.g. GS1 DataBar's
    // paddingheight rows) so bars fill the bbox at firmware-correct height.
    const bitmapCrop = dim.bitmapCrop;
    // Force-off when the symbology has no HRI in ZPL (e.g. GS1 Databar) — the
    // canvas must match the print output even if a legacy saved object still
    // carries printInterpretation: true.
    const rotation = objectRotation(obj.props);
    const isUpright = rotation === "N";
    const printInterpEnabled =
      !ObjectRegistry[obj.type]?.interpretationLocked &&
      !!(obj.props as { printInterpretation?: boolean }).printInterpretation;
    // Cross-type access: this block runs for every barcode and reads moduleWidth
    // generically (textFontSize is computed for HRI text rendering downstream).
    // Unlike buildBwipOptions, this function isn't switch-structured by obj.type,
    // so per-case narrowing would require restructuring the whole block. The
    // cast + fallback stays as the documented boundary between cross-type code
    // and the per-type required-typed schemas (2D types without moduleWidth fall
    // through with the default; their branches don't render HRI text anyway).
    const moduleWidth =
      (obj.props as { moduleWidth?: number }).moduleWidth ?? 2;
    const textFontSize = Math.max(dotsToPx(moduleWidth * 10, scale, dpmm), 6);
    const textGap = Math.max(dotsToPx(5, scale, dpmm), 3);
    const rawContent = (obj.props as { content?: string }).content ?? "";

    // HRI behaviour comes from the registry — per-type formatHri /
    // textAbove / aboveGapDots. Defaults: raw content, below bars,
    // textGap. Keeps BarcodeObject type-agnostic for the generic 1D
    // HRI path; EAN/UPC multi-digit-split branches below consume the
    // same formatHri output (displayText) as the source string.
    const hri = ObjectRegistry[obj.type]?.hri;
    const displayText = hri?.formatHri?.(rawContent) ?? rawContent;
    const isTextAbove = hri?.textAbove ?? false;
    // 3px floor matches textGap so HRI stays legible at very small
    // scales regardless of which dots value the spec calls for.
    const aboveGapPx = hri?.aboveGapDots !== undefined
      ? Math.max(dotsToPx(hri.aboveGapDots, scale, dpmm), 3)
      : textGap;

    // ── 1D barcode with HRI overlay (all 4 rotations, both EAN/UPC and
    //    Other 1D). Text overlay always lives in upright bbox-relative
    //    coords inside an inner rotated Group; the Group's transform
    //    handles every R/I/B placement. Upright EAN/UPC additionally
    //    needs clip-expansion on the outer Group so the floated
    //    sys/trail digits stay visible (their x extends past the
    //    bar bbox); rotated EAN/UPC gets no clipping because the
    //    floated digits land within the rotated bbox after Konva's
    //    bbox computation. Upright Other 1D additionally counter-
    //    scales the HRI text during a resize drag so it stays at
    //    constant visual size while the bars stretch.
    const isEanUpc = EAN_UPC_TYPES.has(obj.type);
    const showHriOverlay =
      printInterpEnabled && BARCODE_1D_TYPES.has(obj.type);
    const isUprightEanUpc = isUpright && isEanUpc;

    if (showHriOverlay) {
      const ub = dim.upright;
      // Inner Group covers the full upright bbox so KImage + text both
      // live inside it at upright bbox-relative coords. The Group's
      // transform handles all R/I/B placement.
      const innerTr = rotatedGroupTransform(rotation, ub.w, ub.h);

      // Build text overlay content in upright bbox-relative coords.
      // Upright EAN/UPC also needs clip extents to keep the floated
      // sys/trail digits visible past the bar bbox; the helper returns
      // them alongside the digit nodes, gated by isUprightEanUpc at
      // the parent Group below.
      let overlayContent: React.ReactNode;
      let eanOverlay: ReturnType<typeof buildEanUpcDigitOverlay> | null = null;
      if (isEanUpc) {
        const bwipSc = get1DBwipScale(moduleWidth, scale, dpmm);
        const layout = getEanUpcLayout(obj.type as EanUpcType, ub.w, barcodeCanvas.width, bwipSc);
        eanOverlay = buildEanUpcDigitOverlay({
          type: obj.type as EanUpcType,
          displayText,
          layout,
          uprightBarW: ub.barW,
          uprightBarH: ub.barH,
          textGap,
          textFontSize,
        });
        // EAN/UPC have barTopPx === 0 (no text zone above), so the
        // helper's bar-relative textY equals the bbox-relative one
        // here — render directly without an offset wrapper.
        overlayContent = eanOverlay.nodes;
      } else {
        // Other 1D: single centered text. textRef is wired only for the
        // upright case so handleTransform/End can counter-scale it; for
        // rotated paths the counter-scale math doesn't apply (would
        // scale along upright-Y which after R/B is screen-X), so the
        // ref stays undefined and the bars+text just scale together
        // during a rotated resize drag — minor visual nit, no broken
        // print output.
        const textY = isTextAbove
          ? ub.barTopPx - textFontSize - aboveGapPx
          : ub.barTopPx + ub.barH + textGap;
        overlayContent = (
          <Text
            ref={isUpright ? setTextRef : undefined}
            x={ub.barLeftPx} y={textY} width={Math.max(ub.barW, 1)}
            text={displayText} fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center" wrap="none" fill="#000000" listening={false}
          />
        );
      }

      // Counter-scale only applies to upright Other 1D. textLocalY here
      // returns the position in inner-Group local coords (bbox-relative
      // upright). For above-bars (logmars): barTopPx - (font+gap)/sy.
      // For below: barTopPx + barH + gap/sy.
      const useUprightTransform = isUpright && !isEanUpc;
      const textLocalY = (sy: number) =>
        isTextAbove
          ? ub.barTopPx - (textFontSize + aboveGapPx) / sy
          : ub.barTopPx + ub.barH + textGap / sy;
      const handleTransform = () => {
        const grp = groupRef.current;
        const txt = textRef.current;
        if (!grp || !txt) return;
        const sy = grp.scaleY();
        if (sy <= 0) return;
        txt.scaleY(1 / sy);
        txt.y(textLocalY(sy));
      };
      // react-konva does not track imperatively-set scaleY/y; reset
      // both so the next drag starts clean. For logmars the JSX y is a
      // constant non-zero value, so without explicit reset react-konva
      // would not re-apply it on the post-commit render.
      const handleTransformEnd = () => {
        const txt = textRef.current;
        if (!txt) return;
        txt.scaleY(1);
        txt.y(textLocalY(1));
      };

      // Clip-expansion is upright-EAN/UPC only; absent on other paths
      // so Konva computes a natural bbox. Spread-or-empty keeps the
      // JSX free of four parallel ternaries.
      const clipProps = isUprightEanUpc && eanOverlay
        ? {
            clipX: -eanOverlay.clipLeft,
            clipY: 0,
            clipWidth: Math.max(ub.w, 1) + eanOverlay.clipLeft + eanOverlay.clipRight,
            clipHeight: Math.max(ub.h, 1) + textFontSize + textGap,
          }
        : {};

      return (
        <Group
          ref={useUprightTransform ? groupRef : undefined}
          id={obj.id}
          x={x}
          y={y}
          {...clipProps}
          draggable={!obj.locked}
          {...selectionHandlers(onSelect)}
          onDragMove={(e) => e.target.position(snapPos(e.target.x(), e.target.y()))}
          onDragEnd={handleDragEnd}
          onTransform={useUprightTransform ? handleTransform : undefined}
          onTransformEnd={useUprightTransform ? handleTransformEnd : undefined}
        >
          <Group x={innerTr.x} y={innerTr.y} rotation={innerTr.rotation}>
            <KImage
              x={ub.barLeftPx}
              y={ub.barTopPx}
              image={barcodeCanvas}
              crop={bitmapCrop}
              width={ub.barW}
              height={ub.barH}
              imageSmoothingEnabled={false}
              stroke={isSelected ? colors.selection : undefined}
              strokeWidth={isSelected ? 2 : 0}
              strokeScaleEnabled={false}
            />
            <Group ref={excludeGroupFromBbox}>{overlayContent}</Group>
          </Group>
        </Group>
      );
    }

    // Default path: 2D barcodes + 1D without HRI. bwip renders upright,
    // the inner Group's rotated transform handles R/I/B placement.
    const ub = dim.upright;
    const defaultInnerTr = rotatedGroupTransform(rotation, ub.w, ub.h);
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
        <Group x={defaultInnerTr.x} y={defaultInnerTr.y} rotation={defaultInnerTr.rotation}>
          <KImage
            x={ub.barLeftPx}
            y={ub.barTopPx}
            image={barcodeCanvas}
            crop={bitmapCrop}
            width={ub.barW}
            height={ub.barH}
            imageSmoothingEnabled={false}
            stroke={isSelected ? colors.selection : undefined}
            strokeWidth={isSelected ? 2 : 0}
            strokeScaleEnabled={false}
          />
        </Group>
      </Group>
    );
  }

  // Fallback placeholder (error or not yet rendered)
  const fbW = dotsToPx(200, scale, dpmm);
  const fbH = dotsToPx(80, scale, dpmm);
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
        width={fbW}
        height={fbH}
        fill="#f9fafb"
        stroke={isSelected ? colors.selection : "#9ca3af"}
        strokeWidth={isSelected ? 2 : 1}
        dash={isSelected ? undefined : [4, 2]}
      />
      <Text
        x={6}
        y={6}
        width={fbW - 12}
        height={fbH - 12}
        wrap="word"
        ellipsis
        text={errorMsg ? `⚠ ${errorMsg}` : obj.type}
        fontSize={Math.max(dotsToPx(10, scale, dpmm), 8)}
        fill={errorMsg ? "#b91c1c" : "#374151"}
      />
    </Group>
  );
}
