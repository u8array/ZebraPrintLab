# Test Reference Plan (test-ref-plan)

## 🎯 Goal
Ensure that the label elements rendered by our application (currently utilizing `bwip-js` for barcodes) visually match the exact output produced by the Zebra/Labelary rendering engine pixel-by-pixel.

## 📊 Current State
1. We have a script `tests/scripts/fetch_labelary_fixtures.ts` that automatically fetches reference PNG images from the Labelary API for a set of test cases (ZPL strings).
2. We have `src/test/labelarySync.test.ts` which verifies that our models generate the correct ZPL strings and checks that `bwip-js` display dimensions logically align with basic expectations.
3. **Gap**: We do not yet perform an actual visual (pixel-by-pixel) comparison between our rendering output and the Labelary reference images.

## 🛠 Proposed Architecture for Visual Regression Testing

To achieve exact visual parity with Labelary, we will introduce a Visual Regression Testing step into our `vitest` suite.

### 1. Dependencies
Add a library to perform image diffing in Node.js. 
- **`pixelmatch`**: A fast, simple image comparison library.
- **`pngjs`**: To decode/encode PNG images into raw pixel data for `pixelmatch`.
- *(Alternative: `@vitest/ui` combined with visual snapshot plugins, but `pixelmatch` gives us direct low-level control.)*

### 2. Matching Strategy
Labelary returns a full 4x4 inch label (at 8dpmm, this is 812x812 pixels). Our application renders individual components (like a barcode) using `bwip-js` or Konva.

**Approach:**
1. **Render Local Canvas:** In the test suite, use Node.js Canvas (`canvas` package) to create an 812x812 blank canvas (simulating the 4x4 label).
2. **Draw Element:** Take our internal `LabelObject` (e.g., a Code128 barcode), generate its rendering using `bwip-js.toBuffer()`, and draw it onto the local Canvas at the exact `x` and `y` coordinates defined in the model.
3. **Pixel Comparison:** Read the baseline PNG from `tests/fixtures/labelary_images/` using `pngjs`. Extract the pixel data from our local Canvas. Run both through `pixelmatch`.
4. **Threshold:** Assert that the number of mismatched pixels is extremely low (allow a small tolerance, e.g., 0.1% or 1%, for anti-aliasing or slight font-rendering differences).

### 3. Implementation Steps

1. **Install Dependencies:**
   ```bash
   pnpm add -D pixelmatch @types/pixelmatch pngjs @types/pngjs canvas
   ```

2. **Create `visualRegression.test.ts`:**
   Expand upon the current `labelarySync.test.ts` by adding a visual diffing function:
   ```typescript
   import pixelmatch from 'pixelmatch';
   import { PNG } from 'pngjs';
   import { createCanvas, loadImage } from 'canvas';
   // ... load testCases, generate local image buffer
   
   // Create full label canvas
   const canvas = createCanvas(812, 812);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'white';
   ctx.fillRect(0, 0, 812, 812);
   
   // Draw local element (bwip-js buffer)
   const bwipImage = await loadImage(localBwipBuffer);
   ctx.drawImage(bwipImage, obj.x, obj.y); // Adjust scaling/dimensions based on dpmm
   
   // Compare with Labelary ref
   const labelaryRef = PNG.sync.read(fs.readFileSync(fixturePath));
   const localPng = PNG.sync.read(canvas.toBuffer());
   
   const diff = new PNG({ width: 812, height: 812 });
   const numDiffPixels = pixelmatch(
       labelaryRef.data, localPng.data, diff.data, 812, 812, { threshold: 0.1 }
   );
   
   expect(numDiffPixels).toBeLessThan(ALLOWED_TOLERANCE);
   ```

3. **Diff Artifacts:** 
   If a test fails, write the `diff.data` to a `__diffs__` folder so developers can visually inspect exactly where the pixel mismatch occurred.

### 4. CI/CD Integration
- Run visual tests as part of the standard `npm run test` or a dedicated `npm run test:visual`.
- In GitHub Actions (e.g., `pr.yml`), upload the `__diffs__` folder as an artifact if the visual tests fail, allowing reviewers to easily spot discrepancies.

## ✅ Definition of Done
- `pixelmatch` and `pngjs` installed.
- Tests assert pixel equivalence against all fixtures in `tests/fixtures/labelary_images`.
- Failed visual tests emit a diff image.
- Documented process for updating reference fixtures when intentional changes to rendering are made.
