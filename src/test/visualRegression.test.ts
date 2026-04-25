import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import bwipjs from "bwip-js";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { testCases } from "../../tests/fixtures/testCases";
import { testModels } from "./testModels";
import { defined } from "./helpers";
import {
  buildBwipOptions,
  getDisplaySize,
} from "../components/Canvas/bwipHelpers";

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  "tests/fixtures/labelary_images",
);
const DIFF_DIR = path.resolve(process.cwd(), "tests/fixtures/__diffs__");

// Ensure diff dir exists
if (!fs.existsSync(DIFF_DIR)) {
  fs.mkdirSync(DIFF_DIR, { recursive: true });
}

describe("Visual Regression - bwip-js vs Labelary", () => {
  it("should have test cases", () => {
    expect(testCases.length).toBeGreaterThan(0);
  });

  describe.each(testCases)("Visual Test: $id", (tc) => {
    it("should visually match Labelary output", async () => {
      const obj = defined(testModels[tc.id]);

      const fixturePath = path.join(FIXTURES_DIR, tc.image_ref);
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture not found: ${fixturePath}`);
      }

      // 1. Generate bwip-js buffer
      const opts = buildBwipOptions(obj);
      expect(opts).not.toBeNull();

      const localBwipBuffer = await new Promise<Buffer>((resolve, reject) => {
        bwipjs.toBuffer(
          opts as unknown as Parameters<typeof bwipjs.toBuffer>[0],
          (err: string | Error, png: Buffer) => {
            if (err) reject(err);
            else resolve(png);
          },
        );
      });

      // 2. Create blank 812x812 canvas
      const canvasWidth = 812;
      const canvasHeight = 812;
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext("2d");

      // Fill with white
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 3. Draw bwip-js output onto canvas
      const bwipImage = await loadImage(localBwipBuffer);

      // Calculate display size
      // We pass the bwipImage as a mock canvas to get its internal dimensions
      const displaySize = getDisplaySize(
        obj,
        bwipImage as unknown as HTMLCanvasElement,
        1,
        8,
      );

      ctx.drawImage(bwipImage, obj.x, obj.y, displaySize.w, displaySize.h);

      // 4. Compare with Labelary ref
      const labelaryRef = PNG.sync.read(fs.readFileSync(fixturePath));
      const localPng = PNG.sync.read(canvas.toBuffer("image/png"));

      expect(labelaryRef.width).toBe(canvasWidth);
      expect(labelaryRef.height).toBe(canvasHeight);

      const diff = new PNG({ width: canvasWidth, height: canvasHeight });

      const numDiffPixels = pixelmatch(
        labelaryRef.data,
        localPng.data,
        diff.data,
        canvasWidth,
        canvasHeight,
        { threshold: 0.1 },
      );

      // Allow ~5% tolerance (812x812 = ~659,344 pixels, 5% is ~32967)
      // Note: The current application renders interpretation text via Konva,
      // not bwip-js. Since this test only diffs the raw bwip-js buffer,
      // the absence of text (or font differences) requires a higher tolerance baseline.
      const ALLOWED_TOLERANCE = 35000;
      if (numDiffPixels > ALLOWED_TOLERANCE) {
        const diffPath = path.join(DIFF_DIR, `${tc.id}_diff.png`);
        fs.writeFileSync(diffPath, PNG.sync.write(diff));

        // Also save the local generated image for easier manual comparison
        const localPath = path.join(DIFF_DIR, `${tc.id}_local.png`);
        fs.writeFileSync(localPath, canvas.toBuffer("image/png"));
      }

      expect(numDiffPixels).toBeLessThanOrEqual(ALLOWED_TOLERANCE);
    });
  });
});
