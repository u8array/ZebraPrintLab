import { describe, it, expect, vi } from "vitest";
import { buildFavoritesAddMenu, buildPaletteRowMenu } from "./paletteActions";

const LABELS = { addToLabel: "Add", pinToFavorites: "Pin", unpinFromFavorites: "Unpin" };

describe("buildPaletteRowMenu", () => {
  it("offers add-to-label plus pin, flipping to unpin when already pinned", () => {
    const dispatch = { addToLabel: vi.fn(), togglePin: vi.fn() };
    const unpinned = buildPaletteRowMenu({ pinned: false, labels: LABELS, dispatch });
    expect(unpinned[0]?.items.map((i) => i.label)).toEqual(["Add", "Pin"]);
    const pinned = buildPaletteRowMenu({ pinned: true, labels: LABELS, dispatch });
    expect(pinned[0]?.items.map((i) => i.label)).toEqual(["Add", "Unpin"]);
    pinned[0]?.items[1]?.run?.();
    expect(dispatch.togglePin).toHaveBeenCalledOnce();
  });
});

describe("buildFavoritesAddMenu", () => {
  const groups = [
    { id: "text", label: "Text", entries: [{ id: "text-a", label: "A", pinned: false }] },
    { id: "code", label: "Codes", entries: [{ id: "qr", label: "QR", pinned: true }] },
    { id: "empty", label: "Empty", entries: [] },
  ];

  it("maps groups to submenus, disables already-pinned entries, drops empty groups", () => {
    const onAdd = vi.fn();
    const [section] = buildFavoritesAddMenu(groups, onAdd);
    expect(section?.items.map((i) => i.label)).toEqual(["Text", "Codes"]);
    const textSub = section?.items[0]?.submenu;
    expect(textSub?.[0]?.disabled).toBe(false);
    expect(section?.items[1]?.submenu?.[0]?.disabled).toBe(true);
    textSub?.[0]?.run?.();
    expect(onAdd).toHaveBeenCalledWith("text-a");
  });
});
