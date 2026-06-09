import { useRef, useEffect } from "react";
import type Konva from "konva";
import { pxToDots } from "../../../lib/coordinates";
import { getCurrentObjects } from "../../../store/labelStore";
import {
  BARCODE_1D_TYPES,
  STACKED_2D_TYPES,
  getEntry,
} from "../../../registry";
import type { LeafObject } from "../../../registry";
import type { ObjectChanges } from "../../../store/labelStore";
import { findObjectById, isGroup } from "../../../types/Group";
import {
  activeEdgesFromAnchorName,
  applyHeightSnap,
  applyModuleWidthSnap,
  applyUniformModuleSnap,
  computeNewModules,
  pinInactiveEdges,
  positionDidMove,
  forceSquareBox,
  type ActiveEdgeFlags,
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

interface UniformResizeArgs {
  obj: LeafObject;
  spec: { name: string; min: number; max: number };
  anchor: { nodeSize: number; modules: number; edges: ActiveEdgeFlags } | null;
  startRect: { x: number; y: number; width: number; height: number } | null;
  fallbackPos: { x: number; y: number };
  sx: number;
  sy: number;
  objectsOffsetX: number;
  labelOffsetY: number;
  scale: number;
  dpmm: number;
}

/** Pin the user-fixed corner via startRect + edges so the round-to-
 *  integer-modules on commit doesn't walk the anchor. */
function commitUniformModuleResize({
  obj,
  spec,
  anchor,
  startRect,
  fallbackPos,
  sx,
  sy,
  objectsOffsetX,
  labelOffsetY,
  scale,
  dpmm,
}: UniformResizeArgs): ObjectChanges {
  const current = (obj.props as unknown as Record<string, number>)[spec.name];
  if (typeof current !== "number" || !(current > 0))
    return { ...fallbackPos, props: {} };
  const newModules = computeNewModules(
    current,
    Math.min(sx, sy),
    spec.min,
    spec.max,
  );
  const props = { [spec.name]: newModules };
  if (!anchor || !startRect) return { ...fallbackPos, props };
  const sizeRatio = newModules / current;
  const newW = startRect.width * sizeRatio;
  const newH = startRect.height * sizeRatio;
  const renderedX = anchor.edges.left
    ? startRect.x + startRect.width - newW
    : startRect.x;
  const renderedY = anchor.edges.top
    ? startRect.y + startRect.height - newH
    : startRect.y;
  const model = modelPositionFromRenderedTopLeft(
    obj,
    pxToDots(renderedX - objectsOffsetX, scale, dpmm),
    pxToDots(renderedY - labelOffsetY, scale, dpmm),
  );
  return { x: model.x, y: model.y, props };
}

/** Pack a Konva clientRect into the SnapRect shape used by snap helpers. */
function toSnapRect(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
): SnapRect {
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
    const cr = n.getClientRect({
      skipShadow: true,
      skipStroke: true,
      relativeTo: stage,
    });
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
  const result = computeResizeSnap(
    draggedRect,
    others,
    activeEdges,
    undefined,
    labelRect,
    labelRect,
  );
  return {
    bbox: {
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height,
      rotation: bbox.rotation,
    },
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
  // Stage-frame node rect at uniform-2D drag start; commit uses it to
  // pin the anchor corner under rotated view too.
  const uniformStartRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // Anchor name at drag start; commit skips grid-snap on inactive axes
  // so the opposite corner stays put.
  const activeEdgesRef = useRef<ActiveEdgeFlags | null>(null);

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
  }, [
    selectedIds,
    selectedTypesKey,
    selectedSignature,
    stageRef,
    transformerRef,
    previewLocks,
  ]);

  const singleSelected =
    selectedIds.length === 1
      ? objects.find((o) => o.id === selectedIds[0])
      : undefined;
  const resizeEnabled = selectedIds.length <= 1 && !singleSelected?.locked;
  const singleType = singleSelected?.type ?? "";
  const typeEntry = getEntry(singleType);
  const uniformScaleDef = typeEntry?.uniformScale;
  // uniformScaleProp implies uniformScale: integer-module 2D symbology
  // is square by construction, so the registry doesn't need to set both.
  const isUniformScale =
    !!typeEntry?.uniformScaleProp ||
    (typeof uniformScaleDef === "function"
      ? !!singleSelected &&
        !isGroup(singleSelected) &&
        uniformScaleDef(singleSelected.props as object)
      : !!uniformScaleDef);
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
    uniformStartRectRef.current = null;
    activeEdgesRef.current = null;
    setGuides([]);
  }

  const onTransformStart = () => {
    const singleId = selectedIds[0];
    if (!singleId || !stageRef.current) return;
    const node = stageRef.current.findOne<Konva.Node>(`#${singleId}`);
    if (!node) return;
    const obj = objects.find((o) => o.id === singleId);
    activeEdgesRef.current = activeEdgesFromAnchorName(
      transformerRef.current?.getActiveAnchor() ?? null,
    );
    transformAnchorRef.current = (() => {
      if (!obj) return null;
      if (STACKED_2D_TYPES.has(obj.type)) {
        // Group .height/.width return their attrs (0); without the rect
        // read the snap guards early-return on 0 and the drag drifts on
        // commit.
        const rect = node.getClientRect({
          skipTransform: true,
          skipStroke: true,
          skipShadow: true,
        });
        return {
          kind: "row",
          nodeHeight: rect.height,
          rowHeight: (obj.props as { rowHeight: number }).rowHeight,
          nodeWidth: rect.width,
          moduleWidth: (obj.props as { moduleWidth: number }).moduleWidth,
        };
      }
      const uniformProp = getEntry(obj.type)?.uniformScaleProp;
      if (uniformProp) {
        const rect = node.getClientRect({
          skipTransform: true,
          skipStroke: true,
          skipShadow: true,
        });
        const modules = (obj.props as unknown as Record<string, number>)[
          uniformProp.name
        ];
        const edges = activeEdgesRef.current;
        if (
          typeof modules === "number" &&
          modules > 0 &&
          rect.width > 0 &&
          edges
        ) {
          uniformStartRectRef.current = node.getClientRect({
            skipShadow: true,
            skipStroke: true,
            relativeTo: stageRef.current ?? undefined,
          });
          return {
            kind: "uniformModule",
            nodeSize: rect.width,
            modules,
            min: uniformProp.min,
            max: uniformProp.max,
            edges,
          };
        }
      }
      // Live moduleWidth snap only for unrotated 1D barcodes; rotated
      // R/B drag axis would need a separate width-pin model.
      if (
        BARCODE_1D_TYPES.has(obj.type) &&
        (obj.props as { rotation?: string }).rotation === "N"
      ) {
        // Konva Group .width() returns its attr (0 here); the visible
        // bbox comes from the children via getClientRect.
        const rect = node.getClientRect({
          skipTransform: true,
          skipStroke: true,
          skipShadow: true,
        });
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
    othersSnapshotRef.current = captureOtherRects(
      stageRef.current,
      objects,
      singleId,
    );
  };

  const boundBoxFunc = (
    oldBox: BoundingBox,
    newBox: BoundingBox,
  ): BoundingBox => {
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
    let bbox = applyHeightSnap(
      oldBox,
      newBox,
      dotPx,
      transformAnchorRef.current,
    );
    bbox = applyModuleWidthSnap(oldBox, bbox, transformAnchorRef.current);
    bbox = applyUniformModuleSnap(oldBox, bbox, transformAnchorRef.current);
    // Quantised types skip object-snap: a sub-module neighbour-pixel
    // alignment breaks the integer-module commit and the post-render
    // bitmap drifts off the anchor.
    const hasQuantisedAnchor = transformAnchorRef.current !== null;
    if (objectSnapEnabled && isFreeResize && startBbox && !hasQuantisedAnchor) {
      const snapped = applyResizeObjectSnap(
        bbox,
        startBbox,
        othersSnapshotRef.current,
        labelRect,
      );
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
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
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
        ? Math.max(
            1,
            snap(Math.round((obj.props as { height: number }).height * sy)),
          )
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
    // Grid-snap an axis only when the user grabbed an edge on it; an
    // inactive-axis snap walks the anchored opposite corner. Without
    // anchor info, fall back to bbox-diff via positionDidMove.
    const oldRendered = renderedTopLeftFromModel(obj);
    const edges = activeEdgesRef.current;
    const snapAxis = (axis: "x" | "y") => {
      const rendered = axis === "x" ? renderedXDots : renderedYDots;
      const old = axis === "x" ? oldRendered.x : oldRendered.y;
      const model = axis === "x" ? modelPos.x : modelPos.y;
      const objVal = axis === "x" ? obj.x : obj.y;
      if (edges) {
        const axisMoved =
          axis === "x" ? edges.left || edges.right : edges.top || edges.bottom;
        return axisMoved ? model : objVal;
      }
      return positionDidMove(rendered, old) ? snap(model) : objVal;
    };
    const pos = { x: snapAxis("x"), y: snapAxis("y") };
    const entry = getEntry(obj.type);
    if (entry?.uniformScaleProp) {
      const uniformAnchor =
        transformAnchorRef.current?.kind === "uniformModule"
          ? transformAnchorRef.current
          : null;
      const update = commitUniformModuleResize({
        obj,
        spec: entry.uniformScaleProp,
        anchor: uniformAnchor,
        startRect: uniformStartRectRef.current,
        fallbackPos: pos,
        sx,
        sy,
        objectsOffsetX,
        labelOffsetY,
        scale,
        dpmm,
      });
      updateObject(singleId, update);
      cleanupTransformState();
      return;
    }
    const commit = entry?.commitTransform;
    if (commit) {
      // uniformModule anchors short-circuit above; the row/moduleWidth
      // commit context only narrows those two kinds.
      const ctxAnchor =
        transformAnchorRef.current?.kind === "uniformModule"
          ? null
          : transformAnchorRef.current;
      const propChanges = commit(obj, {
        sx,
        sy,
        snap,
        nodeHeight,
        anchor: ctxAnchor,
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
