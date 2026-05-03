import { useEffect } from "react";
import { useLabelStore, useHistory } from "../store/labelStore";

export function useGlobalShortcuts() {
  const duplicateSelectedObjects = useLabelStore(
    (s) => s.duplicateSelectedObjects,
  );
  const copySelectedObjects = useLabelStore((s) => s.copySelectedObjects);
  const pasteObjects = useLabelStore((s) => s.pasteObjects);
  const selectObjects = useLabelStore((s) => s.selectObjects);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const { undo, redo } = useHistory();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (inInput) return;
      if (mod && e.code === "KeyA") {
        e.preventDefault();
        selectObjects(useLabelStore.getState().objects.map((o) => o.id));
        return;
      }
      if (mod && e.code === "KeyD") {
        e.preventDefault();
        duplicateSelectedObjects();
        return;
      }
      if (mod && e.code === "KeyC") {
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        copySelectedObjects();
        return;
      }
      if (mod && e.code === "KeyV") {
        e.preventDefault();
        pasteObjects();
        return;
      }
      if (e.code === "KeyG") {
        e.preventDefault();
        setCanvasSettings({
          showGrid: !useLabelStore.getState().canvasSettings.showGrid,
        });
      }
      if (e.code === "KeyS") {
        e.preventDefault();
        setCanvasSettings({
          snapEnabled: !useLabelStore.getState().canvasSettings.snapEnabled,
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    undo,
    redo,
    duplicateSelectedObjects,
    copySelectedObjects,
    pasteObjects,
    selectObjects,
    setCanvasSettings,
  ]);
}
