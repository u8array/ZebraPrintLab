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
  barcodeHeightReflowGeometry,
  barcodeMwReflowGeometry,
  computeNewModules,
  pinAnchoredEdge,
  pinInactiveEdges,
  positionDidMove,
  forceAspectBox,
  shrinkingBelowFloor,
  type ActiveEdgeFlags,
  type BarcodeHeightReflowStart,
  type BarcodeMwReflowStart,
  type BoundingBox,
  type TransformAnchor,
} from "../transformerGeometry";
import {
  committedUprightBarDots,
  modelPositionFromRenderedTopLeft,
  renderedTopLeftFromModel,
} from "../transformPosition";
import { isBarcode } from "../../../lib/objectBounds";
import { isAxisSwapped, objectRotation } from "../../../registry/rotation";
import { getMeasuredSnapshot } from "../measuredBoundsCache";
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
  // Uniform resize scales both axes by sizeRatio (clamped via newModules), so an
  // FT barcode's anchor inversion uses the committed post-resize bar size. For a
  // QR the firmware shift scales with magnification, so pass the committed value
  // (newModules) too, else the inverse uses the old shift and the code jumps.
  // Pass undefined (not 0) when a dim isn't cached so the downstream nullish
  // fallback applies instead of being defeated by a 0.
  const cache = getMeasuredSnapshot().get(obj.id);
  const uprightW = cache?.uprightBarWDots;
  const uprightH = cache?.uprightBarHDots;
  const model = modelPositionFromRenderedTopLeft(
    obj,
    pxToDots(renderedX - objectsOffsetX, scale, dpmm),
    pxToDots(renderedY - labelOffsetY, scale, dpmm),
    uprightW !== undefined ? uprightW * sizeRatio : undefined,
    uprightH !== undefined ? uprightH * sizeRatio : undefined,
    newModules,
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
  /** Shared Ctrl/Cmd bypass state (useSnapBypassRef). boundBoxFunc receives no
   *  native event, so the held modifier arrives via this ref. */
  snapBypassRef: React.RefObject<boolean>;
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

/** Pre-drag snapshot + collapsed final for a one-entry reflow commit, or null
 *  when the drag baked nothing. */
type ReflowCommit = { restore: ObjectChanges; final: ObjectChanges } | null;

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
  snapBypassRef,
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

  // 1D barcode live reflow, both resize axes: the moduleWidth axis re-renders
  // on each integer module crossing, the bar-height axis on each integer dot,
  // so bars, HRI and text zone always draw at their true size instead of
  // stretching the old bitmap until release.
  const barcodeReflowRef = useRef<
    | (BarcodeMwReflowStart & {
        mode: "mw";
        uprightW0: number;
        uprightH0: number;
        snapshot: { x: number; y: number; moduleWidth: number; height?: number };
        changed: boolean;
      })
    | (BarcodeHeightReflowStart & {
        mode: "height";
        uprightW0: number;
        snapshot: { x: number; y: number; height: number };
        changed: boolean;
      })
    | null
  >(null);

  // True while any live reflow (text block, shape, or barcode) owns the drag.
  const anyReflowActive = () =>
    liveReflowRef.current !== null ||
    shapeReflowRef.current !== null ||
    barcodeReflowRef.current !== null;

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
      if (anyReflowActive()) {
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
    if (anyReflowActive()) return;
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
  // uniformScaleProp implies uniformScale: integer-module 2D symbology scales
  // both axes together (square, or fixed-aspect rectangular DataMatrix), so
  // the registry doesn't need to set both.
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
              // The screen handles map to the bar axes by rotation: for N/I
              // middle-left/right is the moduleWidth axis, for R/B it's
              // top/bottom-center (the bars turn a quarter). The live snap
              // rounds whichever screen axis carries moduleWidth to a valid ^BY
              // value (1..10) on release; mid-drag the bitmap stretches free.
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
    barcodeReflowRef.current = null;
    glyphBlockStartRectRef.current = null;
    blockResizeModeRef.current = "frame";
    setGuides([]);
  }

  /** Collapse a paused live-reflow drag into one undo entry: reset any residual
   *  node scale, and when the drag baked something (`commit` non-null), restore
   *  the pre-drag snapshot while still paused, resume, then re-apply the final
   *  geometry as a single tracked change. Always resumes + cleans up, even on a
   *  throw (resume is idempotent). */
  function collapseReflowToOneEntry(
    id: string | undefined,
    commit: ReflowCommit,
  ) {
    const node = id ? stageRef.current?.findOne<Konva.Node>(`#${id}`) : null;
    node?.scaleX(1);
    node?.scaleY(1);
    const temporal = useLabelStore.temporal.getState();
    try {
      if (id && commit) {
        updateObject(id, commit.restore);
        temporal.resume();
        updateObject(id, commit.final);
      }
    } finally {
      temporal.resume();
      cleanupTransformState();
    }
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
          moduleWidthMin: getEntry(obj.type)?.moduleWidthMin ?? 1,
          rotation: objectRotation(obj.props),
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
            nodeHeight: rect.height,
            modules,
            min: uniformProp.min,
            max: uniformProp.max,
            edges,
          };
        }
      }
      // Live moduleWidth snap for 1D barcodes, all rotations: quantise the
      // moduleWidth axis (screen width for N/I, screen height for R/B) so
      // overshoot is blocked and the anchored edge stays put, like N.
      if (BARCODE_1D_TYPES.has(obj.type)) {
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
          nodeHeight: rect.height,
          moduleWidth: (obj.props as { moduleWidth: number }).moduleWidth,
          rotation: objectRotation(obj.props),
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
    // 1D live reflow, armed per grabbed axis. Needs the measured footprint for
    // the start box; an unmeasured barcode falls back to bake-on-end. View
    // rotation is safe: node coords, anchor-name edges and the model inversion
    // live in the unrotated parent frame, and the per-tick pin stands in for
    // boundBoxFunc's band snap, which bails under rotation.
    barcodeReflowRef.current = null;
    if (obj && !isGroup(obj) && BARCODE_1D_TYPES.has(obj.type)) {
      const edges = activeEdgesRef.current;
      const rot = objectRotation(obj.props);
      const swapped = isAxisSwapped(rot);
      const cache = getMeasuredSnapshot().get(singleId);
      const p = obj.props as { moduleWidth?: number; height?: number };
      if (edges && cache) {
        const leftX = node.x();
        const topY = node.y();
        const box = {
          leftX,
          topY,
          rightX: leftX + dotsToPx(cache.width, scale, dpmm),
          bottomY: topY + dotsToPx(cache.height, scale, dpmm),
        };
        const uprightH0 = cache.uprightBarHDots ?? p.height ?? 0;
        const mwAxisActive = swapped ? edges.top || edges.bottom : edges.left || edges.right;
        const heightAxisActive = swapped ? edges.left || edges.right : edges.top || edges.bottom;
        if (mwAxisActive && typeof p.moduleWidth === "number" && p.moduleWidth > 0) {
          barcodeReflowRef.current = {
            mode: "mw",
            rotation: rot,
            edges,
            ...box,
            mw0: p.moduleWidth,
            uprightW0: cache.uprightBarWDots ?? 0,
            uprightH0,
            // height rides along: normalizeChanges may re-clamp it as a side
            // effect of the per-tick moduleWidth writes (code49), and the undo
            // baseline must restore that too.
            snapshot: { x: obj.x, y: obj.y, moduleWidth: p.moduleWidth, height: p.height },
            changed: false,
          };
          useLabelStore.temporal.getState().pause();
        } else if (heightAxisActive && typeof p.height === "number" && p.height > 0 && uprightH0 > 0) {
          // The transformer frames the bars only, so per tick the bar height IS
          // the frame extent; the constant non-bar zone (HRI text, EAN guard
          // tails) is added back solely to pin the anchored bbox edge.
          const axisFootprintDots = swapped ? cache.width : cache.height;
          barcodeReflowRef.current = {
            mode: "height",
            rotation: rot,
            edges,
            ...box,
            zonePx: Math.max(0, dotsToPx(axisFootprintDots - uprightH0, scale, dpmm)),
            uprightW0: cache.uprightBarWDots ?? 0,
            snapshot: { x: obj.x, y: obj.y, height: p.height },
            changed: false,
          };
          useLabelStore.temporal.getState().pause();
        }
      }
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

    // 1D barcode reflow: bake the next size step the moment the frame crosses
    // it, so bars, HRI and text zone re-render at their true size instead of
    // stretching. The moduleWidth axis quantises from the TOTAL drag extent
    // (same inputs as the box snap) because rendered pixel widths are stepwise
    // in moduleWidth; an incremental-scale quantiser would oscillate wherever
    // adjacent module widths render at the same pixel width.
    const br = barcodeReflowRef.current;
    if (br) {
      const swapped = isAxisSwapped(br.rotation);
      const natural = node.getClientRect({
        skipTransform: true,
        skipStroke: true,
        skipShadow: true,
      });
      if (br.mode === "mw") {
        const mwCurrent = (cur.props as { moduleWidth?: number }).moduleWidth;
        if (typeof mwCurrent !== "number" || !(mwCurrent > 0)) return;
        const frameExtentPx = swapped ? natural.height * sy : natural.width * sx;
        const geo = barcodeMwReflowGeometry(br, frameExtentPx);
        if (!geo) return;
        const crossed = geo.moduleWidth !== mwCurrent;
        if (crossed) {
          const ratio = geo.moduleWidth / br.mw0;
          // Same inversion as the end commit for the ACTIVE axis; the anchored
          // axis keeps its pre-drag model value (mirrors the end commit's
          // snapAxis), else the bar-zone offset (above-HRI, rotated EAN) that
          // the FO inversion ignores would corrupt the stored anchor coordinate.
          const model = modelPositionFromRenderedTopLeft(
            cur,
            pxToDots(geo.targetXPx - objectsOffsetX, scale, dpmm),
            pxToDots(geo.targetYPx - labelOffsetY, scale, dpmm),
            br.uprightW0 * ratio,
            br.uprightH0,
          );
          flushSync(() => {
            updateObject(id, {
              x: swapped ? br.snapshot.x : model.x,
              y: swapped ? model.y : br.snapshot.y,
              props: { moduleWidth: geo.moduleWidth },
            });
          });
          br.changed = true;
        }
        // Pin every tick, not just on crossings: the reflow is the sole band
        // pin, so the raster holds in rotated views where boundBoxFunc bails.
        // The residual fits the re-rendered content into the linear frame (1
        // when pixels-per-module are exact). Only a crossing re-renders, so
        // mid-band `natural` is still the current rect.
        const rendered = crossed
          ? node.getClientRect({ skipTransform: true, skipStroke: true, skipShadow: true })
          : natural;
        const renderedExtent = swapped ? rendered.height : rendered.width;
        const residual = renderedExtent > 0 ? geo.linearExtentPx / renderedExtent : 1;
        node.scaleX(swapped ? 1 : residual);
        node.scaleY(swapped ? residual : 1);
        node.x(geo.targetXPx);
        node.y(geo.targetYPx);
        transformerRef.current?.forceUpdate();
        return;
      }
      // Height axis, baked per integer dot. Route each tick through the registry
      // commit at identity scale (= clamp only) so per-type ranges hold mid-drag:
      // code49 must clamp into bwip's module window or the whole render errors.
      // The height re-render lands on the frame exactly, so the pin needs no
      // residual; the scale just resets to 1.
      const frameExtentPx = swapped ? natural.width * sx : natural.height * sy;
      const geo = barcodeHeightReflowGeometry(br, frameExtentPx);
      if (!geo) return;
      const newHeightDots = pxToDots(geo.barExtentPx, scale, dpmm);
      const hCurrent = (cur.props as { height?: number }).height;
      if (!(newHeightDots >= 1)) return;
      const commitFn = getEntry(cur.type)?.commitTransform;
      const candidate = { ...cur, props: { ...cur.props, height: newHeightDots } } as typeof cur;
      const committed = commitFn?.(candidate, {
        sx: 1,
        sy: 1,
        snap: (n: number) => n,
        nodeHeight: 0,
        anchor: null,
        resizeMode: blockResizeModeRef.current,
      }) as { height?: number } | undefined;
      const hNext = committed?.height ?? newHeightDots;
      const pin = barcodeHeightReflowGeometry(br, dotsToPx(hNext, scale, dpmm));
      if (!pin) return;
      if (hNext !== hCurrent) {
        const model = modelPositionFromRenderedTopLeft(
          cur,
          pxToDots(pin.targetXPx - objectsOffsetX, scale, dpmm),
          pxToDots(pin.targetYPx - labelOffsetY, scale, dpmm),
          br.uprightW0,
          hNext,
        );
        flushSync(() => {
          updateObject(id, {
            x: swapped ? model.x : br.snapshot.x,
            y: swapped ? br.snapshot.y : model.y,
            props: { height: hNext },
          });
        });
        br.changed = true;
      }
      // Pin every tick for the same reason as the mw axis: hold the node in
      // rotated views between dot bakes, else the anchored edge jitters.
      node.scaleX(1);
      node.scaleY(1);
      node.x(pin.targetXPx);
      node.y(pin.targetYPx);
      transformerRef.current?.forceUpdate();
      return;
    }

    // Box/ellipse: bake the group scale into width/height each tick. Rounding
    // into the store is drift-free because forceUpdate re-baselines to it each
    // tick, so the store dim times the live scale stays the true current size.
    const sr = shapeReflowRef.current;
    if (sr) {
      const sp = cur.props as { width: number; height: number; lockAspect?: boolean };
      // boundBoxFunc is skipped during reflow, so a locked circle enforces its
      // own uniform scale here, matching the ellipse commit's min-axis collapse.
      const [scaleW, scaleH] = sp.lockAspect
        ? [Math.min(sx, sy), Math.min(sx, sy)]
        : [sx, sy];
      const width = Math.max(1, Math.round(sp.width * scaleW));
      const height = Math.max(1, Math.round(sp.height * scaleH));
      // Pin the anchored edge from the snapshot (mirrors the end commit):
      // rebuilding it from a rounded node.x/y plus a float dim oscillated it.
      const edges = activeEdgesRef.current;
      const x = pinAnchoredEdge(!!edges?.left, sr.snapshot.x, sr.snapshot.width, width);
      const y = pinAnchoredEdge(!!edges?.top, sr.snapshot.y, sr.snapshot.height, height);
      flushSync(() => {
        updateObject(id, { x, y, props: { width, height } });
      });
      sr.changed = true;
      node.scaleX(1);
      node.scaleY(1);
      node.x(objectsOffsetX + dotsToPx(x, scale, dpmm));
      node.y(labelOffsetY + dotsToPx(y, scale, dpmm));
      transformerRef.current?.forceUpdate();
    }
  };

  const boundBoxFunc = (
    oldBox: BoundingBox,
    newBox: BoundingBox,
  ): BoundingBox => {
    if (shrinkingBelowFloor(oldBox, newBox, MIN_RESIZE_BOX_PX)) return oldBox;
    // The text-block reflow re-pins from its own captured edges, so the snap /
    // inactive-edge pin below would fight it; skip entirely.
    if (liveReflowRef.current) return newBox;
    // Locked-circle reflow needs forceAspectBox so Konva keeps sx==sy; node and
    // reflow only agree when the bbox keeps its aspect. Snap/pin below is free-axis only.
    if (shapeReflowRef.current && isUniformScale) {
      return forceAspectBox(oldBox, newBox);
    }
    // Free-resize shapes fall through: object-snap + inactive-edge pin still
    // apply (reflow pins from the same node position), keeping edge snapping.
    if (isUniformScale) newBox = forceAspectBox(oldBox, newBox);
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
      if (snapBypassRef.current) {
        // Ctrl/Cmd held: resize freely; drop guides left by earlier ticks.
        setGuides([]);
      } else {
        const snapped = applyResizeObjectSnap(
          bbox,
          startBbox,
          othersSnapshotRef.current,
          labelRect,
        );
        setGuides(snapped.guides);
        bbox = snapped.bbox;
      }
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
    // Each live-reflow branch derives its (restore, final) prop delta and hands
    // it to collapseReflowToOneEntry, which folds the paused per-tick writes into
    // one undo entry (or resets the residual scale and bails when nothing baked).
    const lr = liveReflowRef.current;
    if (lr) {
      const id = selectedIds[0];
      const cur = id ? findObjectById(getCurrentObjects(), id) : undefined;
      let commit: ReflowCommit = null;
      if (lr.changed && id && cur && !isGroup(cur)) {
        const cp = cur.props as { blockWidth?: number; blockLines?: number; blockHeight?: number };
        // ^TB collapses width + clip height; ^FB width + line count.
        const secondAxis = lr.mode === "tb" ? { blockHeight: cp.blockHeight } : { blockLines: cp.blockLines };
        const snapAxis = lr.mode === "tb" ? { blockHeight: lr.snapshot.blockHeight } : { blockLines: lr.snapshot.blockLines };
        commit = {
          restore: { x: lr.snapshot.x, y: lr.snapshot.y, props: { blockWidth: lr.snapshot.blockWidth, ...snapAxis } },
          final: { x: cur.x, y: cur.y, props: { blockWidth: cp.blockWidth, ...secondAxis } },
        };
      }
      collapseReflowToOneEntry(id, commit);
      return;
    }
    const br = barcodeReflowRef.current;
    if (br) {
      const id = selectedIds[0];
      const cur = id ? findObjectById(getCurrentObjects(), id) : undefined;
      let commit: ReflowCommit = null;
      if (br.changed && id && cur && !isGroup(cur)) {
        const cp = cur.props as { moduleWidth?: number; height?: number };
        // Final goes through the registry commit at identity scale (= re-commit
        // the baked props) so per-type contracts hold: grid snap for height,
        // the ^BY clamp, code49's bwip range clamp. The fallback mirrors the
        // generic formula for entries without a commitTransform.
        const commitFn = getEntry(cur.type)?.commitTransform;
        const finalProps = commitFn
          ? commitFn(cur, {
              sx: 1,
              sy: 1,
              snap,
              nodeHeight: 0,
              anchor: null,
              resizeMode: blockResizeModeRef.current,
            })
          : br.mode === "mw"
            ? { moduleWidth: cp.moduleWidth }
            : { height: Math.max(1, snap(Math.round(cp.height ?? 1))) };
        commit = {
          restore: {
            x: br.snapshot.x,
            y: br.snapshot.y,
            props:
              br.mode === "mw"
                ? typeof br.snapshot.height === "number"
                  ? { moduleWidth: br.snapshot.moduleWidth, height: br.snapshot.height }
                  : { moduleWidth: br.snapshot.moduleWidth }
                : { height: br.snapshot.height },
          },
          final: { x: cur.x, y: cur.y, props: finalProps },
        };
      }
      collapseReflowToOneEntry(id, commit);
      return;
    }
    const sr = shapeReflowRef.current;
    if (sr) {
      const id = selectedIds[0];
      const cur = id ? findObjectById(getCurrentObjects(), id) : undefined;
      let commit: ReflowCommit = null;
      if (sr.changed && id && cur && !isGroup(cur)) {
        const sp = cur.props as { width: number; height: number };
        // Apply the grid snap the per-tick bake skips (round only); the anchored
        // edge is then re-pinned from the snapped size so it can't walk.
        const width = Math.max(1, snap(Math.round(sp.width)));
        const height = Math.max(1, snap(Math.round(sp.height)));
        const edges = activeEdgesRef.current;
        commit = {
          restore: { x: sr.snapshot.x, y: sr.snapshot.y, props: { width: sr.snapshot.width, height: sr.snapshot.height } },
          final: {
            x: pinAnchoredEdge(!!edges?.left, sr.snapshot.x, sr.snapshot.width, width),
            y: pinAnchoredEdge(!!edges?.top, sr.snapshot.y, sr.snapshot.height, height),
            props: { width, height },
          },
        };
      }
      collapseReflowToOneEntry(id, commit);
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
    // FT anchor inverse from the continuous drag scale, not the snapped commit
    // props (rounding fed back makes rotated barcodes jump); see committedUprightBarDots.
    const ftEntry = getEntry(obj.type);
    let committedW: number | undefined;
    let committedH: number | undefined;
    if (obj.positionType === "FT" && isBarcode(obj) && !ftEntry?.uniformScaleProp) {
      const cache = getMeasuredSnapshot().get(singleId);
      const fallbackH = (obj.props as { height?: number }).height ?? 0;
      const dims = committedUprightBarDots(
        objectRotation(obj.props),
        sx,
        sy,
        cache?.uprightBarWDots ?? 0,
        cache?.uprightBarHDots ?? fallbackH,
      );
      committedW = dims.w;
      committedH = dims.h;
    }
    // Invert per-type render offsets (QR's +10 Y, the rotation-aware FT bar
    // anchor) so the stored model matches the render path. Text renders at
    // obj.x/y directly.
    const modelPos = modelPositionFromRenderedTopLeft(
      obj,
      renderedXDots,
      renderedYDots,
      committedW,
      committedH,
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
