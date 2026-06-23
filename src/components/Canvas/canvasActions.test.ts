import { describe, it, expect, vi } from "vitest";
import { buildContextMenu, type ContextMenuCtx } from "./canvasActions";

const dispatch = () => ({
  copy: vi.fn(), cut: vi.fn(), duplicate: vi.fn(), remove: vi.fn(),
  pasteHere: vi.fn(), reorder: vi.fn(), group: vi.fn(), ungroup: vi.fn(),
  toggleLock: vi.fn(), addHere: vi.fn(), copyZplSelected: vi.fn(),
  copyZplLabel: vi.fn(), copyImage: vi.fn(), exportImage: vi.fn(), selectAll: vi.fn(),
});

const ctx = (over: Partial<ContextMenuCtx> = {}): ContextMenuCtx => ({
  onObject: true, hasSelection: true, canGroup: false, canUngroup: false,
  canDelete: true, locked: false, hasClipboard: false, hasObjects: true,
  previewLocks: false,
  addableGroups: [{ id: "text", label: "Text", types: [{ id: "text", type: "text", label: "Text" }] }],
  dispatch: dispatch(), ...over,
});

const ids = (sections: ReturnType<typeof buildContextMenu>) =>
  sections.flatMap((s) => s.items.map((i) => i.id));

describe("buildContextMenu", () => {
  it("object menu has clipboard, order, arrange, export sections", () => {
    const got = ids(buildContextMenu(ctx()));
    expect(got).toEqual(expect.arrayContaining(["copy", "cut", "duplicate", "delete", "toFront", "toBack", "lock", "copyZplSelected", "copyImage", "exportImage"]));
  });

  it("empty menu offers paste-here, add-here submenu, select-all, label export", () => {
    const sections = buildContextMenu(ctx({ onObject: false, hasSelection: false }));
    const got = ids(sections);
    expect(got).toEqual(expect.arrayContaining(["pasteHere", "addHere", "selectAll", "copyZplLabel"]));
    const addHere = sections.flatMap((s) => s.items).find((i) => i.id === "addHere");
    // Second level is the category group, third level the addable types.
    expect(addHere?.submenu?.map((s) => s.id)).toEqual(["addgrp:text"]);
    expect(addHere?.submenu?.[0]?.submenu?.map((s) => s.id)).toEqual(["add:text"]);
  });

  it("add-here type runs addHere with its type and propsOverride", () => {
    const d = dispatch();
    const sections = buildContextMenu(ctx({ onObject: false, hasSelection: false, dispatch: d }));
    const addHere = sections.flatMap((s) => s.items).find((i) => i.id === "addHere");
    addHere?.submenu?.[0]?.submenu?.[0]?.run?.();
    expect(d.addHere).toHaveBeenCalledWith("text", undefined);
  });

  it("add-here preset uses its id and passes propsOverride", () => {
    const d = dispatch();
    const sections = buildContextMenu(ctx({
      onObject: false, hasSelection: false, dispatch: d,
      addableGroups: [{ id: "shape", label: "Shapes", types: [
        { id: "line-diagonal", type: "line", label: "Diagonal line", propsOverride: { angle: 45 } },
      ] }],
    }));
    const addHere = sections.flatMap((s) => s.items).find((i) => i.id === "addHere");
    expect(addHere?.submenu?.[0]?.submenu?.map((s) => s.id)).toEqual(["add:line-diagonal"]);
    addHere?.submenu?.[0]?.submenu?.[0]?.run?.();
    expect(d.addHere).toHaveBeenCalledWith("line", { angle: 45 });
  });

  it("shows group only when canGroup, ungroup only when canUngroup", () => {
    expect(ids(buildContextMenu(ctx({ canGroup: true })))).toContain("group");
    expect(ids(buildContextMenu(ctx({ canGroup: true })))).not.toContain("ungroup");
    expect(ids(buildContextMenu(ctx({ canUngroup: true })))).toContain("ungroup");
  });

  it("lock label flips to unlock when locked", () => {
    const lock = buildContextMenu(ctx({ locked: true })).flatMap((s) => s.items).find((i) => i.id === "lock");
    expect(lock?.labelKey).toBe("unlock");
  });

  it("disables everything during preview lock", () => {
    const sections = buildContextMenu(ctx({ previewLocks: true }));
    expect(sections.flatMap((s) => s.items).every((i) => i.disabled)).toBe(true);
  });

  it("paste-here disabled without clipboard, enabled with", () => {
    const noClip = buildContextMenu(ctx({ onObject: false, hasSelection: false, hasClipboard: false }));
    expect(noClip.flatMap((s) => s.items).find((i) => i.id === "pasteHere")?.disabled).toBe(true);
    const clip = buildContextMenu(ctx({ onObject: false, hasSelection: false, hasClipboard: true }));
    expect(clip.flatMap((s) => s.items).find((i) => i.id === "pasteHere")?.disabled).toBe(false);
  });

  it("run invokes the matching dispatcher", () => {
    const d = dispatch();
    const sections = buildContextMenu(ctx({ dispatch: d }));
    sections.flatMap((s) => s.items).find((i) => i.id === "duplicate")?.run?.();
    expect(d.duplicate).toHaveBeenCalledOnce();
    sections.flatMap((s) => s.items).find((i) => i.id === "toFront")?.run?.();
    expect(d.reorder).toHaveBeenCalledWith("front");
  });
});
