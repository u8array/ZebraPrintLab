import type { PNG } from "pngjs";

/** Ink bounding box of a black-on-white render; null when blank.
 *  Single source for the visual-regression bounds mode AND the fixture
 *  measurement script, so measured expected_bounds and test-side bounds
 *  can never disagree on anti-aliased edges. */
export function inkBounds(png: PNG): { x: number; y: number; w: number; h: number } | null {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const lum = ((png.data[i] ?? 255) + (png.data[i + 1] ?? 255) + (png.data[i + 2] ?? 255)) / 3;
      if (lum < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
