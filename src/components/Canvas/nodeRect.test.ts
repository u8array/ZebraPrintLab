import { describe, expect, it } from "vitest";
import Konva from "konva";
import { parentRect } from "./nodeRect";

/** Mirrors the canvas structure: a rotation group (pivot at label center)
 *  containing the object node, whose child renders at a local offset (like
 *  QR's shift). Commit math runs in the rotation group's frame, so parentRect
 *  must match that frame at every view rotation. */
function buildTree(viewRotation: number) {
  const cx = 200;
  const cy = 150;
  const root = new Konva.Group();
  const rotationGroup = new Konva.Group({
    x: cx,
    y: cy,
    offsetX: cx,
    offsetY: cy,
    rotation: viewRotation,
  });
  root.add(rotationGroup);
  const node = new Konva.Group({ x: 80, y: 60 });
  node.add(new Konva.Rect({ x: 0, y: 10, width: 40, height: 30 }));
  rotationGroup.add(node);
  return node;
}

const PARENT_FRAME_RECT = { x: 80, y: 70, width: 40, height: 30 };

describe("parentRect", () => {
  it("captures the node bbox in the parent frame at view rotation 0", () => {
    expect(parentRect(buildTree(0))).toEqual(PARENT_FRAME_RECT);
  });

  it.each([90, 180, 270])(
    "is invariant under view rotation %d (regression: rotated capture walked the 2D-code anchor)",
    (rotation) => {
      expect(parentRect(buildTree(rotation))).toEqual(PARENT_FRAME_RECT);
    },
  );
});
