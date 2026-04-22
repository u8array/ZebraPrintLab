import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import bwipjs from "bwip-js";
import {
  buildBwipOptions,
  getDisplaySize,
} from "../components/Canvas/bwipHelpers";
import { code128 } from "../registry/code128";
import { qrcode } from "../registry/qrcode";
import { ean13 } from "../registry/ean13";
import { datamatrix } from "../registry/datamatrix";
import { code39 } from "../registry/code39";
import { pdf417 } from "../registry/pdf417";
import type { LabelObject } from "../types/ObjectType";

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

// Helper to reliably extract width/height from a PNG buffer
function getPngDimensions(buffer: Buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

// Define the internal Object configurations that correspond to the Labelary fixtures
const testModels: Record<string, LabelObject> = {
  barcode_code128_standard: {
    id: "1",
    type: "code128",
    x: 50,
    y: 50,
    props: {
      content: "123456",
      height: 100,
      moduleWidth: 2,
      printInterpretation: true,
      checkDigit: false,
    },
  },
  barcode_code128_small_no_text: {
    id: "2",
    type: "code128",
    x: 100,
    y: 100,
    props: {
      content: "TEST",
      height: 50,
      moduleWidth: 1,
      printInterpretation: false,
      checkDigit: false,
    },
  },
  barcode_code128_large_check_digit: {
    id: "3",
    type: "code128",
    x: 20,
    y: 20,
    props: {
      content: "98765",
      height: 150,
      moduleWidth: 3,
      printInterpretation: true,
      checkDigit: true,
    },
  },
  barcode_qr_standard: {
    id: "4",
    type: "qrcode",
    x: 50,
    y: 50,
    props: {
      content: "Hello World",
      magnification: 4,
      errorCorrection: "Q",
    },
  },
  barcode_qr_large_high_ec: {
    id: "5",
    type: "qrcode",
    x: 150,
    y: 150,
    props: {
      content: "Zebra Print Lab QR Code Testing",
      magnification: 8,
      errorCorrection: "H",
    },
  },
  barcode_ean13_standard: {
    id: "6",
    type: "ean13",
    x: 50,
    y: 50,
    props: {
      content: "123456789012",
      height: 100,
      moduleWidth: 2,
      printInterpretation: true,
    },
  },
  barcode_datamatrix_standard: {
    id: "7",
    type: "datamatrix",
    x: 50,
    y: 50,
    props: {
      content: "DataMatrixTest",
      dimension: 5,
      quality: 200,
    },
  },
  barcode_code39_standard: {
    id: "8",
    type: "code39",
    x: 50,
    y: 50,
    props: {
      content: "CODE39",
      height: 100,
      moduleWidth: 2,
      printInterpretation: true,
      checkDigit: false,
    },
  },
  barcode_pdf417_standard: {
    id: "9",
    type: "pdf417",
    x: 50,
    y: 50,
    props: {
      content: "PDF417Test",
      rowHeight: 10,
      securityLevel: 0,
      columns: 0,
      moduleWidth: 2,
    },
  },
};

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
      const obj = testModels[tc.id];
      expect(obj).toBeDefined();

      let generatedZPL = "";
      if (obj.type === "code128") {
        generatedZPL = code128.toZPL!(obj);
      } else if (obj.type === "qrcode") {
        generatedZPL = qrcode.toZPL!(obj);
      } else if (obj.type === "ean13") {
        generatedZPL = ean13.toZPL!(obj);
      } else if (obj.type === "datamatrix") {
        generatedZPL = datamatrix.toZPL!(obj);
      } else if (obj.type === "code39") {
        generatedZPL = code39.toZPL!(obj);
      } else if (obj.type === "pdf417") {
        generatedZPL = pdf417.toZPL!(obj);
      } else {
        throw new Error(`Test missing ZPL generator for type: ${obj.type}`);
      }

      const expectedZPL = `^XA${generatedZPL}^XZ`;
      expect(expectedZPL).toBe(tc.zpl_input);
    });

    it("should compute display bounds logically consistent with bwip-js engine", async () => {
      const obj = testModels[tc.id];

      expect(obj.x).toBe(tc.expected_bounds.x);
      expect(obj.y).toBe(tc.expected_bounds.y);

      const opts = buildBwipOptions(obj);
      expect(opts).not.toBeNull();

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        bwipjs.toBuffer(
          opts as unknown as Parameters<typeof bwipjs.toBuffer>[0],
          (err, png) => {
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

      if (obj.type === "code128" || obj.type === "ean13" || obj.type === "code39") {
        expect(displaySize.h).toBe((obj.props as { height: number }).height / 8);
      } else if (obj.type === "qrcode" || obj.type === "datamatrix") {
        // Many 2D barcodes like QR and DataMatrix are square matrices
        expect(displaySize.w).toBeCloseTo(displaySize.h, 2);
      } else if (obj.type === "pdf417") {
        // PDF417 height/width are completely variable based on rows/cols and content length.
        // We ensure that calculated display sizes are logically > 0.
        expect(displaySize.w).toBeGreaterThan(0);
        expect(displaySize.h).toBeGreaterThan(0);
      }
    });
  });
});
