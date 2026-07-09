import { describe, it, expect } from "vitest";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
import { paletteGhostHandlers, type PaletteGhostDeps } from "./paletteGhostMonitor";
import { CANVAS_DROPPABLE_ID } from "../../dnd/types";
import type { LeafObject } from "../../registry";

const CANVAS = CANVAS_DROPPABLE_ID;

interface Added {
  type: string;
  position?: { x: number; y: number };
  propsOverride?: object;
}

function dragEvent(
  overId: string | null,
  data: { type?: string; propsOverride?: object } = { type: "text" },
): DragMoveEvent & DragEndEvent {
  return {
    active: { data: { current: data } },
    over: overId === null ? null : { id: overId },
  } as unknown as DragMoveEvent & DragEndEvent;
}

function harness(overrides: Partial<PaletteGhostDeps> = {}) {
  const calls: { ghost: (LeafObject | null)[]; added: Added[] } = { ghost: [], added: [] };
  const deps: PaletteGhostDeps = {
    live: { current: false },
    locked: false,
    pointerPos: () => ({ x: 10, y: 20 }),
    setGhost: (g) => calls.ghost.push(g),
    addObject: (type, position, propsOverride) => calls.added.push({ type, position, propsOverride }),
    viewRotation: () => 0,
    ...overrides,
  };
  return { deps, calls, handlers: () => paletteGhostHandlers(deps) };
}

describe("paletteGhostHandlers", () => {
  it("sets the ghost while moving over the canvas and spawns at the pointer on drop", () => {
    const { calls, handlers } = harness();
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)).toMatchObject({ id: "__ghost__", type: "text", x: 10, y: 20 });
    handlers().onDragEnd(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)).toBeNull();
    // Assert the full spawn contract: the drop lands at the mapped pointer.
    expect(calls.added).toEqual([{ type: "text", position: { x: 10, y: 20 }, propsOverride: undefined }]);
  });

  it("previews the rotated view's spawn rotation on the ghost", () => {
    const { calls, handlers } = harness({ viewRotation: () => 90 });
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)?.props).toMatchObject({ rotation: "B" });
  });

  it("forwards the drag's propsOverride to both the ghost preview and the spawn", () => {
    const { calls, handlers } = harness();
    const propsOverride = { fontSize: 42 };
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS, { type: "text", propsOverride }));
    expect(calls.ghost.at(-1)?.props).toMatchObject(propsOverride);
    handlers().onDragEnd(dragEvent(CANVAS, { type: "text", propsOverride }));
    expect(calls.added.at(-1)).toEqual({ type: "text", position: { x: 10, y: 20 }, propsOverride });
  });

  it("drops a stale onDragMove arriving after onDragEnd (lingering-ghost regression)", () => {
    // dnd-kit dispatches moves from a passive effect keyed on the drag
    // translate, which the end reducer resets, so this ordering is real.
    const { calls, handlers } = harness();
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    handlers().onDragEnd(dragEvent(CANVAS));
    handlers().onDragMove(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)).toBeNull();
  });

  it("drops a stale onDragMove after onDragCancel", () => {
    const { calls, handlers } = harness();
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    handlers().onDragCancel();
    handlers().onDragMove(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)).toBeNull();
  });

  it("clears the ghost when the pointer leaves the canvas droppable", () => {
    const { calls, handlers } = harness();
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    handlers().onDragMove(dragEvent(null));
    expect(calls.ghost.at(-1)).toBeNull();
  });

  it("keeps the last ghost when a canvas move arrives with the pointer unmeasured", () => {
    // pointerPos() is null only transiently (container unmeasured); the move is
    // skipped rather than clearing a valid ghost, matching the inline original.
    let pos: { x: number; y: number } | null = { x: 10, y: 20 };
    const { calls, handlers } = harness({ pointerPos: () => pos });
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)).not.toBeNull();
    pos = null;
    handlers().onDragMove(dragEvent(CANVAS));
    expect(calls.ghost.at(-1)).not.toBeNull();
    expect(calls.added).toEqual([]);
  });

  it("does not spawn on drop outside the canvas and clears the ghost", () => {
    const { calls, handlers } = harness();
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    handlers().onDragEnd(dragEvent(null));
    expect(calls.ghost.at(-1)).toBeNull();
    expect(calls.added).toEqual([]);
  });

  it("never shows a ghost and never spawns while the preview locks the editor", () => {
    const { calls, handlers } = harness({ locked: true });
    handlers().onDragStart();
    handlers().onDragMove(dragEvent(CANVAS));
    handlers().onDragEnd(dragEvent(CANVAS));
    expect(calls.ghost.every((g) => g === null)).toBe(true);
    expect(calls.added).toEqual([]);
  });
});
