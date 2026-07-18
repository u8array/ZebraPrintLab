import { useEffect, useRef } from "react";
import { useLabelStore } from "../store/labelStore";
import { parseDesignFile, serializeDesign, designFileErrors } from "@zplab/core/lib/designFile";
import { readFileAsText } from "../lib/readFile";
import { pickFileText, pickViaMenu, saveTextFile, saveErrorMessage, DESIGN_FILTER } from "../lib/fileDialogs";
import { isDesktopShell } from "../lib/platform";

export function useDesignFileActions() {
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const variables = useLabelStore((s) => s.variables);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const setUserError = useLabelStore((s) => s.setUserError);
  const clearUserError = useLabelStore((s) => s.clearUserError);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    loadDesign({ widthMm: 100, heightMm: 60, dpmm: 8 }, [{ objects: [] }]);
  };

  const handleSave = () => {
    const data = serializeDesign(label, pages, variables, csvMapping);
    void saveTextFile(data, {
      filename: "label.json",
      mimeType: "application/json",
      filter: DESIGN_FILTER,
    })
      .then((wrote) => wrote && clearUserError())
      .catch(() => setUserError(saveErrorMessage));
  };

  const applyDesignText = (text: string) => {
    const result = parseDesignFile(text);
    if (!result.ok) {
      setUserError(designFileErrors[result.error]);
      return;
    }
    clearUserError();
    loadDesign(
      result.value.label,
      result.value.pages,
      result.value.variables,
      result.value.csvMapping,
    );
  };

  // No clear here: a cancelled pick must leave any existing error in place;
  // applyDesignText clears on a successful load instead.
  const handleOpen = () => {
    pickViaMenu(
      loadInputRef,
      () => pickFileText(DESIGN_FILTER),
      (picked) => applyDesignText(picked.text),
      () => setUserError(designFileErrors.parse_error),
    );
  };

  // The app-spawned MCP server pushes drafts through this Tauri event; route
  // them through the same parse+load path as opening a file so an invalid
  // payload surfaces identically. Read via ref so re-subscribing is unneeded.
  const applyRef = useRef(applyDesignText);
  useEffect(() => {
    applyRef.current = applyDesignText;
  });
  useEffect(() => {
    if (!isDesktopShell) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<string>("mcp://open-draft", (event) => applyRef.current(event.payload)),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      // Bridge setup is desktop-only and non-actionable if it fails; swallow so
      // it is not an unhandled rejection (matches the boot-start in main.tsx).
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setUserError(designFileErrors.parse_error);
      return;
    }
    applyDesignText(text);
  };

  return { handleNew, handleSave, handleOpen, handleLoad, loadInputRef };
}
