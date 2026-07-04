// Measure Labelary fixture ink bounds for expected_bounds entries.
// Usage: npx tsx tests/scripts/measure_bbox.ts <case_id> [...]
import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import { inkBounds } from "../../src/test/pngInk";

const FIXTURES_DIR = "tests/fixtures/labelary_images";

for (const id of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(FIXTURES_DIR, `${id}.png`)));
  const b = inkBounds(png);
  console.log(
    JSON.stringify(
      b ? { id, x: b.x, y: b.y, width: b.w, height: b.h } : { id, blank: true },
    ),
  );
}
