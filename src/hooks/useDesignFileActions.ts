import { useRef, useState } from "react";
import { useLabelStore } from "../store/labelStore";
import { triggerDownload } from "../lib/triggerDownload";
import { parseDesignFile, serializeDesign, designFileErrors } from "../lib/designFile";
import { readFileAsText } from "../lib/readFile";

export function useDesignFileActions() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    loadDesign({ widthMm: 100, heightMm: 60, dpmm: 8 }, []);
  };

  const handleSave = () => {
    const data = serializeDesign(label, objects);
    triggerDownload(new Blob([data], { type: "application/json" }), "label.json");
  };

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setLoadError(designFileErrors.parse_error);
      return;
    }
    const result = parseDesignFile(text);

    if (!result.ok) {
      setLoadError(designFileErrors[result.error]);
      return;
    }

    setLoadError(null);
    loadDesign(result.value.label, result.value.objects);
  };

  return {
    handleNew,
    handleSave,
    handleLoad,
    loadInputRef,
    loadError,
    dismissLoadError: () => setLoadError(null),
  };
}
