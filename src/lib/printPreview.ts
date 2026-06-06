import { generateZPL } from "./zplGenerator";
import { fetchPreview } from "./labelary";
import type { LabelConfig } from "../types/LabelConfig";
import type { LabelObject } from "../types/Group";
import type { Variable } from "../types/Variable";
import { applyBindingToTree, clockCtxFromLabel, type ActiveCsvRow } from "./variableBinding";

/** Generate the ZPL we hand to Labelary: row-substituted + flat
 *  (no ^FN), so the rendered preview matches what would print for
 *  the active CSV row (or the variable defaults when no row is
 *  loaded). Shared by `printLabel` (new window with image) and
 *  `enterPreviewMode` (canvas overlay) so the two stay in lockstep. */
export function buildPreviewZpl(
  label: LabelConfig,
  objects: LabelObject[],
  variables: readonly Variable[],
  active: ActiveCsvRow | null,
): string {
  const substituted = applyBindingToTree(objects, variables, active, "preview", clockCtxFromLabel(label));
  return generateZPL(label, substituted, []);
}

export function buildLoadingHtml(): string {
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

export async function printLabel(
  label: LabelConfig,
  objects: LabelObject[],
  variables: readonly Variable[] = [],
  active: ActiveCsvRow | null = null,
): Promise<void> {
  // Open the window synchronously (inside the user-click call stack) so browsers
  // don't treat it as a popup. Fill it in once the Labelary preview arrives.
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildLoadingHtml());
  win.document.close();

  try {
    const zpl = buildPreviewZpl(label, objects, variables, active);
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
