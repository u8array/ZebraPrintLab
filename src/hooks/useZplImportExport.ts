import { useRef, useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { generateZPL } from "../lib/zplGenerator";
import { importZplText } from "../lib/zplImportService";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";
import { readFileAsText } from "../lib/readFile";
import type { ImportResult } from "../components/Output/ImportReportModal";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const [showZplImport, setShowZplImport] = useState(false);
  const [fileImportReport, setFileImportReport] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const zplFileInputRef = useRef<HTMLInputElement>(null);

  const handleZplFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let zpl: string;
    try {
      zpl = await readFileAsText(file);
    } catch {
      setFileError("Could not read the file.");
      return;
    }

    if (!zpl.trim()) {
      setFileError("The file appears to be empty.");
      return;
    }

    const { labelConfig, objects: parsedObjects, report } = importZplText(zpl, label.dpmm);
    loadDesign({ ...label, ...labelConfig }, parsedObjects);
    setFileImportReport({ objectCount: parsedObjects.length, report });
  };

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
    fileImportReport,
    dismissFileImportReport: () => setFileImportReport(null),
    fileError,
    dismissFileError: () => setFileError(null),
    printError,
    dismissPrintError: () => setPrintError(null),
    zplFileInputRef,
    handleZplFileLoad,
    handleDownload,
    handlePrint,
  };
}
