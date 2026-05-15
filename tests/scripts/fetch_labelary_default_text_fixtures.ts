/*
 * Generates Labelary reference PNGs rendered with the DEFAULT Zebra
 * font (^A0, CG Triumvirate Condensed Bold) for the box-match test
 * suite. No custom font is uploaded — the printer-resident font is
 * what end users actually print with, so this is the ground truth for
 * "what will land on the label".
 *
 * Run: npx --yes tsx tests/scripts/fetch_labelary_default_text_fixtures.ts
 *
 * Skips cases whose fixture already exists, so re-runs only fill gaps.
 */
import * as fs from 'fs';
import * as path from 'path';
import { textBoxMatchCases } from '../fixtures/textBoxMatchCases';

const FIXTURES_DIR = path.resolve('tests/fixtures/labelary_text_default_images');
const RENDER_URL = 'http://api.labelary.com/v1/printers/8dpmm/labels/4x4/0/';
const RATE_LIMIT_MS = 1000;

async function fetchLabel(zpl: string): Promise<Buffer> {
  const res = await fetch(RENDER_URL, {
    method: 'POST',
    headers: {
      Accept: 'image/png',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: zpl,
  });
  if (!res.ok) {
    throw new Error(`Labelary ${res.status}: ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const missing = textBoxMatchCases.filter(
    (tc) => !fs.existsSync(path.join(FIXTURES_DIR, `${tc.id}.png`)),
  );
  if (missing.length === 0) {
    console.log('All fixtures already present.');
    return;
  }
  console.log(`Fetching ${missing.length} fixture(s) with default Zebra font...`);

  for (const tc of missing) {
    const zpl =
      `^XA^FO${tc.x},${tc.y}` +
      `^A0${tc.rotation},${tc.fontHeight},${tc.fontWidth || tc.fontHeight}` +
      `^FD${tc.text}^FS^XZ`;
    const png = await fetchLabel(zpl);
    fs.writeFileSync(path.join(FIXTURES_DIR, `${tc.id}.png`), png);
    console.log(`  ${tc.id}.png`);
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\nWrote ${missing.length} fixture(s) to ${FIXTURES_DIR}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
