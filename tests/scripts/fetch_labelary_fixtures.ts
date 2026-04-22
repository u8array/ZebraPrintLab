import * as fs from "fs";
import * as path from "path";
import { testCases } from "../fixtures/testCases";

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  "tests/fixtures/labelary_images",
);

async function fetchLabelaryImage(zpl: string): Promise<Buffer> {
  // Use 8dpmm (203 dpi) and 4x4 inches as standard canvas dimensions
  const url = "http://api.labelary.com/v1/printers/8dpmm/labels/4x4/0/";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "image/png",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: zpl,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Labelary API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  console.log("Ensuring fixtures directory exists...");
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const mappingFile = path.join(FIXTURES_DIR, "fixtures.json");
  const mappingData = { test_cases: testCases };

  console.log("Writing mapping JSON (fixtures.json)...");
  fs.writeFileSync(mappingFile, JSON.stringify(mappingData, null, 2), "utf8");

  console.log("Fetching images from Labelary API...");
  for (const tc of testCases) {
    const imagePath = path.join(FIXTURES_DIR, tc.image_ref);

    // Skip if we already have the image to prevent unnecessary API calls
    if (fs.existsSync(imagePath)) {
      console.log(`⏩ Skipping ${tc.id} - Image already exists.`);
      continue;
    }

    console.log(`Fetching ${tc.id}...`);
    try {
      const imageBuffer = await fetchLabelaryImage(tc.zpl_input);
      fs.writeFileSync(imagePath, imageBuffer);
      console.log(`✅ Saved ${tc.image_ref}`);
    } catch (error) {
      console.error(`❌ Failed to fetch ${tc.id}:`, error);
    }

    // Rate limiting: Labelary allows ~5 requests per second.
    // A 500ms delay ensures we stay well within the safe limits.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("🎉 All fixtures fetched successfully!");
}

main().catch(console.error);
