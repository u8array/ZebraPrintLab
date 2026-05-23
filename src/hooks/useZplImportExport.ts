import { useState } from "react";
import { useLabelStore, useCurrentObjects } from "../store/labelStore";
import { generateMultiPageZPL, generateBatchZpl } from "../lib/zplGenerator";
import { printLabel } from "../lib/printPreview";
import { triggerDownload } from "../lib/triggerDownload";
import { labelaryErrorMessage } from "../lib/labelary";
import { buildActiveCsvRow } from "../lib/variableBinding";

export function useZplImportExport() {
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const variables = useLabelStore((s) => s.variables);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const objects = useCurrentObjects();
  const [showZplImport, setShowZplImport] = useState(false);
  const [showZebraPrint, setShowZebraPrint] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Batch export is only meaningful with both a dataset and at least one
  // mapped variable. Without either, the output would be identical to a
  // single label and surfacing the action just clutters the menu.
  const canBatchExport =
    csvDataset !== null &&
    csvDataset.rows.length > 0 &&
    csvMapping !== null &&
    Object.keys(csvMapping.bindings).length > 0;

  const handleDownload = () => {
    const zpl = generateMultiPageZPL(label, pages, variables);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  const handleExportBatch = () => {
    if (!canBatchExport) return;
    const zpl = generateBatchZpl(label, objects, variables, csvDataset, csvMapping);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label-batch.zpl");
  };

  // Print previews via Labelary, which renders one image at a time. We send
  // only the current page so the preview matches what the user sees. The
  // active CSV row (if any) is substituted into bound fields so the
  // preview reflects what would actually print for the selected row.
  const handlePrint = async () => {
    try {
      const active = buildActiveCsvRow(csvDataset, csvMapping);
      await printLabel(label, objects, variables, active);
    } catch (e) {
      setPrintError(labelaryErrorMessage(e));
    }
  };

  // ZPL surfaced to direct-print: batch form when a CSV is in play (so
  // sending to the printer produces N labels), otherwise the same
  // template the editor displays.
  const currentZpl = () =>
    canBatchExport
      ? generateBatchZpl(label, objects, variables, csvDataset, csvMapping)
      : generateMultiPageZPL(label, pages, variables);

  return {
    showZplImport,
    openZplImport: () => setShowZplImport(true),
    closeZplImport: () => setShowZplImport(false),
    showZebraPrint,
    openZebraPrint: () => setShowZebraPrint(true),
    closeZebraPrint: () => setShowZebraPrint(false),
    currentZpl,
    printError,
    dismissPrintError: () => setPrintError(null),
    handleDownload,
    handleExportBatch,
    canBatchExport,
    batchRowCount: csvDataset?.rows.length ?? 0,
    handlePrint,
  };
}
