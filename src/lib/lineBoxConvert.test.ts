import { describe, it, expect } from "vitest";
import {
  canToggleShapeMode,
  oppositeShapeMode,
  lineToBox,
  boxToLine,
  toggleShapeMode,
} from "./lineBoxConvert";
import { line, type LineProps } from "@zplab/core/registry/line";
import { box, type BoxProps } from "@zplab/core/registry/box";
import type { LabelObject } from "@zplab/core/types/Group";

const lineLeaf = (x: number, y: number, props: Partial<LineProps>): LabelObject =>
  ({
    id: "ln",
    type: "line",
    x,
    y,
    rotation: 0,
    props: { angle: 0, length: 200, thickness: 3, color: "B", ...props },
  }) as unknown as LabelObject;

const boxLeaf = (x: number, y: number, props: Partial<BoxProps>): LabelObject =>
  ({
    id: "bx",
    type: "box",
    x,
    y,
    rotation: 0,
    props: { width: 200, height: 100, thickness: 3, filled: false, color: "B", rounding: 0, ...props },
  }) as unknown as LabelObject;

const zpl = (o: LabelObject) =>
  o.type === "line"
    ? line.toZPL(o as Parameters<typeof line.toZPL>[0])
    : box.toZPL(o as Parameters<typeof box.toZPL>[0]);

describe("canToggleShapeMode", () => {
  it("filled box toggles", () => {
    expect(canToggleShapeMode(boxLeaf(0, 0, { filled: true }))).toBe(true);
  });
  it("thin box that renders solid toggles even when not filled", () => {
    expect(canToggleShapeMode(boxLeaf(0, 0, { width: 200, height: 3, thickness: 3, filled: false }))).toBe(true);
  });
  it("outline box (renders as a frame) does not toggle", () => {
    expect(canToggleShapeMode(boxLeaf(0, 0, { width: 400, height: 300, thickness: 3, filled: false }))).toBe(false);
  });
  it("rounded filled box does not toggle (a line has no rounding)", () => {
    expect(canToggleShapeMode(boxLeaf(0, 0, { filled: true, rounding: 4 }))).toBe(false);
  });
  it("toggles at the exact solid-collapse boundary 2t == min(w,h)", () => {
    expect(canToggleShapeMode(boxLeaf(0, 0, { width: 200, height: 6, thickness: 3, filled: false }))).toBe(true);
  });
  it("axis-aligned line toggles (0/90/180/270)", () => {
    for (const angle of [0, 90, 180, 270, -90, 360])
      expect(canToggleShapeMode(lineLeaf(0, 0, { angle }))).toBe(true);
  });
  it("diagonal line does not toggle", () => {
    for (const angle of [45, -45, 30, 135])
      expect(canToggleShapeMode(lineLeaf(0, 0, { angle }))).toBe(false);
  });
  it("near-axis line does not toggle (still prints diagonal ^GD)", () => {
    for (const angle of [0.4, 89.7, 90.3, 179.6])
      expect(canToggleShapeMode(lineLeaf(0, 0, { angle }))).toBe(false);
  });
  it("other types never toggle", () => {
    expect(canToggleShapeMode({ type: "text" } as unknown as LabelObject)).toBe(false);
  });
});

describe("oppositeShapeMode", () => {
  it("line -> box, box -> line, else null", () => {
    expect(oppositeShapeMode(lineLeaf(0, 0, {}))).toBe("box");
    expect(oppositeShapeMode(boxLeaf(0, 0, {}))).toBe("line");
    expect(oppositeShapeMode({ type: "text" } as unknown as LabelObject)).toBeNull();
  });
});

describe("lineToBox geometry + ZPL parity", () => {
  it("horizontal (angle 0): width=length, height=thickness, filled, same pixels", () => {
    const ln = lineLeaf(50, 100, { angle: 0, length: 200, thickness: 3 });
    const bx = lineToBox(ln as never);
    expect(bx.type).toBe("box");
    expect(bx.x).toBe(50);
    expect(bx.y).toBe(100);
    expect(bx.props).toMatchObject({ width: 200, height: 3, filled: true });
    expect(zpl(bx)).toBe(zpl(ln));
  });

  it("vertical (angle 90): width=thickness, height=length, same pixels", () => {
    const ln = lineLeaf(50, 100, { angle: 90, length: 200, thickness: 3 });
    const bx = lineToBox(ln as never);
    expect(bx.x).toBe(50);
    expect(bx.y).toBe(100);
    expect(bx.props).toMatchObject({ width: 3, height: 200 });
    expect(zpl(bx)).toBe(zpl(ln));
  });

  it("angle 180 shifts top-left left so the covered pixels match", () => {
    const ln = lineLeaf(300, 100, { angle: 180, length: 200, thickness: 3 });
    const bx = lineToBox(ln as never);
    expect(bx.x).toBe(100); // 300 - 200
    expect(bx.y).toBe(100);
    expect(zpl(bx)).toBe(zpl(ln));
  });

  it("angle 270 shifts top-left up so the covered pixels match", () => {
    const ln = lineLeaf(50, 300, { angle: 270, length: 200, thickness: 3 });
    const bx = lineToBox(ln as never);
    expect(bx.x).toBe(50);
    expect(bx.y).toBe(100); // 300 - 200
    expect(zpl(bx)).toBe(zpl(ln));
  });

  it("stays byte-identical in ZPL across thicknesses (incl. below box default)", () => {
    for (const thickness of [1, 2, 3, 5, 50]) {
      const ln = lineLeaf(0, 0, { angle: 0, length: 200, thickness });
      expect(zpl(lineToBox(ln as never))).toBe(zpl(ln));
    }
  });

  it("caps the stored border at the line thickness so a thin line stays thin", () => {
    const bx = lineToBox(lineLeaf(0, 0, { angle: 0, length: 200, thickness: 1 }) as never);
    expect(bx.props.thickness).toBe(1); // not the box default (3)
  });

  it("carries color and reverse, drops angle/length (no leak)", () => {
    const bx = lineToBox(lineLeaf(0, 0, { color: "W", reverse: true }) as never);
    expect(bx.props.color).toBe("W");
    expect(bx.props.reverse).toBe(true);
    expect(bx.props).not.toHaveProperty("angle");
    expect(bx.props).not.toHaveProperty("length");
  });
});

describe("boxToLine geometry", () => {
  it("wide box -> horizontal line: length=width, thickness=height, same top-left", () => {
    const bx = boxLeaf(50, 100, { width: 200, height: 40 });
    const ln = boxToLine(bx as never);
    expect(ln.type).toBe("line");
    expect(ln.x).toBe(50);
    expect(ln.y).toBe(100);
    expect(ln.props).toMatchObject({ angle: 0, length: 200, thickness: 40 });
  });

  it("tall box -> vertical line: length=height, thickness=width", () => {
    const ln = boxToLine(boxLeaf(0, 0, { width: 40, height: 200 }) as never);
    expect(ln.props).toMatchObject({ angle: 90, length: 200, thickness: 40 });
  });

  it("a solid box stays byte-identical in ZPL (wide and tall)", () => {
    // Only solid boxes are offered for box->line; both axes must round-trip.
    const wide = boxLeaf(50, 100, { width: 200, height: 40, filled: true });
    expect(zpl(boxToLine(wide as never))).toBe(zpl(wide));
    const tall = boxLeaf(50, 100, { width: 40, height: 200, filled: true });
    expect(zpl(boxToLine(tall as never))).toBe(zpl(tall));
  });

  it("drops rounding/filled, keeps color and reverse", () => {
    const ln = boxToLine(boxLeaf(0, 0, { rounding: 4, filled: true, color: "W", reverse: true }) as never);
    expect(ln.props).not.toHaveProperty("rounding");
    expect(ln.props).not.toHaveProperty("filled");
    expect(ln.props.color).toBe("W");
    expect(ln.props.reverse).toBe(true);
  });

  it("square box (w==h) maps to a horizontal line", () => {
    const ln = boxToLine(boxLeaf(0, 0, { width: 80, height: 80 }) as never);
    expect(ln.props).toMatchObject({ angle: 0, length: 80, thickness: 80 });
  });

  // Pure geometry: boxToLine maps the longer axis to length regardless of fill.
  // (The toggle only reaches it for solid boxes; canToggleShapeMode gates the rest.)
  it("maps the longer axis to length, shorter to thickness", () => {
    const ln = boxToLine(boxLeaf(0, 0, { width: 400, height: 300, filled: true }) as never);
    expect(ln.props).toMatchObject({ angle: 0, length: 400, thickness: 300 });
  });
});

describe("toggleShapeMode enforces convertibility (not only the UI)", () => {
  it("a diagonal line is returned unchanged (no lossy box)", () => {
    const ln = lineLeaf(0, 0, { angle: 45 });
    expect(toggleShapeMode(ln)).toBe(ln);
  });
});

describe("lineToBox preserves FT positioning and keeps ZPL parity", () => {
  it("FT-anchored line round-trips to the same ^GB", () => {
    const ln = {
      ...lineLeaf(50, 100, { angle: 0, length: 200, thickness: 3 }),
      positionType: "FT",
    } as LabelObject;
    const bx = lineToBox(ln as never);
    expect(bx.positionType).toBe("FT");
    expect(zpl(bx)).toBe(zpl(ln));
  });
});

describe("toggleShapeMode", () => {
  it("dispatches by type and preserves base fields (id, locked, name)", () => {
    const ln = { ...lineLeaf(0, 0, {}), locked: true, name: "rule" } as LabelObject;
    const bx = toggleShapeMode(ln);
    expect(bx.type).toBe("box");
    expect(bx.id).toBe("ln");
    expect(bx.locked).toBe(true);
    expect(bx.name).toBe("rule");
  });

  it("non-convertible type is returned unchanged", () => {
    const t = { type: "text" } as unknown as LabelObject;
    expect(toggleShapeMode(t)).toBe(t);
  });

  it("line -> box -> line round-trips axis-aligned props (canonical)", () => {
    const ln = lineLeaf(50, 100, { angle: 0, length: 200, thickness: 3, color: "B" });
    const back = toggleShapeMode(toggleShapeMode(ln));
    expect(back.type).toBe("line");
    expect(back.x).toBe(50);
    expect(back.y).toBe(100);
    expect((back as { props: LineProps }).props).toMatchObject({ angle: 0, length: 200, thickness: 3 });
  });
});
