// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLabelStore, currentObjects } from "./labelStore";
import { useHistoryEntries } from "./useHistoryEntries";

// Exercises the React wiring of the hook (re-render on temporal change, jumpTo
// driving the real store, lock gating) that the pure/integration tests cannot.

function reset() {
  useLabelStore.setState({
    label: { widthMm: 100, heightMm: 60, dpmm: 8 },
    printerProfile: {},
    pages: [{ objects: [] }],
    currentPageIndex: 0,
    selectedIds: [],
    variables: [],
    csvDataset: null,
    csvMapping: null,
    previewMode: { status: "idle" },
  });
  useLabelStore.temporal.getState().clear();
}

const objectCount = () => currentObjects(useLabelStore.getState()).length;

beforeEach(() => reset());

describe("useHistoryEntries hook", () => {
  it("grows the entry list and tracks the current index as actions happen", () => {
    const { result } = renderHook(() => useHistoryEntries());
    expect(result.current.entries.length).toBe(1);
    expect(result.current.currentIndex).toBe(0);

    act(() => useLabelStore.getState().addObject("text"));
    act(() => useLabelStore.getState().addObject("text"));

    expect(result.current.entries.length).toBe(3);
    expect(result.current.currentIndex).toBe(2);
    expect(result.current.entries[2]!.isCurrent).toBe(true);
  });

  it("classifies a real addObject step as 'add' (real store flow, not synthetic)", () => {
    const { result } = renderHook(() => useHistoryEntries());
    act(() => useLabelStore.getState().addObject("text"));
    expect(result.current.entries[0]!.descriptor.kind).toBe("initial");
    expect(result.current.entries[1]!.descriptor.kind).toBe("add");
  });

  it("jumpTo moves the real store to the targeted snapshot", () => {
    const { result } = renderHook(() => useHistoryEntries());
    act(() => useLabelStore.getState().addObject("text"));
    act(() => useLabelStore.getState().addObject("text"));
    expect(objectCount()).toBe(2);

    act(() => result.current.jumpTo(0));
    expect(objectCount()).toBe(0);
    expect(result.current.currentIndex).toBe(0);

    act(() => result.current.jumpTo(2));
    expect(objectCount()).toBe(2);
  });

  it("clear empties the history and disables itself", () => {
    const { result } = renderHook(() => useHistoryEntries());
    act(() => useLabelStore.getState().addObject("text"));
    expect(result.current.canClear).toBe(true);

    act(() => result.current.clear());
    expect(result.current.canClear).toBe(false);
    expect(result.current.entries.length).toBe(1);
  });

  it("is inert under the preview lock: locked set, jumpTo a no-op, clear disabled", () => {
    const { result } = renderHook(() => useHistoryEntries());
    act(() => useLabelStore.getState().addObject("text"));
    act(() => useLabelStore.getState().addObject("text"));
    expect(objectCount()).toBe(2);

    act(() => useLabelStore.setState({ previewMode: { status: "loading" } }));
    expect(result.current.locked).toBe(true);
    expect(result.current.canClear).toBe(false);

    act(() => result.current.jumpTo(0));
    expect(objectCount()).toBe(2);
  });
});
