import { useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { generateZPL } from "../lib/zplGenerator";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";
import { LabelaryError } from "../lib/labelary";

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
      if (e instanceof LabelaryError && e.kind === 'api') {
        setPrintError("Labelary returned an error. Check that the label dimensions and dpmm are valid.");
      } else if (e instanceof LabelaryError && e.kind === 'timeout') {
        setPrintError("Labelary did not respond in time.");
      } else {
        setPrintError("Could not reach the Labelary preview service. Check your network connection.");
      }
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
