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
import { QR_FO_Y_OFFSET_DOTS } from "../components/Canvas/bwipConstants";

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
    // TODO: Fix the following visual mismatches
    const failingTests = [
      "barcode_datamatrix_standard", // bwip-js and Zebra/Labelary use different DataMatrix encodings for same text
      "barcode_micropdf417_standard", // bwip-js and Zebra produce different column layouts for micropdf417
      "barcode_codablock_standard", // bwip-js encodes codablock with different parameters than Zebra firmware
      "barcode_pdf417_auto", // bwip-js selects 8 rows where Labelary/Zebra selects 10
      "barcode_pdf417_auto_ecc", // same bwip-js/Zebra row count discrepancy; reference PNG not yet captured
    ];

    const testFn = failingTests.includes(tc.id) ? it.skip : it;

    testFn("should visually match Labelary output", async () => {
      const obj = defined(testModels[tc.id]);

      const fixturePath = path.join(FIXTURES_DIR, tc.image_ref);
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture not found: ${fixturePath}`);
      }

      // 1. Generate bwip-js buffer (scale=8, dpmm=8 matches Labelary 8dpmm render)
      const opts = buildBwipOptions(obj, 8, 8);
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
        8,
        8,
      );

      // Zebra firmware renders ^FO-positioned QR codes with a +10 dot Y offset.
      // Match production BarcodeObject.tsx behaviour.
      const drawY = obj.type === "qrcode" ? obj.y + QR_FO_Y_OFFSET_DOTS : obj.y;
      ctx.drawImage(bwipImage, obj.x, drawY, displaySize.w, displaySize.h);

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

      // With printInterpretation disabled, we expect a near-perfect visual match
      // of just the barcode itself. Allow only a very small tolerance (<0.1%)
      // for minor anti-aliasing or rendering artifacts.
      const ALLOWED_TOLERANCE = 500;
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
