import { useRef, useState, type ChangeEvent } from "react";
import { useLabelStore } from "../store/labelStore";
import {
  parseCsvText,
  rememberImport,
  csvParseErrors,
  type CsvParseResult,
} from "../lib/csvImport";
import { isMappingCompatibleWith, type CsvMapping } from "@zplab/core/types/Variable";
import { pickFileBytes, pickViaMenu, CSV_FILTER } from "../lib/fileDialogs";

/** Captures everything decided during parse so the caller can either
 *  apply directly or stash on the pending-import slot until the user
 *  confirms. Bytes/text live here because a "Cancel" must not pollute
 *  the module-scope cache that the modal re-decodes from. */
interface ParsedImport {
  filename: string;
  bytes: Uint8Array;
  text: string;
  result: CsvParseResult;
}

/** Compatibility decision for the confirm dialog: `same` shows a
 *  single Replace button (mapping carries over); `different` shows
 *  Discard mapping / Keep & remap. */
export type PendingImportKind = "same" | "different";

export interface PendingImport {
  kind: PendingImportKind;
  parsed: ParsedImport;
  /** Filename of the dataset being replaced. */
  replacingFilename: string;
  /** True when the previous mapping treated CSV as headerless. Drives
   *  the dialog copy: column-count match vs. column-name match. */
  wasHeaderless: boolean;
  /** Header / column count from the saved mapping. Used in the
   *  dialog body so the user sees what they're comparing against. */
  previousColumnCount: number;
}

/** File-picker hook for "Import CSV data" in the File menu. Owns the
 *  hidden <input> ref (web), the native-dialog entry point (desktop), and
 *  the pending-import slot that gates a destructive replace behind a
 *  ConfirmDialog. Errors go to the shared user-error channel. */
export function useCsvImportActions() {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const setUserError = useLabelStore((s) => s.setUserError);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  const importCsvData = (filename: string, bytes: Uint8Array) => {
    // Re-read store state AFTER the file IO so a discard/replace that
    // happened meanwhile doesn't drive the decision off a stale snapshot.
    const { csvMapping, csvDataset } = useLabelStore.getState();
    // Re-use the parse options the mapping was last applied with so a
    // headerless / windows-1252 / semicolon-delimited dataset doesn't
    // get re-parsed under defaults and falsely flagged as "different".
    const persistedOpts = csvMapping?.parseOptions;
    const encoding = persistedOpts?.encoding ?? "utf-8";
    let text: string;
    try {
      text = new TextDecoder(encoding).decode(bytes);
    } catch {
      setUserError(csvParseErrors.read_failed);
      return;
    }
    const result = parseCsvText(text, {
      filename,
      delimiter: persistedOpts?.delimiter,
      hasHeaderRow: persistedOpts?.hasHeaderRow,
      skipRows: persistedOpts?.skipRows,
      encoding,
    });
    if (!result.ok) {
      setUserError(csvParseErrors[result.error]);
      return;
    }

    const parsed: ParsedImport = { filename, bytes, text, result: result.value };

    // Fresh import (nothing to overwrite): commit immediately. The
    // mapping-modal auto-open (driven by absent or incompatible
    // mapping) inside applyImport handles UX from there.
    if (!csvDataset) {
      applyImport(parsed, { keepMapping: true });
      return;
    }

    // Existing dataset → confirm before overwriting. Compatibility
    // controls the dialog shape (single Replace vs. three-way choice).
    setPendingImport({
      kind:
        csvMapping && isMappingCompatibleWith(csvMapping, result.value.headers)
          ? "same"
          : "different",
      parsed,
      replacingFilename: csvDataset.source.filename,
      wasHeaderless: csvMapping?.parseOptions?.hasHeaderRow === false,
      previousColumnCount: csvMapping?.headerSnapshot.length ?? 0,
    });
  };

  const handleCsvImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      setUserError(csvParseErrors.read_failed);
      return;
    }
    importCsvData(file.name, bytes);
  };

  // No clear here: a cancelled pick keeps any existing error; a committed
  // import clears it in applyImport instead.
  const openCsvPicker = () => {
    pickViaMenu(
      csvInputRef,
      () => pickFileBytes(CSV_FILTER),
      (picked) => importCsvData(picked.name, picked.bytes),
      () => setUserError(csvParseErrors.read_failed),
    );
  };

  const confirmPendingImport = (opts: { keepMapping: boolean }) => {
    if (!pendingImport) return;
    applyImport(pendingImport.parsed, opts);
    setPendingImport(null);
  };

  const cancelPendingImport = () => setPendingImport(null);

  return {
    csvInputRef,
    handleCsvImport,
    openCsvPicker,
    pendingImport,
    confirmPendingImport,
    cancelPendingImport,
  };
}

/** Commit a parsed import to the store + module cache. Optionally
 *  drop the existing mapping (Discard path). Surfaces the mapping
 *  modal whenever the resulting state needs user review: no mapping
 *  (fresh / discarded) or a kept-but-incompatible mapping. */
function applyImport(p: ParsedImport, opts: { keepMapping: boolean }): void {
  const { loadCsv, setCsvMapping, openCsvMappingModal, csvMapping, clearUserError } =
    useLabelStore.getState();
  rememberImport(p.bytes, p.text);
  const effectiveMapping: CsvMapping | null = opts.keepMapping ? csvMapping : null;
  if (!opts.keepMapping) setCsvMapping(null);
  loadCsv(p.result);
  clearUserError();
  const needsReview =
    !effectiveMapping ||
    !isMappingCompatibleWith(effectiveMapping, p.result.headers);
  if (needsReview) openCsvMappingModal();
}
