# Visual Regression Test Plan

## Goal

Ensure that barcode elements rendered by the application (via `bwip-js`) visually match
the output of the Labelary rendering engine pixel-by-pixel.

## Current State

1. `tests/scripts/fetch_labelary_fixtures.ts` fetches reference PNG images from the
   Labelary API for a defined set of ZPL test cases.
2. `src/test/labelarySync.test.ts` verifies that models generate the correct ZPL strings
   and checks that `bwip-js` display dimensions are logically consistent.
3. Gap: no actual pixel-level comparison between local rendering and Labelary references.

## Architecture

### Dependencies

- `pixelmatch` - fast pixel-level image comparison
- `pngjs` - PNG decode/encode for pixelmatch input
- `@napi-rs/canvas` - Node.js canvas for compositing the local render

### Matching Strategy

Labelary returns a 812x812 px image (4x4 inch at 8 dpmm). The test:

1. Creates a blank 812x812 canvas.
2. Renders the `LabelObject` via `bwip-js.toBuffer()` and draws it at `obj.x`/`obj.y`
   using `getDisplaySize` for correct scaling.
3. Reads the Labelary reference PNG from `tests/fixtures/labelary_images/`.
4. Runs both through `pixelmatch` and asserts the diff pixel count is below a threshold.

Failed tests write a diff image to `tests/fixtures/__diffs__/` (gitignored) for
manual inspection.

### Threshold

35,000 pixels (~5% of 812x812). Interpretation text is rendered by Konva in the
application, not by `bwip-js`, so font differences require a looser baseline.

## CI Integration

- Visual tests run as part of the standard `pnpm test` suite.
- If tests fail, the `__diffs__` folder can be uploaded as a GitHub Actions artifact
  for reviewer inspection.
- To update reference fixtures after intentional rendering changes, re-run
  `fetch_labelary_fixtures.ts`.
