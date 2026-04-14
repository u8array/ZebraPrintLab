import { useRef, useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { generateZPL } from "../lib/zplGenerator";
import { importZplText } from "../lib/zplImportService";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";
import { readFileAsText } from "../lib/readFile";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const [showZplImport, setShowZplImport] = useState(false);
  const [zplFileNotice, setZplFileNotice] = useState<string | null>(null);
  const zplFileInputRef = useRef<HTMLInputElement>(null);

  const handleZplFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let zpl: string;
    try {
      zpl = await readFileAsText(file);
    } catch {
      return;
    }
    if (!zpl.trim()) return;

    const { labelConfig, objects: parsedObjects, notice } = importZplText(zpl, label.dpmm);
    loadDesign({ ...label, ...labelConfig }, parsedObjects);
    setZplFileNotice(notice);
  };

  const handleDownload = () => {
    const zpl = generateZPL(label, objects);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  const handlePrint = () => printLabel(label, objects);

  return {
    showZplImport,
    openZplImport: () => setShowZplImport(true),
    closeZplImport: () => setShowZplImport(false),
    zplFileNotice,
    dismissNotice: () => setZplFileNotice(null),
    zplFileInputRef,
    handleZplFileLoad,
    handleDownload,
    handlePrint,
  };
}
