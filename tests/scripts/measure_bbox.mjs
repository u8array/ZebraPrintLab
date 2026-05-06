import * as fs from 'fs';
import { PNG } from 'pngjs';
import * as path from 'path';

const FIXTURES_DIR = 'tests/fixtures/labelary_images';
const ids = process.argv.slice(2);

for (const id of ids) {
  const png = PNG.sync.read(fs.readFileSync(path.join(FIXTURES_DIR, `${id}.png`)));
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i], g = png.data[i+1], b = png.data[i+2];
      if ((r + g + b) / 3 < 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log(JSON.stringify({ id, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }));
}
