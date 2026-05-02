import { useRef, useEffect } from "react";
import type Konva from "konva";
import { pxToDots } from "../../../lib/coordinates";
import { useLabelStore } from "../../../store/labelStore";
import { BARCODE_1D_TYPES } from "../../../registry";
import type { LabelObject } from "../../../registry";
import type { ObjectChanges } from "../../../store/labelStore";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface Options {
  transformerRef: React.RefObject<Konva.Transformer | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  selectedIds: string[];
  objects: LabelObject[];
  scale: number;
  dpmm: number;
  objectsOffsetX: number;
  labelOffsetY: number;
  snap: (dots: number) => number;
  updateObject: (id: string, changes: ObjectChanges) => void;
}

export interface TransformerState {
  rotateEnabled: false;
  resizeEnabled: boolean;
  enabledAnchors: string[] | undefined;
  onTransformStart: () => void;
  boundBoxFunc: (oldBox: BoundingBox, newBox: BoundingBox) => BoundingBox;
  onTransformEnd: () => void;
}

export function useKonvaTransformer({
  transformerRef,
  stageRef,
  selectedIds,
  objects,
  scale,
  dpmm,
  objectsOffsetX,
  labelOffsetY,
  snap,
  updateObject,
}: Options): TransformerState {
  // Captures node height and rowHeight at drag start so boundBoxFunc uses a
  // fixed step size throughout the entire drag session.
  const transformAnchorRef = useRef<{ nodeHeight: number; rowHeight: number } | null>(null);

  // Stable key of selected object types — avoids re-running on every drag-move
  // position update (which changes objects but not the types of selected objects).
  const selectedTypesKey = selectedIds
    .map((id) => objects.find((o) => o.id === id)?.type ?? "")
    .join(",");

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (selectedIds.length === 0) {
      transformerRef.current.nodes([]);
      return;
    }
    if (selectedIds.length === 1) {
      const selectedObj = objects.find((o) => o.id === selectedIds[0]);
      const useTransformer = selectedObj && selectedObj.type !== "line";
      const node = useTransformer
        ? stageRef.current.findOne<Konva.Node>(`#${selectedIds[0]}`)
        : null;
      transformerRef.current.nodes(node ? [node] : []);
    } else {
      const nodes = selectedIds
        .filter((id) => objects.find((o) => o.id === id)?.type !== "line")
        .map((id) => stageRef.current?.findOne<Konva.Node>(`#${id}`))
        .filter((n): n is Konva.Node => n != null);
      transformerRef.current.nodes(nodes);
    }
  // selectedTypesKey encodes the type of every selected object — sufficient to
  // detect the line/non-line distinction that governs transformer attachment.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedTypesKey, stageRef, transformerRef]);

  const resizeEnabled = selectedIds.length <= 1;
  const enabledAnchors: string[] | undefined =
    selectedIds.length > 1
      ? []
      : BARCODE_1D_TYPES.has(objects.find((o) => o.id === selectedIds[0])?.type ?? "")
        ? ["top-center", "bottom-center"]
        : undefined;

  const onTransformStart = () => {
    const singleId = selectedIds[0];
    if (!singleId || !stageRef.current) return;
    const node = stageRef.current.findOne<Konva.Node>(`#${singleId}`);
    if (!node) return;
    const obj = objects.find((o) => o.id === singleId);
    if (
      obj &&
      (obj.type === "pdf417" || obj.type === "micropdf417" || obj.type === "codablock")
    ) {
      transformAnchorRef.current = {
        nodeHeight: node.height(),
        rowHeight: (obj.props as { rowHeight: number }).rowHeight,
      };
    } else {
      transformAnchorRef.current = null;
    }
  };

  const boundBoxFunc = (oldBox: BoundingBox, newBox: BoundingBox): BoundingBox => {
    if (newBox.width < 10 || newBox.height < 10) return oldBox;
    const dotPx = scale / dpmm;
    // For stacked 2D barcodes, snap to whole rowHeight increments.
    // stepPx is derived from the initial node height captured at drag start —
    // NOT from oldBox.height, which changes each call and would cause drift.
    const anchor = transformAnchorRef.current;
    let stepPx = dotPx;
    if (anchor && anchor.rowHeight > 0 && anchor.nodeHeight > 0) {
      stepPx = anchor.nodeHeight / anchor.rowHeight;
    }
    const snapH = (h: number) => Math.max(stepPx, Math.round(h / stepPx) * stepPx);
    const snappedH = snapH(newBox.height);
    // Detect top-anchor resize: y moved → keep bottom edge fixed.
    const isTopResize = Math.abs(newBox.y - oldBox.y) > dotPx * 0.5;
    if (isTopResize) {
      const bottom = oldBox.y + oldBox.height;
      return { ...newBox, y: bottom - snappedH, height: snappedH };
    }
    return { ...newBox, height: snappedH };
  };

  const onTransformEnd = () => {
    if (selectedIds.length !== 1 || !selectedIds[0] || !stageRef.current) return;
    const singleId = selectedIds[0];
    const node = stageRef.current.findOne<Konva.Node>(`#${singleId}`);
    if (!node) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const obj = useLabelStore.getState().objects.find((o) => o.id === singleId);
    if (!obj) return;
    const pos = {
      x: snap(pxToDots(node.x() - objectsOffsetX, scale, dpmm)),
      y: snap(pxToDots(node.y() - labelOffsetY, scale, dpmm)),
    };
    if (obj.type === "text") {
      updateObject(singleId, {
        ...pos,
        props: { fontHeight: Math.max(1, snap(Math.round(obj.props.fontHeight * sy))) },
      });
    } else if (BARCODE_1D_TYPES.has(obj.type)) {
      const p = obj.props as { height: number };
      updateObject(singleId, {
        ...pos,
        props: { height: Math.max(1, snap(Math.round(p.height * sy))) },
      });
    } else if (obj.type === "pdf417" || obj.type === "micropdf417" || obj.type === "codablock") {
      // Derive rowHeight from the anchor captured at drag start so the final
      // value matches what boundBoxFunc snapped to during the drag.
      const anchor = transformAnchorRef.current;
      const scaledH = node.height() * sy;
      let newRowHeight: number;
      if (anchor && anchor.nodeHeight > 0 && anchor.rowHeight > 0) {
        newRowHeight = Math.max(1, Math.round((scaledH * anchor.rowHeight) / anchor.nodeHeight));
      } else {
        newRowHeight = Math.max(
          1,
          snap(Math.round((obj.props as { rowHeight: number }).rowHeight * sy)),
        );
      }
      updateObject(singleId, {
        ...pos,
        props: {
          rowHeight: newRowHeight,
          moduleWidth: Math.max(
            1,
            Math.min(10, Math.round((obj.props as { moduleWidth: number }).moduleWidth * sx)),
          ),
        },
      });
    } else if (obj.type === "box") {
      updateObject(singleId, {
        ...pos,
        props: {
          width: Math.max(1, snap(Math.round(obj.props.width * sx))),
          height: Math.max(1, snap(Math.round(obj.props.height * sy))),
        },
      });
    } else if (obj.type === "qrcode") {
      updateObject(singleId, {
        ...pos,
        props: {
          magnification: Math.max(
            1,
            Math.min(10, Math.round(obj.props.magnification * Math.min(sx, sy))),
          ),
        },
      });
    } else if (obj.type === "datamatrix") {
      updateObject(singleId, {
        ...pos,
        props: {
          dimension: Math.max(
            1,
            Math.min(12, Math.round(obj.props.dimension * Math.min(sx, sy))),
          ),
        },
      });
    } else if (obj.type === "ellipse") {
      updateObject(singleId, {
        ...pos,
        props: {
          width: Math.max(1, snap(Math.round(obj.props.width * sx))),
          height: Math.max(1, snap(Math.round(obj.props.height * sy))),
        },
      });
    }
    // 'line' is intentionally excluded — it uses its own endpoint handle
    transformAnchorRef.current = null;
  };

  return {
    rotateEnabled: false,
    resizeEnabled,
    enabledAnchors,
    onTransformStart,
    boundBoxFunc,
    onTransformEnd,
  };
}
