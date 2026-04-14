import { useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { generateZPL } from "../lib/zplGenerator";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const [showZplImport, setShowZplImport] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handleDownload = () => {
    const zpl = generateZPL(label, objects);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  const handlePrint = async () => {
    try {
      await printLabel(label, objects);
    } catch (e) {
      const msg = e instanceof Error && e.message.includes('API error')
        ? "Labelary returned an error. Check that the label dimensions and dpmm are valid."
        : "Could not reach the Labelary preview service. Check your network connection.";
      setPrintError(msg);
    }
  };

  return {
    showZplImport,
    openZplImport: () => setShowZplImport(true),
    closeZplImport: () => setShowZplImport(false),
    printError,
    dismissPrintError: () => setPrintError(null),
    handleDownload,
    handlePrint,
  };
}
