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
  getDisplaySize,
  getRotatedTextAnchor,
  get1DBwipScale,
  getEanUpcLayout,
  type BarcodeDisplaySize,
  type EanUpcType,
} from "./bwipHelpers";
import { objectRotation } from "../../registry/rotation";
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
      const raw = e instanceof Error ? e.message : String(e);
      // bwip-js prefixes its errors like `bwip-js: bwipp.code39badCharacter: ...`
      // Strip the library/identifier head so the placeholder shows only the
      // human-readable reason.
      errorMsg = raw.replace(/^bwip-js:\s*/i, '').replace(/^bwipp\.[^:]+:\s*/i, '');
    }
  }

  // Single object holding the full ZPL footprint (w/h) and the bar
  // sub-rectangle (barW/barH/barLeftPx/barTopPx). Defaults zero out
  // when the bwip canvas hasn't rendered yet.
  const dim: BarcodeDisplaySize = barcodeCanvas
    ? getDisplaySize(obj, barcodeCanvas, scale, dpmm)
    : { w: 0, h: 0, barW: 0, barH: 0, barLeftPx: 0, barTopPx: 0 };

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
    const w = dim.w;
    const h = dim.h;
    // Bitmap is drawn at the bar sub-rectangle of the bbox so the bars
    // render at their true height. The text-zone padding (which side
    // depends on rotation) stays empty inside the bbox.
    const bw = Math.max(dim.barW, 1);
    const bh = Math.max(dim.barH, 1);
    const btX = dim.barLeftPx;
    const btY = dim.barTopPx;
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
    const printInterp = isUpright && printInterpEnabled;
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

    // ── EAN/UPC: manually-positioned digit labels ─────────────────────────
    if (EAN_UPC_TYPES.has(obj.type) && printInterp) {
      const bwipSc = get1DBwipScale(moduleWidth, scale, dpmm);
      const layout = getEanUpcLayout(
        obj.type as EanUpcType,
        w,
        barcodeCanvas.width,
        bwipSc,
      );
      const ldW = textFontSize * 1.2; // width reserved for leading/trailing digit

      let textNodes: React.ReactNode[] = [];
      let clipLeft = 0;
      let clipRight = 0;

      if (obj.type === "ean13") {
        // 13-digit string formatted by registry's formatEan13Hri (includes check digit).
        const allDigits = displayText;

        const { xLeft: xLeft13, xRight: xRight13, halfWidth: halfW13 } = layout;

        const textY = Math.max(bh, 1) + textGap;
        clipLeft = ldW;
        textNodes = [
          <Text
            key="d0"
            x={-ldW}
            y={textY}
            width={ldW}
            text={allDigits[0]}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          <Text
            key="dl"
            x={xLeft13}
            y={textY}
            width={halfW13}
            text={allDigits.slice(1, 7)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          <Text
            key="dr"
            x={xRight13}
            y={textY}
            width={halfW13}
            text={allDigits.slice(7, 13)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      } else if (obj.type === "ean8") {
        // 8-digit string formatted by registry's formatEan8Hri.
        const allDigits = displayText;

        const { xLeft: xLeft8, xRight: xRight8, halfWidth: halfW8 } = layout;

        const textY = Math.max(bh, 1) + textGap;
        textNodes = [
          <Text
            key="dl"
            x={xLeft8}
            y={textY}
            width={halfW8}
            text={allDigits.slice(0, 4)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          <Text
            key="dr"
            x={xRight8}
            y={textY}
            width={halfW8}
            text={allDigits.slice(4, 8)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      } else if (obj.type === "upca") {
        // 12-digit string formatted by registry's formatUpcaHri.
        const allDigits = displayText;

        const { xLeft: xLeftUpca, xRight: xRightUpca, halfWidth: halfUpca } =
          layout;

        const textY = Math.max(bh, 1) + textGap;
        clipLeft = ldW;
        textNodes = [
          // number system digit — floated left of barcode image
          <Text
            key="d0"
            x={-ldW}
            y={textY}
            width={ldW}
            text={allDigits[0]}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          // left 5 digits
          <Text
            key="dl"
            x={xLeftUpca}
            y={textY}
            width={halfUpca}
            text={allDigits.slice(1, 6)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          // right 5 digits
          <Text
            key="dr"
            x={xRightUpca}
            y={textY}
            width={halfUpca}
            text={allDigits.slice(6, 11)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      } else if (obj.type === "upce") {
        // displayText = "0" + 6 data digits + check digit (8 chars total),
        // formatted by registry's formatUpceHri.
        const digits6 = displayText.slice(1, 7);
        const checkDigit = displayText[7] ?? "";

        // UPC-E: 6 digits centered over the data area (modules 3–44 of 51)
        const { xLeft: xMid, halfWidth: midW } = layout;
        const textY = Math.max(bh, 1) + textGap;
        clipLeft = ldW;
        clipRight = ldW;
        textNodes = [
          <Text
            key="d0"
            x={-ldW}
            y={textY}
            width={ldW}
            text="0"
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          <Text
            key="dm"
            x={xMid}
            y={textY}
            width={midW}
            text={digits6}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
          <Text
            key="dc"
            x={w + 2}
            y={textY}
            width={ldW}
            text={checkDigit}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="left"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      }

      return (
        <Group
          id={obj.id}
          x={x}
          y={y}
          clipX={-clipLeft}
          clipY={0}
          clipWidth={Math.max(w, 1) + clipLeft + clipRight}
          clipHeight={Math.max(h, 1) + textFontSize + textGap}
          draggable={!obj.locked}
          {...selectionHandlers(onSelect)}
          onDragMove={(e) =>
            e.target.position(snapPos(e.target.x(), e.target.y()))
          }
          onDragEnd={handleDragEnd}
        >
          <KImage
            x={btX}
            y={btY}
            image={barcodeCanvas}
            crop={bitmapCrop}
            width={bw}
            height={bh}
            imageSmoothingEnabled={false}
            stroke={isSelected ? colors.selection : undefined}
            strokeWidth={isSelected ? 2 : 0}
            strokeScaleEnabled={false}
          />
          {textNodes.length > 0 && <Group ref={excludeGroupFromBbox}>{textNodes}</Group>}
        </Group>
      );
    }

    // ── Other 1D: separate Konva Text below (or above) the bars ──────────
    const showText =
      BARCODE_1D_TYPES.has(obj.type) &&
      printInterp;
    // Rotated 1D: text overlay rotated to match the barcode orientation.
    const showRotatedText =
      !isUpright &&
      printInterpEnabled &&
      BARCODE_1D_TYPES.has(obj.type);

    if (showText) {
      // LOGMARS renders the human-readable line above the bars (per spec).
      // ^FO Y refers to the bar top, so text is drawn at negative y to extend
      // above the group origin into the visual zone above the bars.
      const aboveGap = aboveGapPx;
      // Local y for the HRI text. The /sy form keeps a constant *visual* offset
      // when the group is being scaled (sy = 1 at rest, ≠ 1 during a drag).
      // Anchor against the BAR top (btY) for text-above, not the group
      // origin: when the firmware reserves a text zone above the bars
      // (logmars: 20 dots, ^BS f=Y: 18 dots) the group origin sits
      // text-zone above the bar top, and ignoring btY pushes the text
      // a full text-zone above where it should sit.
      const textLocalY = (sy: number) =>
        isTextAbove
          ? btY - (textFontSize + aboveGap) / sy
          : Math.max(bh, 1) + textGap / sy;
      const txtY = textLocalY(1);

      // Counter-scale the text so it stays at constant pixel size while the
      // bars stretch with the parent group's scaleY during a resize drag.
      const handleTransform = () => {
        const grp = groupRef.current;
        const txt = textRef.current;
        if (!grp || !txt) return;
        const sy = grp.scaleY();
        if (sy <= 0) return;
        txt.scaleY(1 / sy);
        txt.y(textLocalY(sy));
      };

      // react-konva does not track imperatively-set scaleY/y. Reset both here
      // so the next drag starts clean. For logmars the JSX y is constant, so
      // without an explicit reset react-konva would not re-apply it on the
      // post-commit render and the text would stay at its last drag-time y.
      const handleTransformEnd = () => {
        const txt = textRef.current;
        if (!txt) return;
        txt.scaleY(1);
        txt.y(txtY);
      };

      return (
        <Group
          ref={groupRef}
          id={obj.id}
          x={x}
          y={y}
          draggable={!obj.locked}
          {...selectionHandlers(onSelect)}
          onDragMove={(e) =>
            e.target.position(snapPos(e.target.x(), e.target.y()))
          }
          onDragEnd={handleDragEnd}
          onTransform={handleTransform}
          onTransformEnd={handleTransformEnd}
        >
          {/* No invisible footprint rect: bbox shrinks to the bars (HRI
              Text node has getSelfRect=0 already). The firmware text-zone
              reservation stays implicit — it only matters for print
              output, not for canvas selection / smart-align, where the
              user expects the visual focus to sit on the bars. */}
          <KImage
            x={btX}
            y={btY}
            image={barcodeCanvas}
            crop={bitmapCrop}
            width={bw}
            height={bh}
            imageSmoothingEnabled={false}
            stroke={isSelected ? colors.selection : undefined}
            strokeWidth={isSelected ? 2 : 0}
            strokeScaleEnabled={false}
          />
          <Text
            ref={setTextRef}
            x={0}
            y={txtY}
            width={Math.max(w, 1)}
            text={displayText}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />
        </Group>
      );
    }

    // ── Rotated 1D: text overlay rotated alongside the bars ──────────────
    if (showRotatedText) {
      // Rotation math (Konva y-down, CW positive):
      //   R  (rot=90):  local-x→screen-down, local-y→screen-left
      //   B  (rot=-90): local-x→screen-up,   local-y→screen-right
      //   I  (rot=180): local-x→screen-left,  local-y→screen-up
      //
      // Text "side" for 90°/270°: standard 1D text is below bars in upright,
      //   so after 90°CW it's on the LEFT; after 270°CW on the RIGHT.
      //   LOGMARS is mirrored (text above in upright → right for 90°, left for 270°).
      // isTextAbove and rotGap come from the registry (same source as
      // upright above) — keeps rotated and N visually consistent per
      // type without duplicating the per-type chain.
      const rotGap = aboveGapPx;
      // x/y anchor for the rotated text. Helper anchors against the bar
      // sub-rectangle, not the bbox edge — without that the firmware
      // text-zone (EAN/UPC: 13 dots, logmars: 20 dots) is added to the
      // gap and the text drifts that many dots away from the bars.
      // sideX is the R/B x-anchor (and the I tx for sysNode/trailNode);
      // topY is the I y-anchor (replaces -textGap for I).
      const { sideX, topY } = getRotatedTextAnchor(
        rotation,
        isTextAbove,
        dim,
        rotGap,
        textFontSize,
      );
      const tRot = rotation === "R" ? 90 : rotation === "I" ? 180 : -90;

      // ── EAN/UPC: reproduce upright digit layout along the rotated axis ──
      let textElements: React.ReactNode;
      if (EAN_UPC_TYPES.has(obj.type)) {
        const bwipSc = get1DBwipScale(moduleWidth, scale, dpmm);
        // For I: encoding runs horizontally (canvas.width); for R/B: vertically (canvas.height)
        const encDisplay = rotation === "I" ? w : h;
        const encCanvas  = rotation === "I" ? barcodeCanvas.width : barcodeCanvas.height;
        const layout = getEanUpcLayout(obj.type as EanUpcType, encDisplay, encCanvas, bwipSc);
        const { xLeft, xRight, halfWidth: halfW } = layout;
        const ldW = textFontSize * 1.2;

        const tStyle = {
          fontSize: textFontSize,
          fontFamily: "'Courier New', monospace" as const,
          fontStyle: "bold" as const,
          wrap: "none" as const,
          fill: "#000000",
          listening: false,
        };

        // Position a text node at `encPos` from barcode start, spanning `size`.
        // For R: encPos → screen-y downward from top (start=top).
        // For B: encPos → screen-y upward from bottom (start=bottom), anchor = h - encPos.
        // For I: encPos → screen-x leftward from right (start=right), anchor-x = w - encPos.
        const node = (key: string, encPos: number, size: number, text: string) => {
          const tx = rotation === "I" ? w - encPos : sideX;
          const ty = rotation === "R" ? encPos : rotation === "B" ? h - encPos : topY;
          return <Text key={key} x={tx} y={ty} rotation={tRot} width={Math.max(size, 1)} text={text} align="center" {...tStyle} />;
        };

        // Single digit floated BEFORE barcode start (outside the quiet zone).
        const sysNode = (key: string, text: string) => {
          // R: above top (y=-ldW); B: below bottom (y=h+ldW); I: right of barcode (x=w+ldW).
          const tx = rotation === "I" ? w + ldW : sideX;
          const ty = rotation === "R" ? -ldW : rotation === "B" ? h + ldW : topY;
          return <Text key={key} x={tx} y={ty} rotation={tRot} width={Math.max(ldW, 1)} text={text} align="center" {...tStyle} />;
        };

        // Single digit floated AFTER barcode end (UPC-A/UPC-E check digit).
        const trailNode = (key: string, text: string) => {
          // R: below bottom (y≈encDisplay); B: above top (y≈h-encDisplay); I: left of x=0.
          const tx = rotation === "I" ? -ldW : sideX;
          const ty = rotation === "R" ? encDisplay : rotation === "B" ? h - encDisplay : topY;
          return <Text key={key} x={tx} y={ty} rotation={tRot} width={Math.max(ldW, 1)} text={text} align="left" {...tStyle} />;
        };

        // All EAN/UPC HRI strings are formatted by the registry's
        // formatHri (displayText). The split positions differ per type
        // but the source string is the same as the upright branch.
        if (obj.type === "ean13") {
          textElements = [
            sysNode("sys", displayText[0] ?? ""),
            node("left", xLeft, halfW, displayText.slice(1, 7)),
            node("right", xRight, halfW, displayText.slice(7, 13)),
          ];
        } else if (obj.type === "ean8") {
          textElements = [
            node("left", xLeft, halfW, displayText.slice(0, 4)),
            node("right", xRight, halfW, displayText.slice(4, 8)),
          ];
        } else if (obj.type === "upca") {
          textElements = [
            sysNode("sys", displayText[0] ?? ""),
            node("left", xLeft, halfW, displayText.slice(1, 6)),
            node("right", xRight, halfW, displayText.slice(6, 11)),
          ];
        } else if (obj.type === "upce") {
          // displayText = "0" + 6 data digits + check digit (8 chars).
          textElements = [
            sysNode("sys", displayText[0] ?? "0"),
            node("mid", xLeft, halfW, displayText.slice(1, 7)),
            trailNode("trail", displayText[7] ?? ""),
          ];
        }
      } else {
        // ── Other 1D: single centered text string ──────────────────────────
        let txtX: number;
        let txtY: number;
        let txtWidth: number;

        if (rotation === "R") {
          txtX = sideX; txtY = 0; txtWidth = h;
        } else if (rotation === "I") {
          txtX = w; txtY = topY; txtWidth = w;
        } else {
          txtX = sideX; txtY = h; txtWidth = h;
        }

        textElements = (
          <Text
            x={txtX} y={txtY} rotation={tRot} width={Math.max(txtWidth, 1)}
            text={displayText} fontSize={textFontSize}
            fontFamily="'Courier New', monospace" fontStyle="bold"
            align="center" wrap="none" fill="#000000" listening={false}
          />
        );
      }

      return (
        <Group
          id={obj.id} x={x} y={y} draggable
          {...selectionHandlers(onSelect)}
          onDragMove={(e) => e.target.position(snapPos(e.target.x(), e.target.y()))}
          onDragEnd={handleDragEnd}
        >
          <KImage x={btX} y={btY} image={barcodeCanvas} crop={bitmapCrop}
            width={bw} height={bh}
            imageSmoothingEnabled={false}
            stroke={isSelected ? colors.selection : undefined}
            strokeWidth={isSelected ? 2 : 0}
            strokeScaleEnabled={false}
          />
          {textElements && (
            <Group ref={excludeGroupFromBbox}>{textElements}</Group>
          )}
        </Group>
      );
    }

    // Default path. Wrapped in a Group so the bbox spans the full footprint
    // (including any text zone reserved by firmware) while the bitmap
    // renders only at the bar sub-rectangle. An invisible Rect at the full
    // bbox dimensions keeps Group.getClientRect aligned with displayH even
    // when btY > 0 or bh < h.
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
        <KImage
          x={btX}
          y={btY}
          image={barcodeCanvas}
          crop={bitmapCrop}
          width={bw}
          height={bh}
          imageSmoothingEnabled={false}
          stroke={isSelected ? colors.selection : undefined}
          strokeWidth={isSelected ? 2 : 0}
          strokeScaleEnabled={false}
        />
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
