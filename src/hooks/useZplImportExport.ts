import { useState } from "react";
import { useLabelStore, useCurrentObjects } from "../store/labelStore";
import { generateMultiPageZPL } from "../lib/zplGenerator";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";
import { labelaryErrorMessage } from "../lib/labelary";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const objects = useCurrentObjects();
  const [showZplImport, setShowZplImport] = useState(false);
  const [showZebraPrint, setShowZebraPrint] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handleDownload = () => {
    const zpl = generateMultiPageZPL(label, pages);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  // Print previews via Labelary, which renders one image at a time. We send
  // only the current page so the preview matches what the user sees.
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
    currentZpl: () => generateMultiPageZPL(label, pages),
    printError,
    dismissPrintError: () => setPrintError(null),
    handleDownload,
    handlePrint,
  };
}
