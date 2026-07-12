// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import { useLabelStore } from "../store/labelStore";

function key(code: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, ...init }));
}

// Regression: bare S/R toggle snap / rotate the view, but with a modifier they
// must stay inert (Ctrl+S / Ctrl+R belong to the browser, like the G guard).
describe("useGlobalShortcuts modifier guards", () => {
  const initialCanvasSettings = useLabelStore.getState().canvasSettings;

  beforeEach(() => {
    useLabelStore.setState({ canvasSettings: initialCanvasSettings });
  });
  it("bare S toggles snap; Ctrl+S does not", () => {
    renderHook(() => useGlobalShortcuts());
    const before = useLabelStore.getState().canvasSettings.snapEnabled;
    key("KeyS");
    expect(useLabelStore.getState().canvasSettings.snapEnabled).toBe(!before);
    key("KeyS", { ctrlKey: true });
    expect(useLabelStore.getState().canvasSettings.snapEnabled).toBe(!before);
  });

  it("bare R rotates the view; Ctrl+R does not", () => {
    renderHook(() => useGlobalShortcuts());
    const before = useLabelStore.getState().canvasSettings.viewRotation;
    key("KeyR");
    const rotated = useLabelStore.getState().canvasSettings.viewRotation;
    expect(rotated).not.toBe(before);
    key("KeyR", { ctrlKey: true });
    expect(useLabelStore.getState().canvasSettings.viewRotation).toBe(rotated);
  });
});
