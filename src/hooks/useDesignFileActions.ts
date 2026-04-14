import { useRef } from "react";
import { useLabelStore } from "../store/labelStore";
import { triggerDownload } from "../lib/triggerDownload";
import type { LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";

export function useDesignFileActions() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    loadDesign({ widthMm: 100, heightMm: 60, dpmm: 8 }, []);
  };

  const handleSave = () => {
    const data = JSON.stringify({ label, objects }, null, 2);
    triggerDownload(new Blob([data], { type: "application/json" }), "label.json");
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as {
          label: LabelConfig;
          objects: LabelObject[];
        };
        if (json.label && Array.isArray(json.objects)) {
          loadDesign(json.label, json.objects);
        }
      } catch {
        // invalid file — silently ignore
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return { handleNew, handleSave, handleLoad, loadInputRef };
}
