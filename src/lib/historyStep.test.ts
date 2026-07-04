import { describe, expect, it } from "vitest";
import {
  describeHistoryStep,
  buildHistoryTimeline,
  historyJumpSteps,
  type HistorySnapshot,
} from "./historyStep";
import type { LabelObject, Page } from "../types/Group";
import type { LeafObject } from "../registry";
import type { Variable } from "../types/Variable";
import type { LabelConfig } from "../types/LabelConfig";

const label: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 };

function leaf<T extends LeafObject["type"]>(
  id: string,
  type: T,
  props: Extract<LeafObject, { type: T }>["props"],
  extra: Partial<LabelObject> = {},
): LeafObject {
  return { id, type, x: 0, y: 0, rotation: 0, props, ...extra } as LeafObject;
}

const textLeaf = (id: string, extra: Partial<LabelObject> = {}): LeafObject =>
  leaf(id, "text", { content: "hi", fontHeight: 30, fontWidth: 30, font: "0" } as never, extra);

const boxLeaf = (id: string, extra: Partial<LabelObject> = {}): LeafObject =>
  leaf(id, "box", { width: 100, height: 50, thickness: 2, filled: false, color: "B", rounding: 0 }, extra);

function variable(id: string, name: string, fnNumber: number): Variable {
  return { id, name, fnNumber, defaultValue: "" };
}

// Shared default references: the real store is identity-preserving, so an
// unchanged domain keeps its ref across snapshots. snap() reuses these so only
// explicitly overridden fields read as changed.
const EMPTY_PAGES: Page[] = [{ objects: [] }];
const EMPTY_VARS: readonly Variable[] = [];
const PROFILE = {};

function snap(over: Partial<HistorySnapshot> = {}): HistorySnapshot {
  return {
    label,
    printerProfile: PROFILE,
    pages: EMPTY_PAGES,
    currentPageIndex: 0,
    variables: EMPTY_VARS,
    csvMapping: undefined,
    ...over,
  };
}

const pageWith = (...objects: LabelObject[]): Page[] => [{ objects }];

describe("describeHistoryStep", () => {
  it("returns initial when there is no prior snapshot", () => {
    expect(describeHistoryStep(null, snap())).toEqual({ kind: "initial" });
  });

  describe("add / remove", () => {
    it("classifies an added leaf as add with its name", () => {
      const prev = snap();
      const next = snap({ pages: pageWith(textLeaf("a", { name: "Header" })) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "add", count: 1, name: "Header" });
    });

    it("falls back to the registry type when an added leaf has no name", () => {
      const prev = snap();
      const next = snap({ pages: pageWith(boxLeaf("b")) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "add", count: 1, name: "box" });
    });

    it("omits name when several leaves are added at once", () => {
      const prev = snap();
      const next = snap({ pages: pageWith(textLeaf("a"), textLeaf("b")) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "add", count: 2 });
    });

    it("classifies a removed leaf as remove", () => {
      const prev = snap({ pages: pageWith(textLeaf("a", { name: "Header" })) });
      const next = snap();
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "remove", count: 1, name: "Header" });
    });
  });

  describe("move / resize / edit", () => {
    it("classifies an x/y change as move", () => {
      const prev = snap({ pages: pageWith(textLeaf("a")) });
      const next = snap({ pages: pageWith(textLeaf("a", { x: 50 })) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "move", count: 1, name: "text" });
    });

    it("classifies a dimension-prop change as resize", () => {
      const prev = snap({ pages: pageWith(boxLeaf("a")) });
      const moved = boxLeaf("a");
      (moved as { props: { width: number } }).props.width = 200;
      const next = snap({ pages: pageWith(moved) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "resize", count: 1, name: "box" });
    });

    it("classifies a non-dimension prop change as edit", () => {
      const prev = snap({ pages: pageWith(textLeaf("a", { name: "Header" })) });
      const next = snap({ pages: pageWith(textLeaf("a", { name: "Footer" })) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "edit", count: 1, name: "Footer" });
    });

    it("prefers resize over move when both changed", () => {
      const prev = snap({ pages: pageWith(boxLeaf("a")) });
      const changed = boxLeaf("a", { x: 99 });
      (changed as { props: { width: number } }).props.width = 300;
      const next = snap({ pages: pageWith(changed) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "resize", count: 1, name: "box" });
    });
  });

  describe("group / ungroup", () => {
    const group = (id: string, children: LabelObject[]): LabelObject =>
      ({ id, type: "group", x: 0, y: 0, rotation: 0, children }) as unknown as LabelObject;

    it("classifies reparenting the same leaves as group", () => {
      const prev = snap({ pages: pageWith(textLeaf("a"), textLeaf("b")) });
      const next = snap({ pages: pageWith(group("g", [textLeaf("a"), textLeaf("b")])) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "group" });
    });

    it("classifies ungrouping back to flat leaves as group", () => {
      const prev = snap({ pages: pageWith(group("g", [textLeaf("a"), textLeaf("b")])) });
      const next = snap({ pages: pageWith(textLeaf("a"), textLeaf("b")) });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "group" });
    });
  });

  describe("variable precedence", () => {
    it("classifies an added variable as variable, even when pages also changed", () => {
      const prev = snap({ variables: [variable("v1", "lot", 1)] });
      const next = snap({
        variables: [variable("v1", "lot", 1), variable("v2", "date", 2)],
        pages: pageWith(textLeaf("a")),
      });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "variable", name: "date" });
    });

    it("classifies a removed variable as variable with its name", () => {
      const prev = snap({ variables: [variable("v1", "lot", 1), variable("v2", "date", 2)] });
      const next = snap({ variables: [variable("v1", "lot", 1)] });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "variable", name: "date" });
    });

    it("classifies a rename as variable with the new name", () => {
      const prev = snap({ variables: [variable("v1", "lot", 1)] });
      const next = snap({ variables: [variable("v1", "batch", 1)] });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "variable", name: "batch" });
    });
  });

  it("classifies a csvMapping change as csv", () => {
    const prev = snap();
    const next = snap({ csvMapping: { bindings: {}, headerSnapshot: [] } });
    expect(describeHistoryStep(prev, next)).toEqual({ kind: "csv" });
  });

  describe("load", () => {
    it("classifies a whole-document replace as load", () => {
      const prev = snap();
      const next = snap({
        label: { widthMm: 50, heightMm: 25, dpmm: 8 },
        pages: pageWith(textLeaf("a")),
        variables: [variable("v1", "lot", 1)],
      });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "load" });
    });
  });

  describe("label / page", () => {
    it("classifies a label-only change as label", () => {
      const prev = snap();
      const next = snap({ label: { widthMm: 80, heightMm: 50, dpmm: 8 } });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "label" });
    });

    it("classifies a printerProfile-only change as label", () => {
      const prev = snap();
      const next = snap({ printerProfile: { darkness: 10 } });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "label" });
    });

    it("classifies a page add as page when no leaves change", () => {
      const prev = snap({ pages: [{ objects: [] }] });
      const next = snap({ pages: [{ objects: [] }, { objects: [] }] });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "page" });
    });

    it("does not treat a currentPageIndex-only change as a page step", () => {
      // currentPageIndex rides the snapshot for restore but is not a document
      // edit; navigation alone is never recorded, so the classifier must not
      // key off it (guards against re-introducing a page-index check).
      const prev = snap({ currentPageIndex: 0 });
      const next = snap({ currentPageIndex: 1 });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "mixed" });
    });
  });

  describe("reorder", () => {
    it("classifies a z-order permutation of the same leaves as reorder", () => {
      const a = textLeaf("a");
      const b = textLeaf("b");
      const prev = snap({ pages: [{ objects: [a, b] }] });
      const next = snap({ pages: [{ objects: [b, a] }] });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "reorder" });
    });
  });

  describe("overlay no-op", () => {
    it("classifies an overlay-only page-ref change as mixed, not edit", () => {
      const a = textLeaf("a");
      const prev = snap({ pages: [{ objects: [a] }] });
      const next = snap({ pages: [{ objects: [a], overlay: {} as never }] });
      expect(describeHistoryStep(prev, next)).toEqual({ kind: "mixed" });
    });
  });
});

describe("buildHistoryTimeline", () => {
  // Distinct-by-value snapshots so toEqual can assert exact ordering.
  const s = (id: string): HistorySnapshot =>
    snap({ label: { widthMm: id.charCodeAt(0), heightMm: 50, dpmm: 8 } });

  it("orders past oldest-first, then current, then future oldest-first", () => {
    const past = [s("a"), s("b")]; // a oldest
    const current = s("c");
    const future = [s("e"), s("d")]; // newest-first: e is the furthest redo, d the nearest
    const { timeline, currentIndex } = buildHistoryTimeline(past, current, future);
    expect(timeline).toEqual([s("a"), s("b"), s("c"), s("d"), s("e")]);
    expect(currentIndex).toBe(2);
  });

  it("does not mutate the input futureStates array", () => {
    const future = [s("e"), s("d")];
    const snapshot = [...future];
    buildHistoryTimeline([], s("c"), future);
    expect(future).toEqual(snapshot);
  });

  it("places current at index 0 when there is no past", () => {
    const { timeline, currentIndex } = buildHistoryTimeline([], s("c"), []);
    expect(timeline).toEqual([s("c")]);
    expect(currentIndex).toBe(0);
  });
});

describe("historyJumpSteps", () => {
  it("returns negative to undo back in time", () => {
    expect(historyJumpSteps(1, 4)).toBe(-3);
  });
  it("returns positive to redo forward", () => {
    expect(historyJumpSteps(6, 4)).toBe(2);
  });
  it("returns zero for the current index", () => {
    expect(historyJumpSteps(4, 4)).toBe(0);
  });
});
