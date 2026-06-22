import { describe, it, expect } from "vitest";
import { modelPositionFromRenderedTopLeft } from "./transformPosition";
import { QR_FO_Y_OFFSET_DOTS } from "../../lib/bwipConstants";
import type { LabelObject } from "../../types/Group";

const qrFo: LabelObject = {
  id: "q1",
  type: "qrcode",
  x: 0,
  y: 0,
  rotation: 0,
  positionType: "FO",
  props: { content: "x", magnification: 4, errorCorrection: "Q", model: 2, rotation: "N" },
};

const ellipse: LabelObject = {
  id: "e1",
  type: "ellipse",
  x: 0,
  y: 0,
  rotation: 0,
  props: { width: 150, height: 100, thickness: 3, filled: false, color: "B" },
};

describe("modelPositionFromRenderedTopLeft", () => {
  it("subtracts QR FO Y offset for QR codes with positionType=FO", () => {
    expect(modelPositionFromRenderedTopLeft(qrFo, 100, 200)).toEqual({
      x: 100,
      y: 200 - QR_FO_Y_OFFSET_DOTS,
    });
  });

  it("subtracts QR FO Y offset when positionType is undefined (defaults to FO)", () => {
    const obj = { ...qrFo, positionType: undefined };
    expect(modelPositionFromRenderedTopLeft(obj, 100, 200)).toEqual({
      x: 100,
      y: 200 - QR_FO_Y_OFFSET_DOTS,
    });
  });

  it("does not subtract Y offset for QR codes with positionType=FT", () => {
    const obj: LabelObject = { ...qrFo, positionType: "FT" };
    expect(modelPositionFromRenderedTopLeft(obj, 100, 200)).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("returns rendered position unchanged for ellipse", () => {
    expect(modelPositionFromRenderedTopLeft(ellipse, 50, 80)).toEqual({
      x: 50,
      y: 80,
    });
  });

  it("preserves x for QR codes (only Y is offset)", () => {
    expect(modelPositionFromRenderedTopLeft(qrFo, -7, 17).x).toBe(-7);
  });

  it("is idempotent under repeated application for non-QR types", () => {
    const once = modelPositionFromRenderedTopLeft(ellipse, 10, 20);
    const twice = modelPositionFromRenderedTopLeft(ellipse, once.x, once.y);
    expect(twice).toEqual(once);
  });
});
