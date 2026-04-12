import { useMemo } from 'react';
import bwipjs from 'bwip-js/browser';
import { Image as KImage, Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { LabelObject } from '../../registry';
import { BARCODE_1D_TYPES } from '../../registry';
import type { LabelObjectBase } from '../../types/ObjectType';
import { dotsToPx, pxToDots } from '../../lib/coordinates';

type ObjectChanges = Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object };

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

// Map our registry types to bwip-js bcids
const BCID: Partial<Record<LabelObject['type'], string>> = {
  code128: 'code128',
  code39: 'code39',
  ean13: 'ean13',
  ean8: 'ean8',
  upca: 'upca',
  upce: 'upce',
  interleaved2of5: 'interleaved2of5',
  code93: 'code93',
  pdf417: 'pdf417',
  qrcode: 'qrcode',
  datamatrix: 'datamatrix',
};

const BWIP_SCALE = 2; // px per module — fixed render resolution

function buildBwipOptions(obj: LabelObject): Record<string, unknown> | null {
  const bcid = BCID[obj.type];
  if (!bcid) return null;

  switch (obj.type) {
    case 'code128':
    case 'code39':
    case 'ean13':
    case 'ean8':
    case 'upca':
    case 'upce':
    case 'interleaved2of5':
    case 'code93': {
      const p = obj.props;
      return {
        bcid,
        text: p.content || '0',
        scale: BWIP_SCALE,
        height: 10, // mm — only determines aspect; actual display height set by KonvaImage scale
      };
    }
    case 'pdf417': {
      const p = obj.props;
      return {
        bcid,
        text: p.content || ' ',
        scale: BWIP_SCALE,
        rowheight: Math.max(1, Math.round(p.rowHeight / Math.max(p.moduleWidth, 1))),
        columns: p.columns || 0,
        eclevel: String(p.securityLevel),
      };
    }
    case 'qrcode': {
      const p = obj.props;
      return {
        bcid,
        text: p.content || ' ',
        scale: BWIP_SCALE,
        eclevel: p.errorCorrection,
      };
    }
    case 'datamatrix': {
      const p = obj.props;
      return {
        bcid,
        text: p.content || ' ',
        scale: BWIP_SCALE,
      };
    }
    default:
      return null;
  }
}

// Compute Konva display dimensions from the rendered bwip canvas and object props.
function getDisplaySize(
  obj: LabelObject,
  canvas: HTMLCanvasElement,
  scale: number,
  dpmm: number,
): { w: number; h: number } {
  switch (obj.type) {
    case 'code128':
    case 'code39':
    case 'ean13':
    case 'ean8':
    case 'upca':
    case 'upce':
    case 'interleaved2of5':
    case 'code93': {
      // Width: number of modules × moduleWidth dots/module; height is bar height only
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const w = (canvas.width / BWIP_SCALE) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case 'pdf417': {
      // canvas rendered at BWIP_SCALE px/module; use moduleWidth dots/module as display scale
      const ratio = dotsToPx(obj.props.moduleWidth, scale, dpmm) / BWIP_SCALE;
      return { w: canvas.width * ratio, h: canvas.height * ratio };
    }
    case 'qrcode': {
      // canvas.width / BWIP_SCALE = number of modules; each module = magnification dots
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size = (canvas.width / BWIP_SCALE) * modulePx;
      return { w: size, h: size };
    }
    case 'datamatrix': {
      const modulePx = dotsToPx(obj.props.dimension, scale, dpmm);
      const size = (canvas.width / BWIP_SCALE) * modulePx;
      return { w: size, h: size };
    }
    default:
      return { w: dotsToPx(200, scale, dpmm), h: dotsToPx(100, scale, dpmm) };
  }
}

export function BarcodeObject({
  obj, scale, dpmm, offsetX, offsetY, isSelected, onSelect, onChange, snap,
}: Props) {
  // Apply ^FT baseline correction (same logic as KonvaObjectInner)
  const displayX = obj.x;
  let displayY = obj.y;
  if (obj.positionType === 'FT') {
    if (BARCODE_1D_TYPES.has(obj.type)) {
      const p = obj.props as { height: number };
      displayY -= p.height;
    } else if (obj.type === 'pdf417') {
      const p = obj.props as { rowHeight: number };
      displayY -= p.rowHeight * 10;
    } else if (obj.type === 'qrcode') {
      const p = obj.props as { magnification: number };
      displayY -= p.magnification * 25;
    } else if (obj.type === 'datamatrix') {
      const p = obj.props as { dimension: number };
      displayY -= p.dimension * 20;
    }
  }

  const x = offsetX + dotsToPx(displayX, scale, dpmm);
  const y = offsetY + dotsToPx(displayY, scale, dpmm);

  // bwip-js is synchronous — compute canvas directly in render (no async flash on resize)
  const barcodeCanvas = useMemo(() => {
    const opts = buildBwipOptions(obj);
    if (!opts) return null;
    const canvas = document.createElement('canvas');
    try {
      bwipjs.toCanvas(canvas, opts as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
      return canvas;
    } catch {
      return null;
    }
  }, [obj]);

  const hasError = barcodeCanvas === null && buildBwipOptions(obj) !== null;

  const snapPos = (sx: number, sy: number) => ({
    x: offsetX + dotsToPx(snap(pxToDots(sx - offsetX, scale, dpmm)), scale, dpmm),
    y: offsetY + dotsToPx(snap(pxToDots(sy - offsetY, scale, dpmm)), scale, dpmm),
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

  if (barcodeCanvas && !hasError) {
    const { w, h } = getDisplaySize(obj, barcodeCanvas, scale, dpmm);
    const showText = BARCODE_1D_TYPES.has(obj.type) &&
      (obj.props as { printInterpretation?: boolean }).printInterpretation;
    const textFontSize = Math.max(dotsToPx(8, scale, dpmm), 7);
    const content = (obj.props as { content?: string }).content ?? '';

    if (showText) {
      return (
        <Group
          id={obj.id}
          x={x}
          y={y}
          draggable
          onClick={(e) => onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)}
          onTap={() => onSelect(false)}
          onDragMove={(e) => e.target.position(snapPos(e.target.x(), e.target.y()))}
          onDragEnd={(e) => onChange({
            x: pxToDots(e.target.x() - offsetX, scale, dpmm),
            y: pxToDots(e.target.y() - offsetY, scale, dpmm),
          })}
        >
          <KImage
            x={0}
            y={0}
            image={barcodeCanvas}
            width={Math.max(w, 1)}
            height={Math.max(h, 1)}
            imageSmoothingEnabled={false}
            stroke={isSelected ? '#6366f1' : undefined}
            strokeWidth={isSelected ? 2 : 0}
          />
          <Text
            x={0}
            y={Math.max(h, 1) + 1}
            width={Math.max(w, 1)}
            text={content}
            fontSize={textFontSize}
            fontFamily="'Courier New', monospace"
            align="center"
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
        stroke={isSelected ? '#6366f1' : undefined}
        strokeWidth={isSelected ? 2 : 0}
        draggable
        onClick={(e) => onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)}
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
      onClick={(e) => onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)}
      onTap={() => onSelect(false)}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={fbW}
        height={fbH}
        fill="#f9fafb"
        stroke={isSelected ? '#6366f1' : '#9ca3af'}
        strokeWidth={isSelected ? 2 : 1}
        dash={isSelected ? undefined : [4, 2]}
      />
      <Text
        x={6}
        y={6}
        text={hasError ? `⚠ ${obj.type}` : obj.type}
        fontSize={Math.max(dotsToPx(10, scale, dpmm), 8)}
        fill="#374151"
      />
    </Group>
  );
}
