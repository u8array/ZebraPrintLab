import { isDesktopShell } from "./platform";
import { buildPrinterPreviewZpl, decodeDyGraphic, monoToRgba, type PrinterBitmap } from "./zebraGraphic";

export type PrinterPreviewResult =
  | { kind: "bitmap"; bitmap: PrinterBitmap }
  | { kind: "refused" }
  | { kind: "unreachable" }
  | { kind: "error"; message: string };

interface TcpQueryResult {
  kind: "data" | "refused" | "unreachable";
  body?: string;
}

/** Rasterize the printer's 1bpp upload to a PNG data URL (canvas-backed, like
 *  labelary's blob URLs; a data URL survives the same cache path since
 *  revokeObjectURL on it is a no-op). */
export function bitmapToDataUrl(bmp: PrinterBitmap): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(monoToRgba(bmp), bmp.width, bmp.height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Ask the printer to render the design and upload the resulting bitmap
 *  (^IS store + ^HY upload over one raw-TCP connection). Ground truth from the
 *  firmware renderer, so it needs a bidirectional port (9100), not IPP.
 *  Desktop shell only: the web build has no raw sockets. */
export async function fetchPrinterPreview(
  host: string,
  port: number,
  designZpl: string,
): Promise<PrinterPreviewResult> {
  if (!isDesktopShell) {
    return { kind: "error", message: "printer preview requires the desktop app" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const res = await invoke<TcpQueryResult>("query_zpl_tcp", {
      host,
      port,
      zpl: buildPrinterPreviewZpl(designZpl),
    });
    if (res.kind === "refused") return { kind: "refused" };
    if (res.kind === "unreachable") return { kind: "unreachable" };
    const bitmap = decodeDyGraphic(res.body ?? "");
    return bitmap
      ? { kind: "bitmap", bitmap }
      : { kind: "error", message: "no graphic in printer response" };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
