import { describe, it, expect } from "vitest";
import { pickAngle } from "./line";

describe("pickAngle", () => {
  describe("nearest-candidate behaviour at viewRotation=0", () => {
    it("picks 0° for an already-horizontal line clicking horizontal", () => {
      expect(pickAngle(0, [0, 180], 0)).toBe(180); // exact match → flip
    });

    it("picks 0° for a 45° line clicking horizontal (closer than 180°)", () => {
      expect(pickAngle(45, [0, 180], 0)).toBe(0);
    });

    it("picks 180° for a 170° line clicking horizontal", () => {
      expect(pickAngle(170, [0, 180], 0)).toBe(180);
    });

    it("picks 90° for a 45° line clicking vertical", () => {
      expect(pickAngle(45, [90, -90], 0)).toBe(90);
    });
  });

  describe("flip-on-second-click", () => {
    it("flips horizontal 0° ↔ 180° on repeated clicks", () => {
      expect(pickAngle(0, [0, 180], 0)).toBe(180);
      expect(pickAngle(180, [0, 180], 0)).toBe(0);
    });

    it("flips vertical 90° ↔ -90°", () => {
      expect(pickAngle(90, [90, -90], 0)).toBe(-90);
      expect(pickAngle(-90, [90, -90], 0)).toBe(90);
    });

    it("flips diagonal -45° ↔ 135°", () => {
      expect(pickAngle(-45, [-45, 135], 0)).toBe(135);
      expect(pickAngle(135, [-45, 135], 0)).toBe(-45);
    });
  });

  describe("view-rotation awareness (regression for the mirrored-picker bug)", () => {
    // viewRotation = 90 means the canvas is rotated 90° CW on screen.
    // A label-space angle of 0 (logical horizontal) appears vertical there,
    // so the horizontal-button [0,180] (screen-angles) must yield -90 / 90
    // in label-space to actually look horizontal on the rotated canvas.

    it("clicking horizontal on a 0°-stored line in 90° view yields -90 (looks horizontal)", () => {
      // candidates in label-space: 0-90=-90, 180-90=90.
      // currentAngle=0, dist(0,-90)=90, dist(0,90)=90 → tie → first candidate
      expect(pickAngle(0, [0, 180], 90)).toBe(-90);
    });

    it("clicking vertical in 90° view yields 0 (label-vertical = screen-horizontal at 0° view)", () => {
      // wait — clicking vertical in a 90° view should yield a line that LOOKS vertical on screen.
      // Screen-vertical = label-angle = 90 - 90 = 0 (or -90 - 90 = -180).
      // dist(0, 0) = 0 → exact match → flip → -180
      expect(pickAngle(0, [90, -90], 90)).toBe(-180);
      // dist(45, 0) = 45, dist(45, -180) = 135 → 0 wins
      expect(pickAngle(45, [90, -90], 90)).toBe(0);
    });

    it("clicking horizontal in 180° view yields -180 / 0", () => {
      // candidates: 0-180=-180, 180-180=0
      expect(pickAngle(45, [0, 180], 180)).toBe(0);
      expect(pickAngle(-170, [0, 180], 180)).toBe(-180);
    });

    it("clicking diagonal `/` in 90° view yields the screen-up-right diagonal", () => {
      // /'s screen-angles = [-45, 135], with viewRotation=90:
      //   candidates label-space: -135, 45
      // For a horizontal-ish line (angle=0):
      //   dist(0, -135) = 135, dist(0, 45) = 45 → 45 wins
      expect(pickAngle(0, [-45, 135], 90)).toBe(45);
    });
  });
});
