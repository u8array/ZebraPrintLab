import { generateZPL } from "./zplGenerator";
import { fetchPreview } from "./labelary";
import type { LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";

function buildLoadingHtml(): string {
  return `<html><head><style>
    body { margin: 0; display: flex; justify-content: center; align-items: center;
           height: 100vh; font-family: monospace; color: #888; background: #111; }
  </style></head><body>Loading preview…</body></html>`;
}

export function buildPrintHtml(imageUrl: string): string {
  return `<html><head><style>
    body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
    img { max-width: 100%; max-height: 100%; }
    @media print { body { height: auto; } }
  </style></head>
  <body><img src="${imageUrl}" onload="window.print();window.close();" /></body>
  </html>`;
}

export async function printLabel(label: LabelConfig, objects: LabelObject[]): Promise<void> {
  // Open the window synchronously (inside the user-click call stack) so browsers
  // don't treat it as a popup. Fill it in once the Labelary preview arrives.
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildLoadingHtml());
  win.document.close();

  try {
    const zpl = generateZPL(label, objects);
    const url = await fetchPreview(zpl, label);
    win.document.open();
    win.document.write(buildPrintHtml(url));
    win.document.close();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    win.close();
    throw e;
  }
}
