import type Konva from "konva";

/** Render a Konva node (e.g. the label/rotation group, which excludes the
 *  transformer + action-bar chrome that live outside it) to a PNG blob.
 *  pixelRatio>1 keeps the export crisp on hidpi. Null on failure. */
export async function nodeToPngBlob(
  node: Konva.Node,
  pixelRatio = 2,
): Promise<Blob | null> {
  try {
    const blob = await node.toBlob({ pixelRatio, mimeType: "image/png" });
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

/** Trigger a browser download of a blob under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Copy a PNG to the clipboard. Takes a Blob promise so the caller can call this
 *  synchronously in the click handler: a pending blob keeps the user activation
 *  Safari/Firefox drop after an await. Throws on failure so the caller can react. */
export async function copyPngToClipboard(blob: Blob | Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("clipboard-image-unsupported");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
