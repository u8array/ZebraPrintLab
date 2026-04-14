import { generateZPL } from "./zplGenerator";
import { fetchPreview } from "./labelary";
import type { LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";

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
  const zpl = generateZPL(label, objects);
  const url = await fetchPreview(zpl, label);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildPrintHtml(url));
  win.document.close();
  URL.revokeObjectURL(url);
}
