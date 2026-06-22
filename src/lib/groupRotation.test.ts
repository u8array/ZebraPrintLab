import { describe, it, expect } from "vitest";
import { rotateSelectionChanges } from "./groupRotation";
import type { LabelObject } from "../types/Group";
import { objectBoundsDots, type ObjectBoundsCtx } from "./objectBounds";
import { barSubRect, EAN_TEXT_ZONE_DOTS } from "./bwipConstants";

const LABEL = { widthMm: 100, heightMm: 50, dpmm: 8 };
const ctx = (measured?: ObjectBoundsCtx["measured"]): ObjectBoundsCtx => ({ label: LABEL, measured });

function leaf(type: string, x: number, y: number, props: object): LabelObject {
  return { id: `${type}-${x}-${y}`, type, x, y, rotation: 0, props } as unknown as LabelObject;
}
const box = (x: number, y: number, w: number, h: number) =>
  leaf("box", x, y, { width: w, height: h, thickness: 2, filled: false, color: "B", rounding: 0 });

describe("rotateSelectionChanges", () => {
  it("box 90deg about its own centre swaps w/h and stays centred", () => {
    const b = box(10, 10, 40, 20); // centre (30,20)
    const c = rotateSelectionChanges([b], [b.id], ctx(), 1).get(b.id);
    // centre fixed, dims swap to 20x40 -> top-left (20,0)
    expect(c).toEqual({ x: 20, y: 0, props: { width: 20, height: 40 } });
  });

  it("box 180deg keeps dims and position (centre pivot)", () => {
    const b = box(10, 10, 40, 20);
    const c = rotateSelectionChanges([b], [b.id], ctx(), 2).get(b.id);
    expect(c).toEqual({ x: 10, y: 10, props: { width: 40, height: 20 } });
  });

  it("four quarter turns return a box to its origin", () => {
    let b = box(10, 10, 40, 20);
    for (let i = 0; i < 4; i++) {
      const c = rotateSelectionChanges([b], [b.id], ctx(), 1).get(b.id)!;
      const props = (b as unknown as { props: object }).props;
      b = { ...b, x: c.x!, y: c.y!, props: { ...props, ...c.props } } as unknown as LabelObject;
    }
    expect(b.x).toBe(10);
    expect(b.y).toBe(10);
    expect((b as unknown as { props: { width: number } }).props.width).toBe(40);
  });

  it("text advances orientation and rotates the anchor about the pivot", () => {
    const t = leaf("text", 10, 10, { content: "Hi", fontHeight: 10, fontWidth: 0, rotation: "N" });
    const measured = new Map([[t.id, { width: 30, height: 10 }]]); // bbox (10,10,30,10), centre (25,15)
    const c = rotateSelectionChanges([t], [t.id], ctx(measured), 1).get(t.id);
    expect(c).toEqual({ x: 30, y: 0, props: { rotation: "R" } });
  });

  it("text orientation wraps B -> N on a clockwise turn", () => {
    const t = leaf("text", 0, 0, { content: "x", fontHeight: 10, fontWidth: 0, rotation: "B" });
    const measured = new Map([[t.id, { width: 10, height: 10 }]]);
    const c = rotateSelectionChanges([t], [t.id], ctx(measured), 1).get(t.id);
    expect(c?.props).toEqual({ rotation: "N" });
  });

  it("line adds 90deg to the angle and rotates the start point", () => {
    const ln = leaf("line", 10, 10, { angle: 0, length: 50, thickness: 2, color: "B" });
    const c = rotateSelectionChanges([ln], [ln.id], ctx(), 1).get(ln.id);
    // bbox (10,10,50,2) centre (35,11); start (10,10) -> (36,-14); angle 90
    expect(c).toEqual({ x: 36, y: -14, props: { angle: 90 } });
  });

  it("multi-select rotates each leaf about the shared union centre", () => {
    const a = box(0, 0, 20, 20); // centre (10,10)
    const b = box(40, 0, 20, 20); // centre (50,10); union centre (30,10)
    const changes = rotateSelectionChanges([a, b], [a.id, b.id], ctx(), 1);
    // horizontal pair -> vertical stack, both at x=20
    expect(changes.get(a.id)).toEqual({ x: 20, y: -20, props: { width: 20, height: 20 } });
    expect(changes.get(b.id)).toEqual({ x: 20, y: 20, props: { width: 20, height: 20 } });
  });

  it("symbol advances orientation, footprint stays square", () => {
    const s = leaf("symbol", 10, 10, { symbol: "A", width: 30, height: 30, rotation: "N" });
    const c = rotateSelectionChanges([s], [s.id], ctx(), 1).get(s.id);
    expect(c).toEqual({ x: 10, y: 10, props: { rotation: "R" } });
  });

  it("no drift over four turns with a non-integer union centre", () => {
    // union (0,0)-(61,20), centre x=30.5 -> a float pivot would round each step
    // and the two boxes would drift apart, only re-aligning after 360deg.
    let a = box(0, 0, 20, 20);
    let b = box(41, 0, 20, 20);
    const gap = () => {
      const ca = { x: (a.x as number) + 10, y: (a.y as number) + 10 };
      const cb = { x: (b.x as number) + 10, y: (b.y as number) + 10 };
      return Math.hypot(ca.x - cb.x, ca.y - cb.y);
    };
    const start = gap();
    for (let i = 0; i < 4; i++) {
      const m = rotateSelectionChanges([a, b], [a.id, b.id], ctx(), 1);
      const ca = m.get(a.id)!, cb = m.get(b.id)!;
      a = { ...a, x: ca.x!, y: ca.y! } as unknown as LabelObject;
      b = { ...b, x: cb.x!, y: cb.y! } as unknown as LabelObject;
      // The real fix: spacing is exact at every step (objects never spread).
      expect(gap()).toBe(start);
    }
    // Absolute position can shift by <=1 dot from the half-pixel pivot snap, but
    // it never accumulates beyond that (rigid, not a runaway drift).
    expect(Math.abs((a.x as number) - 0)).toBeLessThanOrEqual(2);
    expect(Math.abs((b.x as number) - 41)).toBeLessThanOrEqual(2);
  });

  it("excludes locked leaves: they neither move nor shift the pivot", () => {
    const a = box(0, 0, 20, 20);
    const locked = { ...box(40, 0, 20, 20), locked: true } as unknown as LabelObject;
    const m = rotateSelectionChanges([a, locked], [a.id, locked.id], ctx(), 1);
    expect(m.has(locked.id)).toBe(false); // locked never gets a change
    // pivot is a's own centre (locked excluded), so a rotates in place
    expect(m.get(a.id)).toEqual({ x: 0, y: 0, props: { width: 20, height: 20 } });
  });

  it("FT EAN13 with HRI stays centre-rigid on a 90deg turn", () => {
    // A barcode keeps its top-left on an orientation change and its HRI zone
    // travels, so naive anchor-rotation would shift it. The centre must hold.
    const tz = EAN_TEXT_ZONE_DOTS;
    const W = 100, H = 60;
    const ean = {
      id: "ean", type: "ean13", x: 200, y: 100, rotation: 0, positionType: "FT",
      props: { rotation: "N", magnification: 2, printInterpretation: true },
    } as unknown as LabelObject;
    const footprint = (rot: "N" | "R", w: number, h: number) => {
      const r = barSubRect(rot, false, tz, w, h);
      return new Map([[ean.id, { width: w, height: h, barHeightDots: r.barH, barLeftDots: r.barLeft, barTopDots: r.barTop }]]);
    };
    const before = objectBoundsDots(ean, ctx(footprint("N", W, H)));
    const beforeC = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

    const c = rotateSelectionChanges([ean], [ean.id], ctx(footprint("N", W, H)), 1).get(ean.id)!;
    expect(c.props).toEqual({ rotation: "R" });

    // Renderer republishes the swapped footprint + R-orientation bar sub-rect.
    const rotated = { ...ean, x: c.x, y: c.y, props: { rotation: "R", magnification: 2, printInterpretation: true } } as unknown as LabelObject;
    const after = objectBoundsDots(rotated, ctx(footprint("R", H, W)));
    const afterC = { x: after.x + after.width / 2, y: after.y + after.height / 2 };

    expect(Math.abs(afterC.x - beforeC.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterC.y - beforeC.y)).toBeLessThanOrEqual(1);
  });

  it("FT EAN13 with HRI returns to origin over four turns (no drift)", () => {
    // Each turn republishes the swapped footprint, so this exercises all four
    // orientations and guards the re-anchor against per-step rounding drift.
    const tz = EAN_TEXT_ZONE_DOTS;
    const W = 100, H = 60;
    const rots = ["N", "R", "I", "B"] as const;
    const dims = (rot: (typeof rots)[number]): [number, number] =>
      rot === "N" || rot === "I" ? [W, H] : [H, W];
    const measuredFor = (id: string, rot: (typeof rots)[number]) => {
      const [w, h] = dims(rot);
      const r = barSubRect(rot, false, tz, w, h);
      return new Map([[id, { width: w, height: h, barHeightDots: r.barH, barLeftDots: r.barLeft, barTopDots: r.barTop }]]);
    };
    let ean = {
      id: "ean", type: "ean13", x: 200, y: 100, rotation: 0, positionType: "FT",
      props: { rotation: "N", magnification: 2, printInterpretation: true },
    } as unknown as LabelObject;
    const centreOf = (o: LabelObject, rot: (typeof rots)[number]) => {
      const b = objectBoundsDots(o, ctx(measuredFor(o.id, rot)));
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const start = centreOf(ean, "N");
    for (let i = 0; i < 4; i++) {
      const c = rotateSelectionChanges([ean], [ean.id], ctx(measuredFor(ean.id, rots[i]!)), 1).get(ean.id)!;
      const next = rots[(i + 1) % 4]!;
      ean = { ...ean, x: c.x, y: c.y, props: { rotation: next, magnification: 2, printInterpretation: true } } as unknown as LabelObject;
      const centre = centreOf(ean, next);
      expect(Math.abs(centre.x - start.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(centre.y - start.y)).toBeLessThanOrEqual(1);
    }
    expect((ean as unknown as { props: { rotation: string } }).props.rotation).toBe("N");
    expect(Math.abs((ean.x as number) - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs((ean.y as number) - 100)).toBeLessThanOrEqual(2);
  });

  it("returns no changes for a zero (mod 4) turn", () => {
    const b = box(10, 10, 40, 20);
    expect(rotateSelectionChanges([b], [b.id], ctx(), 4).size).toBe(0);
  });

  it("excludes leaves under a locked group (cascaded lock) from pivot and changes", () => {
    const a = box(0, 0, 20, 20); // movable, centre (10,10)
    const inner = box(40, 0, 20, 20); // would pull the pivot right if counted
    const grp = { id: "g", type: "group", locked: true, children: [inner] } as unknown as LabelObject;
    const m = rotateSelectionChanges([a, grp], [a.id, "g"], ctx(), 1);
    expect(m.has(inner.id)).toBe(false); // store would refuse to move it anyway
    expect(m.has("g")).toBe(false);
    // pivot is a's own centre (locked subtree excluded), so a rotates in place
    expect(m.get(a.id)).toEqual({ x: 0, y: 0, props: { width: 20, height: 20 } });
  });

  it("excludes hidden children of a selected group from pivot and changes", () => {
    const vis = box(0, 0, 20, 20); // centre (10,10)
    const hidden = { ...box(40, 0, 20, 20), visible: false } as unknown as LabelObject;
    const grp = { id: "g", type: "group", children: [vis, hidden] } as unknown as LabelObject;
    const m = rotateSelectionChanges([grp], ["g"], ctx(), 1);
    expect(m.has(hidden.id)).toBe(false); // off screen, must not rotate or skew pivot
    expect(m.get(vis.id)).toEqual({ x: 0, y: 0, props: { width: 20, height: 20 } });
  });
});
