import { useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { generateZPL } from "../lib/zplGenerator";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";
import { labelaryErrorMessage } from "../lib/labelary";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const [showZplImport, setShowZplImport] = useState(false);
  const [showZebraPrint, setShowZebraPrint] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handleDownload = () => {
    const zpl = generateZPL(label, objects);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  const handlePrint = async () => {
    try {
      await printLabel(label, objects);
    } catch (e) {
      setPrintError(labelaryErrorMessage(e));
    }
  };

  return {
    showZplImport,
    openZplImport: () => setShowZplImport(true),
    closeZplImport: () => setShowZplImport(false),
    showZebraPrint,
    openZebraPrint: () => setShowZebraPrint(true),
    closeZebraPrint: () => setShowZebraPrint(false),
    currentZpl: () => generateZPL(label, objects),
    printError,
    dismissPrintError: () => setPrintError(null),
    handleDownload,
    handlePrint,
  };
}
