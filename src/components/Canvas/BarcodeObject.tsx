import React, { useCallback, useRef } from "react";
import bwipjs from "bwip-js/browser";
import { Image as KImage, Group, Rect, Text } from "react-konva";
import type Konva from "konva";
import { BARCODE_1D_TYPES, ObjectRegistry } from "../../registry";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { useColorScheme } from "../../lib/useColorScheme";
import { useFontCacheVersion } from "../../hooks/useFontCacheVersion";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";
import {
  buildBwipOptions,
  cleanBwipError,
  getDisplaySize,
  get1DBwipScale,
  getEanUpcHriFragments,
  renderEanUpcRawCanvas,
  renderTlc39Canvas,
  type BarcodeDisplaySize,
  type EanUpcType,
} from "./bwipHelpers";
import { objectRotation } from "../../registry/rotation";
import { rotatedGroupTransform } from "./rotatedGroupTransform";
import { buildEanUpcDigitOverlay } from "./eanUpcDigitNodes";
import { buildCode1dStartStopGlyphs } from "./code1dHriOverlay";
import {
  VERA_MONO_HRI_EM_PER_MODULE,
  VERA_MONO_HRI_CAP_TOP_PAD,
  HRI_FONT_A,
  eanUpcHriFontFamily,
  ocrbEanHriFontDots,
  ocrbEanHriGapDots,
  EAN_TEXT_ZONE_DOTS,
  EAN_UPC_TYPES,
  QR_FO_Y_OFFSET_DOTS,
  QR_FT_MODULE_OFFSET,
} from "./bwipConstants";

/** Resolve a registry value that may be a constant or a function of
 *  moduleWidth. Mirrors the pattern formatHri uses for content. */
function resolveMwValue<T>(
  v: T | ((moduleWidth: number) => T) | undefined,
  moduleWidth: number,
): T | undefined {
  return typeof v === "function"
    ? (v as (mw: number) => T)(moduleWidth)
    : v;
}

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
  // Vera Mono (HRI) loads async; Konva won't repaint on an unchanged
  // fontFamily once the FontFace resolves. Keying the overlay on this
  // version remounts it on `loadingdone` for a fresh paint.
  const fontVersion = useFontCacheVersion();

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

  // Cross-type props read once so the canvas builder and the HRI overlay
  // share one source of truth. Single-field casts at the boundary instead
  // of switch-narrowing keep the cross-type read flat (2D types without
  // moduleWidth fall through with the default; their branches don't
  // render HRI text anyway).
  const moduleWidth =
    (obj.props as { moduleWidth?: number }).moduleWidth ?? 2;
  const rawContent = (obj.props as { content?: string }).content ?? "";
  const printInterpEnabled =
    !ObjectRegistry[obj.type]?.interpretationLocked &&
    !!(obj.props as { printInterpretation?: boolean }).printInterpretation;

  let barcodeCanvas: HTMLCanvasElement | null = null;
  let errorMsg: string | null = null;
  if (obj.type === "tlc39") {
    // bwip-js has no native tlc39 encoder, render the Code 39 + MicroPDF417
    // composite ourselves. Goes straight to canvas, bypassing buildBwipOptions.
    barcodeCanvas = renderTlc39Canvas(obj.props, scale, dpmm);
    if (!barcodeCanvas) errorMsg = "TLC39 render failed";
  } else if (EAN_UPC_TYPES.has(obj.type)) {
    // EAN/UPC use bwip.raw + own fillRect pass so guard tails extend in
    // the same canvas as the bars (no overlay seam). The 13-dot text
    // zone is always reserved on the canvas so the KImage dimensions
    // stay constant; the tails only get drawn when HRI is on.
    const eanHeight = (obj.props as { height: number }).height;
    const modulePxInt = get1DBwipScale(moduleWidth, scale, dpmm);
    const barHeightPx = dotsToPx(eanHeight, scale, dpmm);
    const tailHeightPx = dotsToPx(EAN_TEXT_ZONE_DOTS, scale, dpmm);
    barcodeCanvas = renderEanUpcRawCanvas({
      type: obj.type as EanUpcType,
      text: rawContent,
      modulePxInt,
      barHeightPx,
      tailHeightPx,
      extendGuards: printInterpEnabled,
    });
    if (!barcodeCanvas) errorMsg = "EAN/UPC encode failed";
  } else {
    const opts = buildBwipOptions(obj, scale, dpmm);
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
    // Force-off when the symbology has no HRI in ZPL (e.g. GS1 Databar); the
    // canvas must match the print output even if a legacy saved object still
    // carries printInterpretation: true.
    const rotation = objectRotation(obj.props);
    const isUpright = rotation === "N";
    // Generic 1D bar-to-HRI gap (bar bottom to glyph cap top). Labelary's
    // is a module-independent ~6 dots; 5 sits a hair tighter.
    const textGap = Math.max(dotsToPx(5, scale, dpmm), 3);

    const hri = ObjectRegistry[obj.type]?.hri;
    // fontDots returns em font dots directly (^BS: OCR-B step table);
    // the per-module fallback is em-calibrated for Vera Font A.
    const fontDots = hri?.fontDots
      ? hri.fontDots(moduleWidth)
      : moduleWidth * VERA_MONO_HRI_EM_PER_MODULE;
    const textFontSize = Math.max(dotsToPx(fontDots, scale, dpmm), 6);
    // Generic 1D subtracts this below the bars so the visible bar-to-cap gap
    // equals textGap and stays module-width-independent (see the constant).
    const glyphTopPad = textFontSize * VERA_MONO_HRI_CAP_TOP_PAD;
    const checkDigit = (obj.props as { checkDigit?: boolean }).checkDigit;
    const displayText = hri?.formatHri?.(rawContent, checkDigit) ?? rawContent;
    const isTextAbove = hri?.textAbove ?? false;
    // 3px floor matches textGap so HRI stays legible at very small
    // scales regardless of which dots value the spec calls for.
    const gapDots = resolveMwValue(hri?.aboveGapDots, moduleWidth);
    const aboveGapPx = gapDots !== undefined
      ? Math.max(dotsToPx(gapDots, scale, dpmm), 3)
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
        // Display px per encoded module = bar width / module count, where
        // the bwip canvas is moduleCount * renderScale px wide.
        const renderScale = get1DBwipScale(moduleWidth, scale, dpmm);
        const moduleCount = Math.max(barcodeCanvas.width / renderScale, 1);
        const modulePx = ub.barW / moduleCount;
        // OCR-B HRI: discrete font + gap per module width (caps, then
        // doubles), unlike the generic Vera linear sizing above.
        const eanFontSize = Math.max(dotsToPx(ocrbEanHriFontDots(moduleWidth), scale, dpmm), 6);
        const eanGap = Math.max(dotsToPx(ocrbEanHriGapDots(moduleWidth), scale, dpmm), 3);
        eanOverlay = buildEanUpcDigitOverlay({
          fragments: getEanUpcHriFragments(obj.type as EanUpcType, displayText),
          modulePx,
          uprightBarW: ub.barW,
          uprightBarH: ub.barH,
          textGap: eanGap,
          textFontSize: eanFontSize,
          fontFamily: eanUpcHriFontFamily(moduleWidth),
        });
        // EAN/UPC have barTopPx === 0 (no text zone above), so the
        // helper's bar-relative textY equals the bbox-relative one
        // here; render directly without an offset wrapper.
        overlayContent = eanOverlay.nodes;
      } else {
        // Other 1D: single centered text. textRef is wired only for the
        // upright case so handleTransform/End can counter-scale it; for
        // rotated paths the counter-scale math doesn't apply (would
        // scale along upright-Y which after R/B is screen-X), so the
        // ref stays undefined and the bars+text just scale together
        // during a rotated resize drag, a minor visual nit with no broken
        // print output.
        const fontFamily =
          resolveMwValue(hri?.fontFamily, moduleWidth) ?? HRI_FONT_A;
        const textY = isTextAbove
          ? ub.barTopPx - textFontSize - aboveGapPx
          : ub.barTopPx + ub.barH + textGap - glyphTopPad;
        // ^BS bottom-aligns the glyph in a fontSize-tall box so the baseline
        // sits a gap above the bars, matching the EAN overlay.
        const bottomAlign = hri?.fontDots
          ? { height: textFontSize, verticalAlign: "bottom" as const }
          : {};
        // Code 11/93: keep the centered text as-is and only add the shape
        // start/stop glyphs flanking it (Code 11 triangle, Code 93 square).
        const startStopGlyphs = hri?.startStopGlyph
          ? buildCode1dStartStopGlyphs({
              text: displayText, fontFamily, fontSize: textFontSize,
              barLeftPx: ub.barLeftPx, barW: ub.barW, textY,
              glyph: hri.startStopGlyph,
            })
          : null;
        // Keyed array (like the EAN path), not a fragment: a keyless data
        // Text adjacent to keyed start/stop Text nodes of the same type makes
        // react-konva mis-reconcile and drop the flanking ones (Code 39 *).
        const dataText = (
          <Text
            key="hri"
            ref={isUpright ? setTextRef : undefined}
            x={ub.barLeftPx} y={textY} width={Math.max(ub.barW, 1)}
            text={displayText} fontSize={textFontSize}
            fontFamily={fontFamily}
            align="center" wrap="none" fill="#000000" listening={false}
            {...bottomAlign}
          />
        );
        overlayContent = startStopGlyphs ? [dataText, ...startStopGlyphs] : dataText;
      }

      // Counter-scale only applies to upright Other 1D. textLocalY here
      // returns the position in inner-Group local coords (bbox-relative
      // upright). For above-bars (logmars): barTopPx - (font+gap)/sy.
      // For below: barTopPx + barH + gap/sy.
      const useUprightTransform = isUpright && !isEanUpc;
      const textLocalY = (sy: number) =>
        isTextAbove
          ? ub.barTopPx - (textFontSize + aboveGapPx) / sy
          : ub.barTopPx + ub.barH + (textGap - glyphTopPad) / sy;
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

      // Clip-expansion is upright-EAN/UPC only, absent on other paths
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
              height={isEanUpc
                ? ub.barH + dotsToPx(EAN_TEXT_ZONE_DOTS, scale, dpmm)
                : ub.barH}
              // Clip Transformer bbox to the bar area so resize handles
              // ignore the guard tails.
              ref={isEanUpc ? (node) => {
                if (node) {
                  const w = ub.barW;
                  const h = ub.barH;
                  node.getSelfRect = () => ({ x: 0, y: 0, width: w, height: h });
                }
              } : undefined}
              imageSmoothingEnabled={false}
              // EAN/UPC draws its selection stroke as the Rect below so
              // the highlight skips the guard tails.
              stroke={!isEanUpc && isSelected ? colors.selection : undefined}
              strokeWidth={!isEanUpc && isSelected ? 2 : 0}
              strokeScaleEnabled={false}
            />
            {isEanUpc && isSelected && (
              <Rect
                x={ub.barLeftPx}
                y={ub.barTopPx}
                width={ub.barW}
                height={ub.barH}
                stroke={colors.selection}
                strokeWidth={2}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            <Group key={`hri-${fontVersion}`} ref={excludeGroupFromBbox}>{overlayContent}</Group>
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
