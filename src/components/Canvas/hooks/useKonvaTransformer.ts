import { useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import type Konva from "konva";
import { dotsToPx, pxToDots } from "../../../lib/coordinates";
import { blockBoundsDots, blockGlyphAnchorPoint, blockReflowGeometry, tbBoundsDots, tbReflowGeometry, type BlockJustify, type ZplRotation } from "../../../lib/zebraTextLayout";
import { getCurrentObjects, useLabelStore } from "../../../store/labelStore";
import {
  BARCODE_1D_TYPES,
  STACKED_2D_TYPES,
  getEntry,
} from "../../../registry";
import type { LeafObject } from "../../../registry";
import { resolveBlockResizeMode } from "../../../registry/transformHelpers";
import { resolveTextMode, type TextProps } from "../../../registry/text";
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
  /** Center-justified glyph blocks scale from the center so the box grows
   *  symmetrically and tracks the centered text live. */
  centeredScaling: boolean;
  onTransformStart: () => void;
  onTransform: () => void;
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
  // Block node rect at glyph-mode drag start (unrotated view only); commit
  // re-measures with the baked font to pin the stable point, so a justified
  // block doesn't jump when the font re-justifies in the same width.
  const glyphBlockStartRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Active only while a ^FB block is being live-reflowed (frame mode): the
  // block re-wraps as blockWidth/blockLines change each tick instead of the
  // group scaling. Captures the fixed (anchored) edges so the opposite side
  // stays put. Null for every other transform.
  const liveReflowRef = useRef<{
    mode: "fb" | "tb";
    edges: ActiveEdgeFlags | null;
    rotation: "N" | "R" | "I" | "B";
    lineSpacing: number;
    fontHeight: number;
    leftX: number;
    topY: number;
    rightX: number;
    bottomY: number;
    // Pre-drag model snapshot + a dirty flag, so the per-tick (untracked) store
    // writes collapse into a single undo entry on release. blockLines is the
    // ^FB second axis; blockHeight the ^TB one.
    snapshot: { x: number; y: number; blockWidth: number; blockLines: number; blockHeight: number };
    changed: boolean;
  } | null>(null);

  // Box/ellipse reflow per tick so stroke inset and corners stay correct under
  // raw scale; snapshot + dirty flag collapse the writes into one undo entry.
  const shapeReflowRef = useRef<{
    snapshot: { x: number; y: number; width: number; height: number };
    changed: boolean;
  } | null>(null);

  // Block resize mode resolved once at drag start (panel mode + Alt). Reused at
  // commit so toggling Alt mid-drag can't make start and end disagree.
  const blockResizeModeRef = useRef<"frame" | "glyph">("frame");

  // Alt held at drag release flips the block resize mode for that one drag.
  const altKeyRef = useRef(false);
  useEffect(() => {
    const sync = (e: KeyboardEvent) => { altKeyRef.current = e.altKey; };
    // Reset on blur: a keyup during Alt+Tab never fires, so the ref would stick.
    const clear = () => { altKeyRef.current = false; };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // A live reflow pauses undo recording on drag start and resumes in
  // onTransformEnd. If we unmount mid-drag, transformend never fires, so resume
  // here too or undo would stay silently disabled app-wide. resume() is an
  // idempotent set, so the no-active-drag case is a harmless no-op.
  useEffect(() => {
    return () => {
      if (liveReflowRef.current || shapeReflowRef.current) {
        useLabelStore.temporal.getState().resume();
      }
    };
  }, []);

  // Stable key of selected object types, avoids re-running on every drag-move
  // position update (which changes objects but not the types of selected objects).
  const selectedTypesKey = selectedIds
    .map((id) => objects.find((o) => o.id === id)?.type ?? "")
    .join(",");

  // Signature of the selected objects' size-relevant props. Changes after
  // commitTransform → forces the transformer to re-measure the attached node
  // so its bounding box matches the new rendered size. Position is excluded:
  // moves don't change bbox dimensions, and Konva tracks the node's position
  // automatically. Lock state is included so toggling lock re-runs the attach
  // effect (locked nodes detach; unlocked nodes re-attach).
  const selectedSignature = selectedIds
    .map((id) => {
      const o = objects.find((obj) => obj.id === id);
      return o ? `${id}:${o.locked ? "L" : ""}:${JSON.stringify(o.props)}` : id;
    })
    .join("|");

  // Toggling the block drag mode swaps the measured frame rect on/off, so the
  // transformer must re-measure even though no object prop changed.
  const blockDragMode = useLabelStore((s) => s.blockDragMode);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    // During a live reflow the per-tick store update re-runs this effect;
    // re-attaching (.nodes()) mid-drag aborts the gesture, so skip it. The
    // reflow handler keeps the transformer in sync via forceUpdate().
    if (liveReflowRef.current || shapeReflowRef.current) return;
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
      // Multi-select has no resize/rotate anchors and its frame is drawn from
      // selectionUnionDots (model bounds) to match the snap borders. Detach the
      // transformer so it doesn't also draw a disagreeing client-rect frame
      // (fat diagonals, barcode HRI, etc.).
      transformerRef.current.nodes([]);
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
    blockDragMode,
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

  // The commit reuses this exact value (not a re-derivation) so the anchor pin
  // can't disagree with the preview when Alt flips the mode this prop can't see.
  const centeredScaling =
    !!singleSelected &&
    !isGroup(singleSelected) &&
    singleSelected.type === "text" &&
    !!(singleSelected.props as { blockWidth?: number }).blockWidth &&
    resolveBlockResizeMode(blockDragMode, false) === "glyph" &&
    (singleSelected.props as { blockJustify?: BlockJustify }).blockJustify === "C";

  /** Reset all transform-time state. Idempotent; safe to call from any exit path. */
  function cleanupTransformState() {
    transformAnchorRef.current = null;
    transformStartBboxRef.current = null;
    othersSnapshotRef.current = [];
    uniformStartRectRef.current = null;
    activeEdgesRef.current = null;
    liveReflowRef.current = null;
    shapeReflowRef.current = null;
    glyphBlockStartRectRef.current = null;
    blockResizeModeRef.current = "frame";
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
    // Live-reflow setup: a frame-mode ^FB block (any rotation) re-wraps during
    // the drag instead of scaling. Capture the fixed edges so the anchored
    // side stays put while blockWidth/blockLines change.
    liveReflowRef.current = null;
    if (obj && !isGroup(obj) && obj.type === "text") {
      const bp = obj.props as {
        blockWidth?: number;
        blockLines?: number;
        blockLineSpacing?: number;
        blockHeight?: number;
        fontHeight: number;
        rotation: string;
      };
      // Alt is sampled once at drag start to pick the mode for the whole
      // gesture; toggling it mid-drag intentionally does not switch frame/glyph.
      blockResizeModeRef.current = resolveBlockResizeMode(
        useLabelStore.getState().blockDragMode,
        altKeyRef.current,
      );
      const frameMode = blockResizeModeRef.current === "frame";
      // ^FB and ^TB both reflow live in frame mode (no glyph stretch); the only
      // difference is the second axis (^FB lines vs ^TB clip height).
      const tbMode = resolveTextMode(obj.props as TextProps) === "tb";
      if (bp.blockWidth && bp.blockWidth > 0 && frameMode) {
        const rot = (["N", "R", "I", "B"].includes(bp.rotation)
          ? bp.rotation
          : "N") as "N" | "R" | "I" | "B";
        const blockHeight = bp.blockHeight ?? bp.fontHeight;
        const b0 = tbMode
          ? tbBoundsDots(bp.blockWidth, blockHeight, rot)
          : blockBoundsDots({
              blockWidthDots: bp.blockWidth,
              blockLines: bp.blockLines ?? 1,
              blockLineSpacing: bp.blockLineSpacing ?? 0,
              fontHeight: bp.fontHeight,
              rotation: rot,
            });
        const x0 = node.x() + dotsToPx(b0.x, scale, dpmm);
        const y0 = node.y() + dotsToPx(b0.y, scale, dpmm);
        liveReflowRef.current = {
          mode: tbMode ? "tb" : "fb",
          edges: activeEdgesRef.current,
          rotation: rot,
          lineSpacing: bp.blockLineSpacing ?? 0,
          fontHeight: bp.fontHeight,
          leftX: x0,
          topY: y0,
          rightX: x0 + dotsToPx(b0.width, scale, dpmm),
          bottomY: y0 + dotsToPx(b0.height, scale, dpmm),
          snapshot: {
            x: obj.x,
            y: obj.y,
            blockWidth: bp.blockWidth,
            blockLines: bp.blockLines ?? 1,
            blockHeight,
          },
          changed: false,
        };
        // Per-tick store writes during the drag would each land in the undo
        // history; pause recording and collapse to one entry on release.
        useLabelStore.temporal.getState().pause();
      } else if (!frameMode && (bp.blockWidth ?? 0) > 0 && viewRotation === 0) {
        // Glyph mode bakes on end: capture the start rect so commit can re-pin
        // the stable point after the font re-justifies.
        glyphBlockStartRectRef.current = node.getClientRect({
          relativeTo: stageRef.current ?? undefined,
          skipStroke: true,
          skipShadow: true,
        });
      }
    }
    // Free-resize shapes reflow live (see onTransform): pause undo so the
    // per-tick writes collapse into one entry on release.
    if (obj && !isGroup(obj) && (obj.type === "box" || obj.type === "ellipse")) {
      const sp = obj.props as { width: number; height: number };
      shapeReflowRef.current = {
        snapshot: { x: obj.x, y: obj.y, width: sp.width, height: sp.height },
        changed: false,
      };
      useLabelStore.temporal.getState().pause();
    }
  };

  // Per-tick live reflow for a frame-mode ^FB block: convert the group scale
  // into blockWidth/blockLines, re-wrap via a synchronous store update, reset
  // the scale, re-pin the anchored edge, and re-baseline the handles. Keeps
  // glyphs constant and justify correct because the content actually re-renders.
  const onTransform = () => {
    if (selectedIds.length !== 1 || !stageRef.current) return;
    const id = selectedIds[0];
    if (!id) return;
    const node = stageRef.current.findOne<Konva.Node>(`#${id}`);
    if (!node) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3) return;
    const cur = findObjectById(getCurrentObjects(), id);
    if (!cur || isGroup(cur)) return;
    const lr = liveReflowRef.current;
    if (lr) {
      const cp = cur.props as { blockWidth?: number; blockLines?: number; blockHeight?: number };
      const common = {
        scaleX: sx,
        scaleY: sy,
        rotation: lr.rotation,
        blockWidthDots: cp.blockWidth ?? 1,
        activeLeft: lr.edges?.left ?? false,
        activeTop: lr.edges?.top ?? false,
        leftX: lr.leftX,
        topY: lr.topY,
        rightX: lr.rightX,
        bottomY: lr.bottomY,
        scale,
        dpmm,
        objectsOffsetX,
        labelOffsetY,
      };
      const geo =
        lr.mode === "tb"
          ? (() => {
              const g = tbReflowGeometry({ ...common, blockHeightDots: cp.blockHeight ?? lr.fontHeight });
              return { ...g, props: { blockWidth: g.blockWidthDots, blockHeight: g.blockHeightDots } };
            })()
          : (() => {
              const g = blockReflowGeometry({
                ...common,
                blockLines: cp.blockLines ?? 1,
                blockLineSpacing: lr.lineSpacing,
                fontHeight: lr.fontHeight,
              });
              return { ...g, props: { blockWidth: g.blockWidthDots, blockLines: g.blockLines } };
            })();
      flushSync(() => {
        updateObject(id, {
          x: geo.modelXDots,
          y: geo.modelYDots,
          props: geo.props,
        });
      });
      lr.changed = true;
      node.scaleX(1);
      node.scaleY(1);
      node.x(geo.targetXPx);
      node.y(geo.targetYPx);
      transformerRef.current?.forceUpdate();
      return;
    }

    // Box/ellipse: bake the group scale into width/height each tick for correct
    // stroke inset; dims stay float until release to avoid per-tick rounding drift.
    const sr = shapeReflowRef.current;
    if (sr) {
      const sp = cur.props as { width: number; height: number; lockAspect?: boolean };
      // boundBoxFunc is skipped during reflow, so a locked circle enforces its
      // own uniform scale here, matching the ellipse commit's min-axis collapse.
      const [scaleW, scaleH] = sp.lockAspect
        ? [Math.min(sx, sy), Math.min(sx, sy)]
        : [sx, sy];
      const newW = Math.max(1, sp.width * scaleW);
      const newH = Math.max(1, sp.height * scaleH);
      // Konva already pinned the anchored edge via node.x/y; commit that, then
      // re-pin from the same dots so node and store agree after the re-render.
      const xDots = pxToDots(node.x() - objectsOffsetX, scale, dpmm);
      const yDots = pxToDots(node.y() - labelOffsetY, scale, dpmm);
      flushSync(() => {
        updateObject(id, { x: xDots, y: yDots, props: { width: newW, height: newH } });
      });
      sr.changed = true;
      node.scaleX(1);
      node.scaleY(1);
      node.x(objectsOffsetX + dotsToPx(xDots, scale, dpmm));
      node.y(labelOffsetY + dotsToPx(yDots, scale, dpmm));
      transformerRef.current?.forceUpdate();
    }
  };

  const boundBoxFunc = (
    oldBox: BoundingBox,
    newBox: BoundingBox,
  ): BoundingBox => {
    if (newBox.width < MIN_RESIZE_BOX_PX || newBox.height < MIN_RESIZE_BOX_PX) {
      return oldBox;
    }
    // The text-block reflow re-pins from its own captured edges, so the snap /
    // inactive-edge pin below would fight it; skip entirely.
    if (liveReflowRef.current) return newBox;
    // Locked-circle reflow needs forceSquareBox so Konva keeps sx==sy; node and
    // reflow only agree when the bbox stays square. Snap/pin below is free-axis only.
    if (shapeReflowRef.current && isUniformScale) {
      return forceSquareBox(oldBox, newBox);
    }
    // Free-resize shapes fall through: object-snap + inactive-edge pin still
    // apply (reflow pins from the same node position), keeping edge snapping.
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
    // Live reflow applied blockWidth/blockLines + position each tick while undo
    // recording was paused. Collapse the whole drag into one history entry:
    // restore the pre-drag snapshot (still paused), resume, then re-apply the
    // final geometry as a single tracked change.
    const lr = liveReflowRef.current;
    if (lr) {
      const id = selectedIds[0];
      // A final tick that early-returned (e.g. node briefly unresolved) can
      // leave a residual scale; reset it so the box doesn't stay stretched.
      const lrNode = id ? stageRef.current?.findOne<Konva.Node>(`#${id}`) : null;
      lrNode?.scaleX(1);
      lrNode?.scaleY(1);
      const cur = id ? findObjectById(getCurrentObjects(), id) : undefined;
      const temporal = useLabelStore.temporal.getState();
      // try/finally so a throw can't leave undo paused (resume is idempotent).
      try {
        if (lr.changed && id && cur && !isGroup(cur)) {
          const cp = cur.props as { blockWidth?: number; blockLines?: number; blockHeight?: number };
          // ^TB collapses width + clip height; ^FB width + line count.
          const secondAxis = lr.mode === "tb"
            ? { blockHeight: cp.blockHeight }
            : { blockLines: cp.blockLines };
          const snapAxis = lr.mode === "tb"
            ? { blockHeight: lr.snapshot.blockHeight }
            : { blockLines: lr.snapshot.blockLines };
          const final = {
            x: cur.x,
            y: cur.y,
            props: { blockWidth: cp.blockWidth, ...secondAxis },
          };
          updateObject(id, {
            x: lr.snapshot.x,
            y: lr.snapshot.y,
            props: {
              blockWidth: lr.snapshot.blockWidth,
              ...snapAxis,
            },
          });
          temporal.resume();
          updateObject(id, final);
        }
      } finally {
        temporal.resume();
        cleanupTransformState();
      }
      return;
    }
    // Shape live reflow: same collapse-to-one-entry as the text block. Dims were
    // kept float during the drag; round + snap them once here for the commit.
    const sr = shapeReflowRef.current;
    if (sr) {
      const id = selectedIds[0];
      const srNode = id ? stageRef.current?.findOne<Konva.Node>(`#${id}`) : null;
      srNode?.scaleX(1);
      srNode?.scaleY(1);
      const cur = id ? findObjectById(getCurrentObjects(), id) : undefined;
      const temporal = useLabelStore.temporal.getState();
      // try/finally so a throw can't leave undo paused (resume is idempotent).
      try {
        if (sr.changed && id && cur && !isGroup(cur)) {
          const sp = cur.props as { width: number; height: number };
          // Same snap/round/clamp contract as commitWidthHeightTransform, applied
          // to the already-baked float dims.
          const width = Math.max(1, snap(Math.round(sp.width)));
          const height = Math.max(1, snap(Math.round(sp.height)));
          // Pin the anchored edge: when dragging left/top, derive x/y from the
          // snapped size so the opposite edge doesn't walk by the snap delta.
          const edges = activeEdgesRef.current;
          const final = {
            x: Math.round(edges?.left ? cur.x + sp.width - width : cur.x),
            y: Math.round(edges?.top ? cur.y + sp.height - height : cur.y),
            props: { width, height },
          };
          updateObject(id, {
            x: sr.snapshot.x,
            y: sr.snapshot.y,
            props: { width: sr.snapshot.width, height: sr.snapshot.height },
          });
          temporal.resume();
          updateObject(id, final);
        }
      } finally {
        temporal.resume();
        cleanupTransformState();
      }
      return;
    }
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
        resizeMode: blockResizeModeRef.current,
      });
      const start = glyphBlockStartRectRef.current;
      if (
        obj.type === "text" &&
        ((obj.props as { blockWidth?: number }).blockWidth ?? 0) > 0 &&
        blockResizeModeRef.current === "glyph" &&
        start
      ) {
        // Bake the font, re-measure the ink, and pin the stable point (via
        // blockGlyphAnchorPoint) so a justified block doesn't drift on release.
        const fp = obj.props as {
          fontWidth: number;
          fontHeight: number;
          rotation: ZplRotation;
          blockJustify?: BlockJustify;
        };
        const temporal = useLabelStore.temporal.getState();
        // try/finally so a throw from flushSync/getClientRect can't leave undo
        // recording globally paused (resume is idempotent).
        temporal.pause();
        try {
          // Konva left the node at the drag position; the font-only commit does
          // not change x/y so react-konva won't reset it. Move it back to the
          // model origin so the re-measure reflects the block at obj.x/y.
          node.x(objectsOffsetX + dotsToPx(obj.x, scale, dpmm));
          node.y(labelOffsetY + dotsToPx(obj.y, scale, dpmm));
          flushSync(() => updateObject(singleId, { props: propChanges }));
          const newRect = node.getClientRect({
            relativeTo: stageRef.current ?? undefined,
            skipStroke: true,
            skipShadow: true,
          });
          const edges = activeEdgesRef.current;
          const justify = fp.blockJustify ?? "L";
          const anchorArgs = { rotation: fp.rotation, justify, edges, centeredStacking: centeredScaling };
          const startA = blockGlyphAnchorPoint({ rect: start, ...anchorArgs });
          const newA = blockGlyphAnchorPoint({ rect: newRect, ...anchorArgs });
          const model = modelPositionFromRenderedTopLeft(
            obj,
            pxToDots(node.x() + (startA.x - newA.x) - objectsOffsetX, scale, dpmm),
            pxToDots(node.y() + (startA.y - newA.y) - labelOffsetY, scale, dpmm),
          );
          // Restore pre-drag state while paused, resume, then apply the final as
          // one tracked change so undo records pre-drag -> final once.
          updateObject(singleId, {
            x: obj.x,
            y: obj.y,
            props: { fontWidth: fp.fontWidth, fontHeight: fp.fontHeight },
          });
          temporal.resume();
          updateObject(singleId, { x: model.x, y: model.y, props: propChanges });
        } finally {
          temporal.resume();
          cleanupTransformState();
        }
        return;
      }
      updateObject(singleId, { ...pos, props: propChanges });
    }
    cleanupTransformState();
  };

  return {
    rotateEnabled: false,
    resizeEnabled,
    enabledAnchors,
    centeredScaling,
    onTransformStart,
    onTransform,
    boundBoxFunc,
    onTransformEnd,
  };
}
