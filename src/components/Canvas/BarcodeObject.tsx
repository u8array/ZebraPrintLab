import React, { useMemo } from "react";
import bwipjs from "bwip-js/browser";
import { Image as KImage, Group, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { LabelObject } from "../../registry";
import { BARCODE_1D_TYPES } from "../../registry";
import type { ObjectChanges } from "../../store/labelStore";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import {
  buildBwipOptions,
  getDisplaySize,
  eanCheckDigit,
  get1DBwipScale,
  getEanUpcLayout,
  type EanUpcType,
} from "./bwipHelpers";
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
  const { type, props } = obj;
  const { barcodeCanvas, errorMsg } = useMemo(() => {
    const opts = buildBwipOptions({ type, props }, scale, dpmm);
    if (!opts) return { barcodeCanvas: null, errorMsg: null };
    const canvas = document.createElement("canvas");
    try {
      bwipjs.toCanvas(canvas, opts as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
      return { barcodeCanvas: canvas, errorMsg: null };
    } catch (e) {
      return { barcodeCanvas: null, errorMsg: e instanceof Error ? e.message : String(e) };
    }
  }, [type, props, scale, dpmm]);

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
    const printInterp = !!(obj.props as { printInterpretation?: boolean })
      .printInterpretation;
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
          // check digit — outside-right (like leading digit on left)
          <Text
            key="dc"
            x={w + 2}
            y={textY}
            width={ldW}
            text={allDigits[11]}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace"
            align="left"
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

        // Expand UPC-E to 11-digit UPC-A to compute check digit
        const vA = digits6[0] ?? "0",
          vB = digits6[1] ?? "0",
          vC = digits6[2] ?? "0";
        const vD = digits6[3] ?? "0",
          vE = digits6[4] ?? "0",
          vF = digits6[5] ?? "0";
        const fi = parseInt(vF, 10);
        let expanded11: string;
        if (fi <= 2) expanded11 = `0${vA}${vB}${vF}0000${vC}${vD}${vE}`;
        else if (fi === 3) expanded11 = `0${vA}${vB}${vC}00000${vD}${vE}`;
        else if (fi === 4) expanded11 = `0${vA}${vB}${vC}${vD}00000${vE}`;
        else expanded11 = `0${vA}${vB}${vC}${vD}${vE}${vF}0000`;
        let ckSum = 0;
        for (let i = 0; i < 11; i++)
          ckSum += parseInt(expanded11[i] ?? "0", 10) * (i % 2 === 0 ? 3 : 1);
        const checkDigit = String((10 - (ckSum % 10)) % 10);

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
          />
          {textNodes}
        </Group>
      );
    }

    // ── Other 1D: separate Konva Text below bars ──────────────────────────
    const showText =
      BARCODE_1D_TYPES.has(obj.type) &&
      (obj.props as { printInterpretation?: boolean }).printInterpretation;

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
      const txtY = isTextAbove ? -(textFontSize + aboveGap) : Math.max(h, 1) + textGap;
      const clipY = isTextAbove ? -(textFontSize + aboveGap) : 0;
      const clipHeight = Math.max(h, 1) + textFontSize + aboveGap;

      return (
        <Group
          id={obj.id}
          x={x}
          y={y}
          clipX={0}
          clipY={clipY}
          clipWidth={Math.max(w, 1)}
          clipHeight={clipHeight}
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
          />
          <Text
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
        text={errorMsg ? `⚠ ${errorMsg}` : obj.type}
        fontSize={Math.max(dotsToPx(10, scale, dpmm), 8)}
        fill="#374151"
      />
    </Group>
  );
}
