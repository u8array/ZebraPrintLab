import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import bwipjs from "bwip-js";
import {
  buildBwipOptions,
  getDisplaySize,
} from "../components/Canvas/bwipHelpers";
import { ObjectRegistry } from "../registry";
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

      expect(visualX).toBe(tc.expected_bounds.x);
      expect(visualY).toBeCloseTo(tc.expected_bounds.y, 0);

      expect(displaySize.w).toBeGreaterThan(0);
      expect(displaySize.h).toBeGreaterThan(0);

      // EAN/UPC types include a mandatory text zone in their display height.
      const isEanUpc = ["ean13", "ean8", "upca", "upce"].includes(obj.type);
      const is1DCode = [
        "code128",
        "code39",
        "interleaved2of5",
      ].includes(obj.type);
      const isSquare2D = ["qrcode", "datamatrix", "aztec"].includes(obj.type);
      const isStacked2D = ["pdf417", "micropdf417", "codablock"].includes(
        obj.type,
      );

      if (isEanUpc) {
        // EAN/UPC display height = bar height + mandatory text zone (EAN_TEXT_ZONE_DOTS)
        expect(displaySize.h * 8).toBeCloseTo(tc.expected_bounds.height, 1);
      } else if (is1DCode) {
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
      // Codablock is excluded: bwip-js encodes it with different parameters than
      // Zebra firmware, producing a wider symbol. ZPL generation is still verified
      // by the ZPL string test above.
      if (obj.type !== "codablock") {
        expect(displaySize.w * 8).toBeCloseTo(tc.expected_bounds.width, 1);
        expect(displaySize.h * 8).toBeCloseTo(tc.expected_bounds.height, 1);
      }
    });
  });
});
