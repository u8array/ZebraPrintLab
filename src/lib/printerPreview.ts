import { isDesktopShell } from "./platform";
import { errorMessage } from "./errorMessage";
import { queryZplUsb } from "./usbPrint";
import { buildPrinterPreviewZpl, decodeDyGraphic, monoToRgba, type PrinterBitmap } from "./zebraGraphic";

/** Where the preview query goes: the raw-TCP port or a USB printer id. */
export type PreviewTarget =
  | { kind: "network"; host: string; port: number }
  | { kind: "usb"; id: string };

/** Failure kinds the query dispatch and the final result share, so
 *  fetchPrinterPreview forwards them to the caller unchanged. */
type PrinterQueryFailure =
  | { kind: "refused" }
  | { kind: "unreachable" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export type PrinterPreviewResult = { kind: "bitmap"; bitmap: PrinterBitmap } | PrinterQueryFailure;

/** queryTarget's outcome: the raw reply to decode, or a failure to forward. */
type PrinterQueryOutcome = { kind: "data"; body: string } | PrinterQueryFailure;

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

async function queryTarget(target: PreviewTarget, zpl: string): Promise<PrinterQueryOutcome> {
  if (target.kind === "usb") {
    return await queryZplUsb(target.id, zpl);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<TcpQueryResult>("query_zpl_tcp", {
    host: target.host,
    port: target.port,
    zpl,
  });
  if (res.kind === "refused") return { kind: "refused" };
  if (res.kind === "unreachable") return { kind: "unreachable" };
  return { kind: "data", body: res.body ?? "" };
}

/** Ask the printer to render the design and upload the resulting bitmap
 *  (^IS store + ^HY upload over one bidirectional channel). Ground truth from
 *  the firmware renderer, so it needs raw TCP (9100) or a USB read channel,
 *  not IPP. Desktop shell only: the web build has neither. */
export async function fetchPrinterPreview(
  target: PreviewTarget,
  designZpl: string,
): Promise<PrinterPreviewResult> {
  if (!isDesktopShell) {
    return { kind: "error", message: "printer preview requires the desktop app" };
  }
  try {
    const res = await queryTarget(target, buildPrinterPreviewZpl(designZpl));
    if (res.kind !== "data") return res;
    const bitmap = decodeDyGraphic(res.body);
    return bitmap
      ? { kind: "bitmap", bitmap }
      : { kind: "error", message: "no graphic in printer response" };
  } catch (e) {
    return { kind: "error", message: errorMessage(e) };
  }
}
