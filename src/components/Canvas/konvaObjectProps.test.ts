import { describe, it, expect, vi } from "vitest";
import type Konva from "konva";
import { selectionHandlers } from "./konvaObjectProps";

const clickEvt = (evt: Partial<MouseEvent>) =>
  ({ evt } as Konva.KonvaEventObject<MouseEvent>);

describe("selectionHandlers", () => {
  it("left click selects (single)", () => {
    const onSelect = vi.fn();
    selectionHandlers(onSelect).onClick(
      clickEvt({ button: 0, shiftKey: false, ctrlKey: false, metaKey: false }),
    );
    expect(onSelect).toHaveBeenCalledWith(false);
  });

  it("shift / ctrl / meta click toggles multi-select", () => {
    const onSelect = vi.fn();
    const h = selectionHandlers(onSelect);
    h.onClick(clickEvt({ button: 0, shiftKey: true }));
    h.onClick(clickEvt({ button: 0, ctrlKey: true }));
    h.onClick(clickEvt({ button: 0, metaKey: true }));
    expect(onSelect.mock.calls).toEqual([[true], [true], [true]]);
  });

  it("right click never changes the selection", () => {
    const onSelect = vi.fn();
    selectionHandlers(onSelect).onClick(clickEvt({ button: 2 }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("tap is always single-select", () => {
    const onSelect = vi.fn();
    selectionHandlers(onSelect).onTap();
    expect(onSelect).toHaveBeenCalledWith(false);
  });
});
