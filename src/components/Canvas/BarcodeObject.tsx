import React, { useCallback, useRef } from "react";
import bwipjs from "bwip-js/browser";
import { Image as KImage, Group, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { LabelObject } from "../../registry";
import { BARCODE_1D_TYPES, ObjectRegistry } from "../../registry";
import type { ObjectChanges } from "../../store/labelStore";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import {
  buildBwipOptions,
  getDisplaySize,
  eanCheckDigit,
  upceCheckDigit,
  get1DBwipScale,
  getEanUpcLayout,
  type EanUpcType,
} from "./bwipHelpers";
import { objectRotation } from "../../registry/rotation";
import {
  QR_FO_Y_OFFSET_DOTS,
  QR_FT_MODULE_OFFSET,
  LOGMARS_TEXT_ABOVE_GAP_DOTS,
  EAN_UPC_TYPES,
} from "./bwipConstants";

interface Props {
  obj: LabelObject;
  scale: number;
  dpmm: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: (addToSelection: boolean) => void;
  onChange: (changes: ObjectChanges) => void;
  snap: (dots: number) => number;
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
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const textRef = useRef<Konva.Text>(null);

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

  const opts = buildBwipOptions(obj, scale, dpmm);
  let barcodeCanvas: HTMLCanvasElement | null = null;
  let errorMsg: string | null = null;
  if (opts) {
    const canvas = document.createElement("canvas");
    try {
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

  let displayW = 0;
  let displayH = 0;
  if (barcodeCanvas) {
    const size = getDisplaySize(obj, barcodeCanvas, scale, dpmm);
    displayW = size.w;
    displayH = size.h;
  }

  // Apply ^FT baseline correction (same logic as KonvaObjectInner)
  const displayX = obj.x;
  let displayY = obj.y;
  if (obj.positionType === "FT") {
    if (barcodeCanvas) {
      displayY -= pxToDots(displayH, scale, dpmm);
    } else if (BARCODE_1D_TYPES.has(obj.type)) {
      displayY -= (obj.props as { height: number }).height;
    }
    if (obj.type === "qrcode") {
      // Zebra firmware artifact: ^FT for QR codes shifts the symbol up by exactly
      // 3 modules (= 3 * magnification dots), independent of dpmm or content.
      // Verified against Labelary API across magnifications 4–10 at 8 and 12 dpmm.
      // Leading theory: the firmware reserves a dummy text-interpretation bounding
      // box (as for 1D barcodes) even though QR codes have no human-readable text.
      displayY -=
        QR_FT_MODULE_OFFSET *
        (obj.props as { magnification: number }).magnification;
    }
  } else if (obj.type === "qrcode") {
    // Zebra firmware artifact: ^FO QR codes are rendered with a hardcoded +10 dot
    // Y-offset, independent of magnification and dpmm. Verified against Labelary.
    displayY += QR_FO_Y_OFFSET_DOTS;
  }

  const x = offsetX + dotsToPx(displayX, scale, dpmm);
  const y = offsetY + dotsToPx(displayY, scale, dpmm);

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
    let finalY = pxToDots(e.target.y() - offsetY, scale, dpmm);
    if (obj.positionType === "FT") {
      if (barcodeCanvas) {
        finalY += pxToDots(displayH, scale, dpmm);
      } else if (BARCODE_1D_TYPES.has(obj.type)) {
        finalY += (obj.props as { height: number }).height;
      }
      if (obj.type === "qrcode") {
        finalY +=
          QR_FT_MODULE_OFFSET *
          (obj.props as { magnification: number }).magnification;
      }
    } else if (obj.type === "qrcode") {
      finalY -= QR_FO_Y_OFFSET_DOTS;
    }
    onChange({
      x: pxToDots(e.target.x() - offsetX, scale, dpmm),
      y: finalY,
    });
  };

  if (barcodeCanvas) {
    const w = displayW;
    const h = displayH;
    // Force-off when the symbology has no HRI in ZPL (e.g. GS1 Databar) — the
    // canvas must match the print output even if a legacy saved object still
    // carries printInterpretation: true.
    const rotation = objectRotation(obj.props);
    const isUpright = rotation === "N";
    const printInterpEnabled =
      !ObjectRegistry[obj.type]?.interpretationLocked &&
      !!(obj.props as { printInterpretation?: boolean }).printInterpretation;
    const printInterp = isUpright && printInterpEnabled;
    const moduleWidth =
      (obj.props as { moduleWidth?: number }).moduleWidth ?? 2;
    const textFontSize = Math.max(dotsToPx(moduleWidth * 10, scale, dpmm), 6);
    const textGap = Math.max(dotsToPx(5, scale, dpmm), 3);
    const rawContent = (obj.props as { content?: string }).content ?? "";

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
        const digits12 = rawContent
          .replace(/\D/g, "")
          .slice(0, 12)
          .padEnd(12, "0");
        const allDigits = digits12 + eanCheckDigit(digits12, 1, 3); // 13 digits

        const { xLeft: xLeft13, xRight: xRight13, halfWidth: halfW13 } = layout;

        const textY = Math.max(h, 1) + textGap;
        clipLeft = ldW;
        textNodes = [
          <Text
            key="d0"
            x={-ldW}
            y={textY}
            width={ldW}
            text={allDigits[0]}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      } else if (obj.type === "ean8") {
        const digits7 = rawContent
          .replace(/\D/g, "")
          .slice(0, 7)
          .padEnd(7, "0");
        const allDigits = digits7 + eanCheckDigit(digits7, 3, 1); // 8 digits

        const { xLeft: xLeft8, xRight: xRight8, halfWidth: halfW8 } = layout;

        const textY = Math.max(h, 1) + textGap;
        textNodes = [
          <Text
            key="dl"
            x={xLeft8}
            y={textY}
            width={halfW8}
            text={allDigits.slice(0, 4)}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      } else if (obj.type === "upca") {
        const digits11 = rawContent
          .replace(/\D/g, "")
          .slice(0, 11)
          .padEnd(11, "0");
        const allDigits = digits11 + eanCheckDigit(digits11, 3, 1); // 12 digits

        const { xLeft: xLeftUpca, xRight: xRightUpca, halfWidth: halfUpca } =
          layout;

        const textY = Math.max(h, 1) + textGap;
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
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
            align="center"
            wrap="none"
            fill="#000000"
            listening={false}
          />,
        ];
      } else if (obj.type === "upce") {
        const digits6 = rawContent
          .replace(/\D/g, "")
          .slice(0, 6)
          .padEnd(6, "0");

        const checkDigit = upceCheckDigit(digits6);

        // UPC-E: 6 digits centered over the data area (modules 3–44 of 51)
        const { xLeft: xMid, halfWidth: midW } = layout;
        const textY = Math.max(h, 1) + textGap;
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
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
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
            fontFamily="'Courier New', monospace"
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
          draggable
          onClick={(e) =>
            onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
          }
          onTap={() => onSelect(false)}
          onDragMove={(e) =>
            e.target.position(snapPos(e.target.x(), e.target.y()))
          }
          onDragEnd={handleDragEnd}
        >
          <KImage
            x={0}
            y={0}
            image={barcodeCanvas}
            width={Math.max(w, 1)}
            height={Math.max(h, 1)}
            imageSmoothingEnabled={false}
            stroke={isSelected ? "#6366f1" : undefined}
            strokeWidth={isSelected ? 2 : 0}
            strokeScaleEnabled={false}
          />
          {textNodes}
        </Group>
      );
    }

    // ── Other 1D: separate Konva Text below bars ──────────────────────────
    const showText = BARCODE_1D_TYPES.has(obj.type) && printInterp;
    // Rotated 1D: text overlay rotated to match the barcode orientation.
    const showRotatedText =
      !isUpright &&
      printInterpEnabled &&
      BARCODE_1D_TYPES.has(obj.type);

    let displayText = rawContent;
    if (obj.type === "code39") {
      displayText = `*${rawContent}*`;
    } else if (obj.type === "logmars") {
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
      let sum = 0;
      for (const c of rawContent) {
        const idx = chars.indexOf(c.toUpperCase());
        if (idx >= 0) sum += idx;
      }
      displayText = `${rawContent}${chars[sum % 43] ?? ""}`;
    }

    if (showText) {
      // LOGMARS renders the human-readable line above the bars (per spec).
      // ^FO Y refers to the bar top, so text is drawn at negative y to extend
      // above the group origin into the visual zone above the bars.
      const isTextAbove = obj.type === "logmars";
      const aboveGap = isTextAbove
        ? Math.max(dotsToPx(LOGMARS_TEXT_ABOVE_GAP_DOTS, scale, dpmm), 3)
        : textGap;
      // Local y for the HRI text. The /sy form keeps a constant *visual* offset
      // when the group is being scaled (sy = 1 at rest, ≠ 1 during a drag).
      const textLocalY = (sy: number) =>
        isTextAbove
          ? -(textFontSize + aboveGap) / sy
          : Math.max(h, 1) + textGap / sy;
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
          draggable
          onClick={(e) =>
            onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
          }
          onTap={() => onSelect(false)}
          onDragMove={(e) =>
            e.target.position(snapPos(e.target.x(), e.target.y()))
          }
          onDragEnd={handleDragEnd}
          onTransform={handleTransform}
          onTransformEnd={handleTransformEnd}
        >
          <KImage
            x={0}
            y={0}
            image={barcodeCanvas}
            width={Math.max(w, 1)}
            height={Math.max(h, 1)}
            imageSmoothingEnabled={false}
            stroke={isSelected ? "#6366f1" : undefined}
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
            fontFamily="'Courier New', monospace"
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
      const isTextAbove = obj.type === "logmars";
      // x-anchor for R/B (shared by all text nodes for a given rotation)
      const sideX =
        rotation === "R"
          ? isTextAbove ? w + textGap + textFontSize : -textGap
          : isTextAbove ? -(textGap + textFontSize) : w + textGap;
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
          const ty = rotation === "R" ? encPos : rotation === "B" ? h - encPos : -textGap;
          return <Text key={key} x={tx} y={ty} rotation={tRot} width={Math.max(size, 1)} text={text} align="center" {...tStyle} />;
        };

        // Single digit floated BEFORE barcode start (outside the quiet zone).
        const sysNode = (key: string, text: string) => {
          // R: above top (y=-ldW); B: below bottom (y=h+ldW); I: right of barcode (x=w+ldW).
          const tx = rotation === "I" ? w + ldW : sideX;
          const ty = rotation === "R" ? -ldW : rotation === "B" ? h + ldW : -textGap;
          return <Text key={key} x={tx} y={ty} rotation={tRot} width={Math.max(ldW, 1)} text={text} align="center" {...tStyle} />;
        };

        // Single digit floated AFTER barcode end (UPC-A/UPC-E check digit).
        const trailNode = (key: string, text: string) => {
          // R: below bottom (y≈encDisplay); B: above top (y≈h-encDisplay); I: left of x=0.
          const tx = rotation === "I" ? -ldW : sideX;
          const ty = rotation === "R" ? encDisplay : rotation === "B" ? h - encDisplay : -textGap;
          return <Text key={key} x={tx} y={ty} rotation={tRot} width={Math.max(ldW, 1)} text={text} align="left" {...tStyle} />;
        };

        if (obj.type === "ean13") {
          const d12 = rawContent.replace(/\D/g, "").slice(0, 12).padEnd(12, "0");
          const all13 = d12 + eanCheckDigit(d12, 1, 3);
          textElements = [
            sysNode("sys", all13[0] ?? ""),
            node("left", xLeft, halfW, all13.slice(1, 7)),
            node("right", xRight, halfW, all13.slice(7, 13)),
          ];
        } else if (obj.type === "ean8") {
          const d7 = rawContent.replace(/\D/g, "").slice(0, 7).padEnd(7, "0");
          const all8 = d7 + eanCheckDigit(d7, 3, 1);
          textElements = [
            node("left", xLeft, halfW, all8.slice(0, 4)),
            node("right", xRight, halfW, all8.slice(4, 8)),
          ];
        } else if (obj.type === "upca") {
          const d11 = rawContent.replace(/\D/g, "").slice(0, 11).padEnd(11, "0");
          const all12 = d11 + eanCheckDigit(d11, 3, 1);
          textElements = [
            sysNode("sys", all12[0] ?? ""),
            node("left", xLeft, halfW, all12.slice(1, 6)),
            node("right", xRight, halfW, all12.slice(6, 11)),
          ];
        } else if (obj.type === "upce") {
          const d6 = rawContent.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
          const ck = upceCheckDigit(d6);
          textElements = [
            sysNode("sys", "0"),
            node("mid", xLeft, halfW, d6),
            trailNode("trail", ck),
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
          txtX = w;
          txtY = isTextAbove ? h + textGap + textFontSize : -textGap;
          txtWidth = w;
        } else {
          txtX = sideX; txtY = h; txtWidth = h;
        }

        textElements = (
          <Text
            x={txtX} y={txtY} rotation={tRot} width={Math.max(txtWidth, 1)}
            text={displayText} fontSize={textFontSize}
            fontFamily="'Courier New', monospace"
            align="center" wrap="none" fill="#000000" listening={false}
          />
        );
      }

      return (
        <Group
          id={obj.id} x={x} y={y} draggable
          onClick={(e) => onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)}
          onTap={() => onSelect(false)}
          onDragMove={(e) => e.target.position(snapPos(e.target.x(), e.target.y()))}
          onDragEnd={handleDragEnd}
        >
          <KImage x={0} y={0} image={barcodeCanvas}
            width={Math.max(w, 1)} height={Math.max(h, 1)}
            imageSmoothingEnabled={false}
            stroke={isSelected ? "#6366f1" : undefined}
            strokeWidth={isSelected ? 2 : 0}
            strokeScaleEnabled={false}
          />
          {textElements}
        </Group>
      );
    }

    return (
      <KImage
        id={obj.id}
        x={x}
        y={y}
        image={barcodeCanvas}
        width={Math.max(w, 1)}
        height={Math.max(h, 1)}
        imageSmoothingEnabled={false}
        stroke={isSelected ? "#6366f1" : undefined}
        strokeWidth={isSelected ? 2 : 0}
        strokeScaleEnabled={false}
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

  // Fallback placeholder (error or not yet rendered)
  const fbW = dotsToPx(200, scale, dpmm);
  const fbH = dotsToPx(80, scale, dpmm);
  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      draggable
      onClick={(e) =>
        onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
      }
      onTap={() => onSelect(false)}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={fbW}
        height={fbH}
        fill="#f9fafb"
        stroke={isSelected ? "#6366f1" : "#9ca3af"}
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
