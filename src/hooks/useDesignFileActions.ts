import { useRef } from "react";
import { useLabelStore } from "../store/labelStore";
import { parseDesignFile, serializeDesign, designFileErrors } from "../lib/designFile";
import { readFileAsText } from "../lib/readFile";
import { pickFileText, pickViaMenu, saveTextFile, saveErrorMessage, DESIGN_FILTER } from "../lib/fileDialogs";

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
