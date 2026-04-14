import { useRef, useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { generateZPL } from "../lib/zplGenerator";
import { parseZPL } from "../lib/zplParser";
import { fetchPreview } from "../lib/labelary";
import { triggerDownload } from "../lib/triggerDownload";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const [showZplImport, setShowZplImport] = useState(false);
  const [zplFileNotice, setZplFileNotice] = useState<string | null>(null);
  const zplFileInputRef = useRef<HTMLInputElement>(null);

  const handleZplFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const zpl = ev.target?.result as string;
      if (!zpl?.trim()) return;
      const { labelConfig, objects: parsedObjects, importReport } = parseZPL(zpl, label.dpmm);
      loadDesign({ ...label, ...labelConfig }, parsedObjects);
      const parts: string[] = [
        `Editable reconstruction — ${parsedObjects.length} object${parsedObjects.length !== 1 ? "s" : ""} imported.`,
      ];
      if (importReport.partial.length > 0) {
        parts.push(`Font face not preserved (${importReport.partial.join(", ")}).`);
      }
      const skippedCount = importReport.browserLimit.length + importReport.unknown.length;
      if (skippedCount > 0) {
        parts.push(`${skippedCount} command${skippedCount !== 1 ? "s" : ""} skipped.`);
      }
      setZplFileNotice(parts.join(" "));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownload = () => {
    const zpl = generateZPL(label, objects);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  const handlePrint = async () => {
    const zpl = generateZPL(label, objects);
    const url = await fetchPreview(zpl, label);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><style>
        body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
        img { max-width: 100%; max-height: 100%; }
        @media print { body { height: auto; } }
      </style></head>
      <body><img src="${url}" onload="window.print();window.close();" /></body>
      </html>
    `);
    win.document.close();
    URL.revokeObjectURL(url);
  };

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
