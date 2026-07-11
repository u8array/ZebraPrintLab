import { useState, useEffect } from "react";
import { listUsbPrinters, type UsbPrinter } from "../lib/usbPrint";
import { getUsbPrinterId, setUsbPrinterId } from "../lib/printerAddress";
import { errorMessage } from "../lib/errorMessage";

/** Resolve the persisted selection, falling back to the first device when the
 *  stored id vanished; persists the fallback so the picker and the preview
 *  query target the same device. */
async function enumerateUsbPrinters(): Promise<{ printers: UsbPrinter[]; selectedId: string }> {
  const printers = await listUsbPrinters();
  const cur = getUsbPrinterId();
  const selectedId = cur && printers.some((p) => p.id === cur) ? cur : printers[0]?.id ?? "";
  if (selectedId !== cur) setUsbPrinterId(selectedId);
  return { printers, selectedId };
}

/** Setters the loader writes into, passed in so the loader stays module-level
 *  and out of the effect's dependency array. */
interface UsbSink {
  setPrinters: (printers: UsbPrinter[]) => void;
  setSelectedId: (id: string) => void;
  setError: (error: string | null) => void;
}

/** Errors surface in `error` rather than throwing, so the mount effect and
 *  refresh handle them the same. */
async function loadInto(sink: UsbSink): Promise<void> {
  try {
    const { printers, selectedId } = await enumerateUsbPrinters();
    sink.setPrinters(printers);
    sink.setSelectedId(selectedId);
    sink.setError(null);
  } catch (e) {
    sink.setError(errorMessage(e));
  }
}

export interface UsbPrintersState {
  printers: UsbPrinter[];
  selectedId: string;
  select: (id: string) => void;
  loading: boolean;
  error: string | null;
  /** Re-enumerate on demand (e.g. after granting access). */
  refresh: () => Promise<void>;
}

/** Shared USB device binding for the print dialog and the preview settings, so
 *  both enumerate the same way and stay in sync through the persisted id.
 *  `enabled` gates the mount enumeration (desktop shell / platform check). */
export function useUsbPrinters(enabled: boolean): UsbPrintersState {
  const [printers, setPrinters] = useState<UsbPrinter[]>([]);
  const [selectedId, setSelectedId] = useState(getUsbPrinterId);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Setters are stable, so [enabled] is exhaustive; React 19 makes a late
    // setState after unmount a safe no-op, so no cancellation guard is needed.
    void loadInto({ setPrinters, setSelectedId, setError }).finally(() => setLoading(false));
  }, [enabled]);

  const select = (id: string): void => {
    setSelectedId(id);
    setUsbPrinterId(id);
  };

  const refresh = (): Promise<void> => loadInto({ setPrinters, setSelectedId, setError });

  return { printers, selectedId, select, loading, error, refresh };
}
