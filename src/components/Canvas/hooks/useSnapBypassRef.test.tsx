// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSnapBypassRef } from "./useSnapBypassRef";

function key(type: "keydown" | "keyup", init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent(type, init));
}

describe("useSnapBypassRef", () => {
  it("tracks held Ctrl and Meta, off again on release", () => {
    const { result } = renderHook(() => useSnapBypassRef());
    expect(result.current.current).toBe(false);

    key("keydown", { key: "Control", ctrlKey: true });
    expect(result.current.current).toBe(true);
    key("keyup", { key: "Control", ctrlKey: false });
    expect(result.current.current).toBe(false);

    key("keydown", { key: "Meta", metaKey: true });
    expect(result.current.current).toBe(true);
    key("keyup", { key: "Meta", metaKey: false });
    expect(result.current.current).toBe(false);
  });

  it("ignores AltGr (Ctrl+Alt) so typing @ or [ doesn't suspend snapping", () => {
    const { result } = renderHook(() => useSnapBypassRef());
    key("keydown", { key: "AltGraph", ctrlKey: true, altKey: true });
    expect(result.current.current).toBe(false);
  });

  it("ignores Cmd+Alt (Option) on macOS so Alt-gestures keep their meaning", () => {
    const { result } = renderHook(() => useSnapBypassRef());
    key("keydown", { key: "Alt", metaKey: true, altKey: true });
    expect(result.current.current).toBe(false);
  });

  it("stays true across other keystrokes while the modifier is held", () => {
    const { result } = renderHook(() => useSnapBypassRef());
    key("keydown", { key: "Control", ctrlKey: true });
    key("keydown", { key: "a", ctrlKey: true });
    key("keyup", { key: "a", ctrlKey: true });
    expect(result.current.current).toBe(true);
  });

  it("clears on window blur so a lost keyup can't wedge the bypass on", () => {
    const { result } = renderHook(() => useSnapBypassRef());
    key("keydown", { key: "Meta", metaKey: true });
    expect(result.current.current).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(result.current.current).toBe(false);
  });

  it("removes its listeners on unmount", () => {
    const { result, unmount } = renderHook(() => useSnapBypassRef());
    unmount();
    key("keydown", { key: "Control", ctrlKey: true });
    expect(result.current.current).toBe(false);
  });
});
