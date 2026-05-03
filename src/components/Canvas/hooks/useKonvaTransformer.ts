import { useRef, useEffect } from "react";
import type Konva from "konva";
import { pxToDots } from "../../../lib/coordinates";
import { useLabelStore, currentObjects } from "../../../store/labelStore";
import { BARCODE_1D_TYPES, STACKED_2D_TYPES, ObjectRegistry } from "../../../registry";
import type { LabelObject } from "../../../registry";
import type { ObjectChanges } from "../../../store/labelStore";
import {
  snapBoxHeight,
  pinBottomEdge,
  isTopAnchorResize,
  type BoundingBox,
} from "../transformerGeometry";

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
    if (obj && STACKED_2D_TYPES.has(obj.type)) {
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
    // For stacked 2D barcodes, snap to whole rowHeight increments. stepPx is
    // derived from the node height captured at drag start (not oldBox.height,
    // which mutates each call and would drift).
    const anchor = transformAnchorRef.current;
    const stepPx =
      anchor && anchor.rowHeight > 0 && anchor.nodeHeight > 0
        ? anchor.nodeHeight / anchor.rowHeight
        : dotPx;
    const snappedH = snapBoxHeight(newBox.height, stepPx);
    if (isTopAnchorResize(oldBox, newBox, dotPx * 0.5)) {
      return pinBottomEdge(oldBox, newBox, snappedH);
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
    const nodeHeight = node.height();
    node.scaleX(1);
    node.scaleY(1);
    const obj = currentObjects(useLabelStore.getState()).find((o) => o.id === singleId);
    if (!obj) {
      transformAnchorRef.current = null;
      return;
    }
    const pos = {
      x: snap(pxToDots(node.x() - objectsOffsetX, scale, dpmm)),
      y: snap(pxToDots(node.y() - labelOffsetY, scale, dpmm)),
    };
    const commit = ObjectRegistry[obj.type]?.commitTransform;
    if (commit) {
      const propChanges = commit(obj, {
        sx,
        sy,
        snap,
        nodeHeight,
        anchor: transformAnchorRef.current,
      });
      updateObject(singleId, { ...pos, props: propChanges });
    }
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
