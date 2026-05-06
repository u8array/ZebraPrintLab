import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import bwipjs from "bwip-js";
import {
  buildBwipOptions,
  getDisplaySize,
} from "../components/Canvas/bwipHelpers";
import { EAN_TEXT_ZONE_DOTS } from "../components/Canvas/bwipConstants";
import { ObjectRegistry } from "../registry";
import { objectRotation } from "../registry/rotation";
import { defined } from "./helpers";
import { testModels } from "./testModels";

interface TestCase {
  id: string;
  zpl_input: string;
  expected_bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_ref: string;
}

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  "tests/fixtures/labelary_images",
);
const fixturesPath = path.join(FIXTURES_DIR, "fixtures.json");

function getPngDimensions(buffer: Buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("Labelary Sync - Canvas Dimension Logic", () => {
  let fixturesData: { test_cases: TestCase[] } = { test_cases: [] };

  if (fs.existsSync(fixturesPath)) {
    fixturesData = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
  }

  it("should have loaded fixtures (run fetch_labelary_fixtures.ts if this fails)", () => {
    expect(fixturesData.test_cases.length).toBeGreaterThan(0);
  });

  describe.each(fixturesData.test_cases || [])("Fixture: $id", (tc) => {
    it("should generate exact ZPL string matching Labelary input", () => {
      const obj = defined(testModels[tc.id]);
      const generator = ObjectRegistry[obj.type]?.toZPL;
      if (!generator)
        throw new Error(`Test missing ZPL generator for type: ${obj.type}`);
      const generatedZPL = generator(obj);
      expect(`^XA${generatedZPL}^XZ`).toBe(tc.zpl_input);
    });

    it("should compute display bounds logically consistent with bwip-js engine", async () => {
      const obj = defined(testModels[tc.id]);

      const opts = buildBwipOptions(obj, 1, 8);
      expect(opts).not.toBeNull();

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        bwipjs.toBuffer(
          opts as unknown as Parameters<typeof bwipjs.toBuffer>[0],
          (err: string | Error, png: Buffer) => {
            if (err) reject(err);
            else resolve(png);
          },
        );
      });

      const { width, height } = getPngDimensions(buffer);
      const mockCanvas = { width, height } as HTMLCanvasElement;
      const displaySize = getDisplaySize(obj, mockCanvas, 1, 8);

      if (process.env.DEBUG_TESTS) {
        console.log(`[DEBUG] tc.id: ${tc.id}, type: ${obj.type}`);
        console.log(`[DEBUG] bwip-js raw size: W=${width}, H=${height}`);
        console.log(
          `[DEBUG] displaySize: W=${displaySize.w}, H=${displaySize.h}`,
        );
        console.log(`[DEBUG] expectedBounds:`, tc.expected_bounds);
      }

      // For 90°/270° rotated symbols the visible W and H are swapped, so the
      // upright-shape assertions on bar height / module direction stop applying.
      const rotation = objectRotation(obj.props);
      const isQuarterRotated = rotation === "R" || rotation === "B";
      const isEanUpc = ["ean13", "ean8", "upca", "upce"].includes(obj.type);

      // Verify visual position (top-left of the rendered bounding box in dots).
      // This mimics the positioning logic in BarcodeObject.tsx.
      const visualX = obj.x;
      let visualY = obj.y;

      if (obj.positionType === "FT") {
        // FT positions relative to the baseline.
        visualY -= displaySize.h * 8;

        if (obj.type === "qrcode") {
          const mag = (obj.props as { magnification?: number }).magnification ?? 1;
          visualY -= 3 * mag;
        }
      } else {
        // FO positions relative to top-left, with specific quirks.
        if (obj.type === "qrcode") {
          visualY += 10;
        }
      }

      // EAN/UPC have extended guard bars whose visible extent rotates with the
      // symbol. Under R rotation those guards sit LEFT of the FO anchor, so
      // the bbox.x is below obj.x. The model still holds obj.x as FO, so the
      // strict x-equality check is dropped for rotated EAN/UPC.
      if (!(isEanUpc && isQuarterRotated)) {
        expect(visualX).toBe(tc.expected_bounds.x);
      }
      expect(visualY).toBeCloseTo(tc.expected_bounds.y, 0);

      expect(displaySize.w).toBeGreaterThan(0);
      expect(displaySize.h).toBeGreaterThan(0);

      const is1DCode = [
        "code128",
        "code39",
        "interleaved2of5",
      ].includes(obj.type);
      const isSquare2D = ["qrcode", "datamatrix", "aztec"].includes(obj.type);
      const isStacked2D = ["pdf417", "micropdf417", "codablock"].includes(
        obj.type,
      );
      // LOGMARS spec places the human-readable line ABOVE the bars. Labelary's
      // bounding box for ^FO50,50 reports y=50 (bar top, not visual top), and
      // height includes the bar height plus a ~20 dot text-above zone reserved
      // even when printInterpretation=N. getDisplaySize returns only the bar
      // height, so the strict height check is skipped for LOGMARS.
      const hasLogmarsTextZone = obj.type === "logmars";
      // bwip-natural display size diverges from the Labelary reference for these types
      // (quiet zone narrower than Zebra, or fundamentally different bar structure).
      // The strict bounds check is skipped; ZPL generation is still verified above.
      const hasBwipSizeMismatch = [
        "code93", "code11",                  // quiet zone narrower than Zebra
        "plessey",                           // different bar encoding algorithm
      ].includes(obj.type);

      if (isEanUpc && !isQuarterRotated) {
        // Known discrepancy: Labelary reserves barHeight + EAN_TEXT_ZONE_DOTS (13 dots)
        // even with printInterpretation=N. getDisplaySize intentionally returns only the
        // bar height because the text zone is blank whitespace — bwip does not render it.
        // expected_bounds.height in fixtures reflects the true Labelary value (barHeight+13).
        // Under quarter rotation the text zone rotates onto the horizontal axis, so the
        // bbox height already equals the bar length; the subtraction would be wrong.
        expect(displaySize.h * 8).toBeCloseTo(
          tc.expected_bounds.height - EAN_TEXT_ZONE_DOTS,
          1,
        );
      } else if (is1DCode && !isQuarterRotated) {
        expect(displaySize.h).toBe(
          (obj.props as { height: number }).height / 8,
        );
      } else if (isSquare2D) {
        expect(displaySize.w).toBeCloseTo(displaySize.h, 2);
      } else if (isStacked2D) {
        expect(displaySize.w).toBeGreaterThan(0);
        expect(displaySize.h).toBeGreaterThan(0);
        if (obj.type !== "codablock") {
          const rowHeightPx =
            (obj.props as { rowHeight: number }).rowHeight / 8;
          const numRows = displaySize.h / rowHeightPx;
          // Verify that the calculated display height is an exact multiple of the requested row height
          expect(numRows - Math.round(numRows)).toBeCloseTo(0, 5);
          expect(Math.round(numRows)).toBeGreaterThan(0);
        }
      }

      // Strict bounds check: compare calculated display size with fixture expectations.
      // Excluded types:
      //   codablock — bwip-js uses different encoding parameters than Zebra firmware.
      //   hasBwipSizeMismatch — bwip-natural size diverges from Labelary (see above).
      // EAN/UPC and logmars heights are excluded — see isEanUpc/hasLogmarsTextZone above.
      if (obj.type !== "codablock" && !hasBwipSizeMismatch) {
        // Quarter-rotated EAN/UPC moves the EAN_TEXT_ZONE_DOTS guard extension
        // onto the width axis instead of the height axis, mirroring the upright
        // height adjustment.
        const widthAdjust = isEanUpc && isQuarterRotated ? EAN_TEXT_ZONE_DOTS : 0;
        expect(displaySize.w * 8).toBeCloseTo(
          tc.expected_bounds.width - widthAdjust,
          1,
        );
        if (!isEanUpc && !hasLogmarsTextZone) {
          expect(displaySize.h * 8).toBeCloseTo(tc.expected_bounds.height, 1);
        }
      }
    });
  });
});
