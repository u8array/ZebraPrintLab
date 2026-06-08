import { useRef, useEffect } from "react";
import type Konva from "konva";
import { pxToDots } from "../../../lib/coordinates";
import { getCurrentObjects } from "../../../store/labelStore";
import { BARCODE_1D_TYPES, STACKED_2D_TYPES, getEntry } from "../../../registry";
import type { LeafObject } from "../../../registry";
import type { ObjectChanges } from "../../../store/labelStore";
import { findObjectById, isGroup } from "../../../types/Group";
import {
  applyHeightSnap,
  applyModuleWidthSnap,
  pinInactiveEdges,
  positionDidMove,
  forceSquareBox,
  type BoundingBox,
  type TransformAnchor,
} from "../transformerGeometry";
import {
  modelPositionFromRenderedTopLeft,
  renderedTopLeftFromModel,
} from "../transformPosition";
import {
  computeResizeSnap,
  deriveActiveEdges,
  type SnapGuide,
  type SnapRect,
} from "../../../lib/snapGuides";

/** Minimum bounding-box edge length during a resize, in stage pixels. Below
 *  this the user is presumed to have flicked past the object and we keep the
 *  previous box rather than collapsing it to a sliver. */
const MIN_RESIZE_BOX_PX = 10;

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
  objects: LeafObject[],
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
  objects: LeafObject[];
  scale: number;
  dpmm: number;
  objectsOffsetX: number;
  labelOffsetY: number;
  snap: (dots: number) => number;
  updateObject: (id: string, changes: ObjectChanges) => void;
  /** Label rect in stage-screen space, used as a snap target. */
  labelRect: SnapRect;
  /** True when grid-snap is OFF; object-snap during resize mirrors drag. */
  objectSnapEnabled: boolean;
  /** Pushes resize-time snap guides into the canvas's shared guide state. */
  setGuides: (guides: SnapGuide[]) => void;
  /** Canvas view rotation. When non-zero, the parent group is rotated and
   *  Konva's bbox semantics in boundBoxFunc no longer match our axis-aware
   *  snap / pin helpers; we fall back to native Konva resize there. */
  viewRotation: number;
  /** True while Labelary preview replaces the editor leaves. The selected
   *  KonvaObject nodes are unmounted during preview, so we re-resolve them
   *  by id when the flag flips back to false. */
  previewLocks: boolean;
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
  viewRotation,
  previewLocks,
}: Options): TransformerState {
  // Captures the per-type snap reference at drag start so boundBoxFunc uses a
  // fixed step size throughout the entire drag session (row height for stacked
  // 2D, moduleWidth for 1D barcodes).
  const transformAnchorRef = useRef<TransformAnchor | null>(null);
  // Captures the bbox at transform start so deriveActiveEdges can detect which
  // edges are moving relative to the start state (oldBox in boundBoxFunc is the
  // previous frame, which would always look "everything moved").
  const transformStartBboxRef = useRef<SnapRect | null>(null);
  // Snapshot of the other objects' bboxes at transform start. Other objects
  // can't move during a resize, so we avoid re-querying Konva on every tick.
  const othersSnapshotRef = useRef<SnapRect[]>([]);

  // Stable key of selected object types, avoids re-running on every drag-move
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
      const useTransformer =
        selectedObj && selectedObj.type !== "line" && !selectedObj.locked;
      const node = useTransformer
        ? stageRef.current.findOne<Konva.Node>(`#${selectedIds[0]}`)
        : null;
      transformerRef.current.nodes(node ? [node] : []);
    } else {
      const nodes = selectedIds
        .map((id) => objects.find((o) => o.id === id))
        .filter((o): o is LeafObject => !!o && o.type !== "line" && !o.locked)
        .map((o) => stageRef.current?.findOne<Konva.Node>(`#${o.id}`))
        .filter((n): n is Konva.Node => n != null);
      transformerRef.current.nodes(nodes);
    }
    // Force a re-measure: after commitTransform the node's getClientRect has
    // changed but the transformer caches its bounds from the last interaction.
    transformerRef.current.forceUpdate();
  // selectedTypesKey encodes the type of every selected object, sufficient to
  // detect the line/non-line distinction that governs transformer attachment.
  // selectedSignature triggers a re-measure when an object's size or position
  // changes (e.g. after commitTransform finishes a resize).
  // previewLocks: KonvaObject nodes are unmounted during preview, so the
  // transformer holds stale node refs until we re-resolve once preview ends.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedTypesKey, selectedSignature, stageRef, transformerRef, previewLocks]);

  const singleSelected =
    selectedIds.length === 1
      ? objects.find((o) => o.id === selectedIds[0])
      : undefined;
  const resizeEnabled = selectedIds.length <= 1 && !singleSelected?.locked;
  const singleType = singleSelected?.type ?? "";
  const uniformScaleDef = getEntry(singleType)?.uniformScale;
  const isUniformScale =
    typeof uniformScaleDef === "function"
      ? !!singleSelected && !isGroup(singleSelected) &&
        uniformScaleDef(singleSelected.props as object)
      : !!uniformScaleDef;
  const enabledAnchors: string[] | undefined =
    selectedIds.length > 1
      ? []
      : getEntry(singleType)?.heightLocked
        ? []
        : BARCODE_1D_TYPES.has(singleType)
          ? [
              "top-center",
              "bottom-center",
              // middle-left / middle-right drag the module-width axis.
              // The bar count is fixed by content, so the resulting width
              // is rounded to a valid ZPL ^BY moduleWidth (1..10) in
              // commitBarcodeWidthHeightTransform on release; during the
              // drag the bitmap stretches free-form for visual feedback.
              "middle-left",
              "middle-right",
            ]
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
    transformAnchorRef.current = (() => {
      if (!obj) return null;
      if (STACKED_2D_TYPES.has(obj.type)) {
        return {
          kind: "row",
          nodeHeight: node.height(),
          rowHeight: (obj.props as { rowHeight: number }).rowHeight,
        };
      }
      // Live moduleWidth snap only for unrotated 1D barcodes; rotated
      // R/B drag axis would need a separate width-pin model.
      if (
        BARCODE_1D_TYPES.has(obj.type) &&
        (obj.props as { rotation?: string }).rotation === "N"
      ) {
        // Konva Group .width() returns its attr (0 here); the visible
        // bbox comes from the children via getClientRect.
        const rect = node.getClientRect({ skipTransform: true });
        return {
          kind: "moduleWidth",
          nodeWidth: rect.width,
          moduleWidth: (obj.props as { moduleWidth: number }).moduleWidth,
        };
      }
      return null;
    })();
    // startBbox is captured lazily on the first boundBoxFunc call; Konva
    // passes those bboxes in the transformer's frame, which on rotated
    // parents differs from getClientRect's stage frame.
    transformStartBboxRef.current = null;
    othersSnapshotRef.current = captureOtherRects(stageRef.current, objects, singleId);
  };

  const boundBoxFunc = (oldBox: BoundingBox, newBox: BoundingBox): BoundingBox => {
    if (newBox.width < MIN_RESIZE_BOX_PX || newBox.height < MIN_RESIZE_BOX_PX) {
      return oldBox;
    }
    if (isUniformScale) newBox = forceSquareBox(oldBox, newBox);
    // When the canvas view is rotated, Konva's bbox semantics in this
    // callback no longer match an axis-aware snap / pin model; visual
    // bottom-edge becomes node-local-left etc. Skip the height snap,
    // object-snap and inactive-edge pin in that case and let Konva
    // resize natively. Stacked-2D row quantisation only matters when
    // not rotated anyway.
    //
    // Latent coord-frame mismatch: at viewRotation=0 the transformer-frame
    // bboxes (oldBox/newBox here, and the lazily-captured startBbox below)
    // coincide with stage coords, which is the same frame othersSnapshotRef
    // and labelRect use. Removing this early-return without first lifting
    // the others / labelRect snapshot into the transformer frame would
    // re-introduce the rotated-resize drift this whole block guards against.
    if (viewRotation !== 0) return newBox;
    const dotPx = scale / dpmm;
    if (!transformStartBboxRef.current) {
      transformStartBboxRef.current = {
        id: selectedIds[0] ?? "",
        x: oldBox.x,
        y: oldBox.y,
        width: oldBox.width,
        height: oldBox.height,
      };
    }
    const startBbox = transformStartBboxRef.current;
    let bbox = applyHeightSnap(oldBox, newBox, dotPx, transformAnchorRef.current);
    bbox = applyModuleWidthSnap(oldBox, bbox, transformAnchorRef.current);
    if (objectSnapEnabled && isFreeResize && startBbox) {
      const snapped = applyResizeObjectSnap(bbox, startBbox, othersSnapshotRef.current, labelRect);
      setGuides(snapped.guides);
      bbox = snapped.bbox;
    }
    if (startBbox) {
      const startBox: BoundingBox = {
        x: startBbox.x,
        y: startBbox.y,
        width: startBbox.width,
        height: startBbox.height,
        rotation: 0,
      };
      const activeEdges = deriveActiveEdges(startBbox, {
        id: startBbox.id,
        x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height,
      });
      bbox = pinInactiveEdges(bbox, startBox, activeEdges);
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
    const nodeHeight = node.height();
    node.scaleX(1);
    node.scaleY(1);
    const obj = findObjectById(getCurrentObjects(), singleId);
    if (!obj || isGroup(obj)) {
      cleanupTransformState();
      return;
    }
    const renderedXDots = pxToDots(node.x() - objectsOffsetX, scale, dpmm);
    const renderedYDots = pxToDots(node.y() - labelOffsetY, scale, dpmm);
    // For FT-anchored 1D barcodes, model.y is the bar baseline, which needs the
    // post-resize bar height to convert from the bbox top back. Pipe the
    // scaled height through the same snap() commitBarcodeWidthHeight-
    // Transform uses so the baseline math sees the *committed* value and
    // there's no 1-dot drift between the two pathways.
    const newBarHeightDots =
      obj.positionType === "FT" && BARCODE_1D_TYPES.has(obj.type)
        ? Math.max(1, snap(Math.round((obj.props as { height: number }).height * sy)))
        : undefined;
    // Invert per-type render offsets (e.g. QR's hardcoded +10 dot Y) so
    // the stored model position matches what each per-type
    // handleDragEnd / render path produces. Text/serial render at
    // obj.x/y directly, so they pass through unchanged.
    const modelPos = modelPositionFromRenderedTopLeft(
      obj,
      renderedXDots,
      renderedYDots,
      newBarHeightDots,
    );
    // Only apply snap when the resize actually moved the anchor handle.
    // Compare in *rendered* space; for types whose render path applies
    // a shift (text, QR, FT barcodes), comparing the rendered top-left
    // to obj.x/y directly always trips (shift ≠ 0 in baseline), so snap
    // fires on every anchored-corner resize and pulls the visible
    // corner to a grid point the user didn't ask for.
    const oldRendered = renderedTopLeftFromModel(obj);
    const pos = {
      x: positionDidMove(renderedXDots, oldRendered.x) ? snap(modelPos.x) : obj.x,
      y: positionDidMove(renderedYDots, oldRendered.y) ? snap(modelPos.y) : obj.y,
    };
    const commit = getEntry(obj.type)?.commitTransform;
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
