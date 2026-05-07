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
  transformNodeTopLeft,
  positionDidMove,
  forceSquareBox,
  type BoundingBox,
} from "../transformerGeometry";
import { modelPositionFromRenderedTopLeft } from "../transformPosition";
import {
  computeResizeSnap,
  deriveActiveEdges,
  type SnapGuide,
  type SnapRect,
} from "../../../lib/snapGuides";

/** Pack a Konva clientRect into the SnapRect shape used by snap helpers. */
function toSnapRect(id: string, rect: { x: number; y: number; width: number; height: number }): SnapRect {
  return { id, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Snapshot every object's stage-space bbox at transform start. Other objects
 * can't move during a resize, so we cache once and avoid per-tick Konva queries.
 */
function captureOtherRects(
  stage: Konva.Stage,
  objects: LabelObject[],
  excludeId: string,
): SnapRect[] {
  const result: SnapRect[] = [];
  for (const o of objects) {
    if (o.id === excludeId) continue;
    const n = stage.findOne<Konva.Node>(`#${o.id}`);
    if (!n) continue;
    const cr = n.getClientRect({ skipShadow: true, skipStroke: true, relativeTo: stage });
    result.push(toSnapRect(o.id, cr));
  }
  return result;
}

/**
 * Phase 1 of resize: snap height to whole rowHeight increments for stacked-2D
 * barcodes (or to whole dots otherwise), and pin the bottom edge if the resize
 * originates from the top anchor.
 */
function applyHeightSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  dotPx: number,
  anchor: { nodeHeight: number; rowHeight: number } | null,
): BoundingBox {
  const stepPx =
    anchor && anchor.rowHeight > 0 && anchor.nodeHeight > 0
      ? anchor.nodeHeight / anchor.rowHeight
      : dotPx;
  const snappedH = snapBoxHeight(newBox.height, stepPx);
  return isTopAnchorResize(oldBox, newBox, dotPx * 0.5)
    ? pinBottomEdge(oldBox, newBox, snappedH)
    : { ...newBox, height: snappedH };
}

/**
 * Phase 2 of resize: snap moving edges to other objects' / label edges
 * (object-snap, mirrors drag-time snap). Pure delegation to `computeResizeSnap`
 * with input shape conversion.
 */
function applyResizeObjectSnap(
  bbox: BoundingBox,
  startBbox: SnapRect,
  others: SnapRect[],
  labelRect: SnapRect,
): { bbox: BoundingBox; guides: SnapGuide[] } {
  const draggedRect = toSnapRect(startBbox.id, bbox);
  const activeEdges = deriveActiveEdges(startBbox, draggedRect);
  const result = computeResizeSnap(draggedRect, others, activeEdges, undefined, labelRect, labelRect);
  return {
    bbox: { x: result.x, y: result.y, width: result.width, height: result.height, rotation: bbox.rotation },
    guides: result.guides,
  };
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
  /** Label rect in stage-screen space, used as a snap target. */
  labelRect: SnapRect;
  /** True when grid-snap is OFF — object-snap during resize mirrors drag. */
  objectSnapEnabled: boolean;
  /** Pushes resize-time snap guides into the canvas's shared guide state. */
  setGuides: (guides: SnapGuide[]) => void;
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
  labelRect,
  objectSnapEnabled,
  setGuides,
}: Options): TransformerState {
  // Captures node height and rowHeight at drag start so boundBoxFunc uses a
  // fixed step size throughout the entire drag session.
  const transformAnchorRef = useRef<{ nodeHeight: number; rowHeight: number } | null>(null);
  // Captures the bbox at transform start so deriveActiveEdges can detect which
  // edges are moving relative to the start state (oldBox in boundBoxFunc is the
  // previous frame, which would always look "everything moved").
  const transformStartBboxRef = useRef<SnapRect | null>(null);
  // Snapshot of the other objects' bboxes at transform start. Other objects
  // can't move during a resize, so we avoid re-querying Konva on every tick.
  const othersSnapshotRef = useRef<SnapRect[]>([]);

  // Stable key of selected object types — avoids re-running on every drag-move
  // position update (which changes objects but not the types of selected objects).
  const selectedTypesKey = selectedIds
    .map((id) => objects.find((o) => o.id === id)?.type ?? "")
    .join(",");

  // Signature of the selected objects' size-relevant props. Changes after
  // commitTransform → forces the transformer to re-measure the attached node
  // so its bounding box matches the new rendered size. Position is excluded:
  // moves don't change bbox dimensions, and Konva tracks the node's position
  // automatically.
  const selectedSignature = selectedIds
    .map((id) => {
      const o = objects.find((obj) => obj.id === id);
      return o ? `${id}:${JSON.stringify(o.props)}` : id;
    })
    .join("|");

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
    // Force a re-measure: after commitTransform the node's getClientRect has
    // changed but the transformer caches its bounds from the last interaction.
    transformerRef.current.forceUpdate();
  // selectedTypesKey encodes the type of every selected object — sufficient to
  // detect the line/non-line distinction that governs transformer attachment.
  // selectedSignature triggers a re-measure when an object's size or position
  // changes (e.g. after commitTransform finishes a resize).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedTypesKey, selectedSignature, stageRef, transformerRef]);

  const resizeEnabled = selectedIds.length <= 1;
  const singleType =
    selectedIds.length === 1
      ? objects.find((o) => o.id === selectedIds[0])?.type ?? ""
      : "";
  const isUniformScale = !!ObjectRegistry[singleType]?.uniformScale;
  const enabledAnchors: string[] | undefined =
    selectedIds.length > 1
      ? []
      : ObjectRegistry[singleType]?.heightLocked
        ? []
        : BARCODE_1D_TYPES.has(singleType)
          ? ["top-center", "bottom-center"]
          : isUniformScale
            ? ["top-left", "top-right", "bottom-left", "bottom-right"]
            : undefined;
  const isFreeResize = enabledAnchors === undefined;

  /** Reset all transform-time state. Idempotent; safe to call from any exit path. */
  function cleanupTransformState() {
    transformAnchorRef.current = null;
    transformStartBboxRef.current = null;
    othersSnapshotRef.current = [];
    setGuides([]);
  }

  const onTransformStart = () => {
    const singleId = selectedIds[0];
    if (!singleId || !stageRef.current) return;
    const node = stageRef.current.findOne<Konva.Node>(`#${singleId}`);
    if (!node) return;
    const obj = objects.find((o) => o.id === singleId);
    transformAnchorRef.current = obj && STACKED_2D_TYPES.has(obj.type)
      ? { nodeHeight: node.height(), rowHeight: (obj.props as { rowHeight: number }).rowHeight }
      : null;
    const startRect = node.getClientRect({ skipShadow: true, skipStroke: true, relativeTo: stageRef.current });
    transformStartBboxRef.current = toSnapRect(singleId, startRect);
    othersSnapshotRef.current = captureOtherRects(stageRef.current, objects, singleId);
  };

  const boundBoxFunc = (oldBox: BoundingBox, newBox: BoundingBox): BoundingBox => {
    if (newBox.width < 10 || newBox.height < 10) return oldBox;
    if (isUniformScale) newBox = forceSquareBox(oldBox, newBox);
    const dotPx = scale / dpmm;
    let bbox = applyHeightSnap(oldBox, newBox, dotPx, transformAnchorRef.current);

    // Object-snap during resize (mirrors drag-time snap). Only fires when
    // grid-snap is off and the user is doing a free corner-resize — the 1D /
    // stacked-2D anchor restrictions have their own height math above and
    // would conflict with edge-driven snapping.
    const startBbox = transformStartBboxRef.current;
    if (objectSnapEnabled && isFreeResize && startBbox) {
      const snapped = applyResizeObjectSnap(bbox, startBbox, othersSnapshotRef.current, labelRect);
      setGuides(snapped.guides);
      bbox = snapped.bbox;
    }
    return bbox;
  };

  const onTransformEnd = () => {
    if (selectedIds.length !== 1 || !selectedIds[0] || !stageRef.current) {
      cleanupTransformState();
      return;
    }
    const singleId = selectedIds[0];
    const node = stageRef.current.findOne<Konva.Node>(`#${singleId}`);
    if (!node) {
      cleanupTransformState();
      return;
    }
    const sx = node.scaleX();
    const sy = node.scaleY();
    const nodeWidth = node.width();
    const nodeHeight = node.height();
    node.scaleX(1);
    node.scaleY(1);
    const obj = currentObjects(useLabelStore.getState()).find((o) => o.id === singleId);
    if (!obj) {
      cleanupTransformState();
      return;
    }
    const isCenterAnchored = ObjectRegistry[obj.type]?.nodeOrigin === "center";
    const topLeft = transformNodeTopLeft(
      node.x(),
      node.y(),
      nodeWidth,
      nodeHeight,
      sx,
      sy,
      isCenterAnchored,
    );
    const renderedXDots = pxToDots(topLeft.x - objectsOffsetX, scale, dpmm);
    const renderedYDots = pxToDots(topLeft.y - labelOffsetY, scale, dpmm);
    // Invert per-type render offsets (e.g. QR's hardcoded +10 dot Y) so the
    // stored model position matches what BarcodeObject.handleDragEnd produces.
    const modelPos = modelPositionFromRenderedTopLeft(obj, renderedXDots, renderedYDots);
    // Only apply snap when the resize actually moved the position
    // (e.g. dragging the top-left handle). Anchored-corner drags must keep
    // the original position so off-grid shapes don't snap as a side-effect.
    const pos = {
      x: positionDidMove(modelPos.x, obj.x) ? snap(modelPos.x) : obj.x,
      y: positionDidMove(modelPos.y, obj.y) ? snap(modelPos.y) : obj.y,
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
    cleanupTransformState();
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
