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
      if (!generator) throw new Error(`Test missing ZPL generator for type: ${obj.type}`);
      const generatedZPL = generator(obj);
      expect(`^XA${generatedZPL}^XZ`).toBe(tc.zpl_input);
    });

    it("should compute display bounds logically consistent with bwip-js engine", async () => {
      const obj = defined(testModels[tc.id]);

      expect(obj.x).toBe(tc.expected_bounds.x);
      expect(obj.y).toBe(tc.expected_bounds.y);

      const opts = buildBwipOptions(obj);
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

      expect(displaySize.w).toBeGreaterThan(0);
      expect(displaySize.h).toBeGreaterThan(0);

      const is1DCode = [
        "code128", "ean13", "code39", "upca", "ean8", "interleaved2of5",
      ].includes(obj.type);
      const isSquare2D = ["qrcode", "datamatrix", "aztec"].includes(obj.type);

      if (is1DCode) {
        expect(displaySize.h).toBe((obj.props as { height: number }).height / 8);
      } else if (isSquare2D) {
        expect(displaySize.w).toBeCloseTo(displaySize.h, 2);
      } else if (obj.type === "pdf417") {
        expect(displaySize.w).toBeGreaterThan(0);
        expect(displaySize.h).toBeGreaterThan(0);
      }
    });
  });
});
