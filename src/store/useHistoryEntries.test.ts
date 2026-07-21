import { describe, it, expect, beforeEach } from "vitest";
import { useLabelStore, temporalPartialize, currentObjects } from "./labelStore";
import { buildHistoryTimeline, historyJumpSteps, type HistorySnapshot } from "../lib/historyStep";

// Drives the REAL zundo stack so the timeline projection is verified against
// actual undo/redo behaviour, not an assumed array order. The newest-first
// futureStates convention is the riskiest assumption; these tests pin it.

function reset() {
  useLabelStore.setState({
    label: { widthMm: 100, heightMm: 60, dpmm: 8 },
    printerProfile: {},
    pages: [{ objects: [] }],
    currentPageIndex: 0,
    selectedIds: [],
    variables: [],
    dataset: null,
    columnMapping: null,
    previewMode: { status: "idle" },
  });
  useLabelStore.temporal.getState().clear();
}

const state = () => useLabelStore.getState();
const temporal = () => useLabelStore.temporal.getState();
const objectCount = () => currentObjects(state()).length;

function project() {
  const { pastStates, futureStates } = temporal();
  const current = temporalPartialize(state()) as HistorySnapshot;
  return buildHistoryTimeline(
    pastStates as unknown as HistorySnapshot[],
    current,
    futureStates as unknown as HistorySnapshot[],
  );
}

beforeEach(() => reset());

describe("useHistoryEntries timeline projection (integration)", () => {
  it("reconstructs the chronological order after multi-step undo", () => {
    state().addObject("text"); // 1 object
    state().addObject("text"); // 2 objects
    state().addObject("text"); // 3 objects
    temporal().undo(2); // back to 1 object

    const { timeline, currentIndex } = project();
    // 4 snapshots: initial(0), +1, +2, +3 objects; cursor sits on the +1 state.
    expect(timeline.map((s) => s.pages[0]!.objects.length)).toEqual([0, 1, 2, 3]);
    expect(currentIndex).toBe(1);
    expect(timeline[currentIndex]!.pages[0]!.objects.length).toBe(objectCount());
  });

  it("jumpTo deltas (via historyJumpSteps) land on the targeted snapshot", () => {
    state().addObject("text");
    state().addObject("text");
    state().addObject("text"); // now 3 objects, cursor at end (index 3)

    const before = project();
    expect(before.currentIndex).toBe(3);

    // Jump back to the empty initial state (index 0).
    const back = historyJumpSteps(0, before.currentIndex);
    expect(back).toBe(-3);
    temporal().undo(-back);
    expect(objectCount()).toBe(0);

    // Jump forward to the 2-object state (index 2).
    const mid = project();
    const fwd = historyJumpSteps(2, mid.currentIndex);
    expect(fwd).toBe(2);
    temporal().redo(fwd);
    expect(objectCount()).toBe(2);
  });

  it("does not record a snapshot for page navigation alone", () => {
    state().addObject("text");
    state().addPage(); // real step: page added (currentPageIndex -> 1)
    const steps = temporal().pastStates.length;

    state().setCurrentPage(0);
    state().setCurrentPage(1);

    expect(temporal().pastStates.length).toBe(steps); // navigation is not undoable
  });

  it("undo of addPage restores currentPageIndex so it stays in range", () => {
    state().addObject("text"); // page 0 has content
    expect(objectCount()).toBe(1);
    state().addPage(); // pages=[p0,p1], currentPageIndex=1, empty page shown
    expect(state().currentPageIndex).toBe(1);
    expect(objectCount()).toBe(0);

    temporal().undo(1); // back to single page

    expect(state().pages.length).toBe(1);
    expect(state().currentPageIndex).toBe(0); // index co-restored, not dangling
    expect(objectCount()).toBe(1); // page 0 content visible again
  });

  it("does not record a snapshot for a selection-only (non-document) set", () => {
    state().addObject("text"); // one real step
    expect(temporal().pastStates.length).toBe(1);

    // Selecting/deselecting touches selectedIds, which is not in the partialize.
    // Without the equality guard zundo would record a phantom duplicate step.
    state().selectObject(state().pages[0]!.objects[0]!.id);
    state().selectObject(null);

    expect(temporal().pastStates.length).toBe(1);
    const { timeline } = project();
    expect(timeline.length).toBe(2); // initial + the one add, no phantom "mixed" row
  });

  it("keeps multi-step redo working after projecting (no in-place future mutation)", () => {
    state().addObject("text");
    state().addObject("text");
    state().addObject("text");
    temporal().undo(2); // 1 object, TWO redos available (reverse is a real op)

    // A naive in-place futureStates.reverse() scrambles zundo's redo order.
    // Project an ODD number of times (once): an even count would reverse twice
    // and self-cancel, hiding the corruption.
    project();

    temporal().redo(1);
    expect(objectCount()).toBe(2);
    temporal().redo(1);
    expect(objectCount()).toBe(3);
  });
});
