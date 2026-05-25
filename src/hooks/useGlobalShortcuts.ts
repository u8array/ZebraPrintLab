import { useEffect } from "react";
import { useLabelStore, useHistory, getCurrentObjects, selectPreviewLocksEditor } from "../store/labelStore";
import { nextRotation } from "../components/Canvas/rotationGeometry";
import { isEditableTarget } from "../lib/dom";

export function useGlobalShortcuts() {
  const duplicateSelectedObjects = useLabelStore((s) => s.duplicateSelectedObjects);
  const copySelectedObjects = useLabelStore((s) => s.copySelectedObjects);
  const pasteObjects = useLabelStore((s) => s.pasteObjects);
  const selectObjects = useLabelStore((s) => s.selectObjects);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const setCurrentPage = useLabelStore((s) => s.setCurrentPage);
  const updateObjects = useLabelStore((s) => s.updateObjects);
  const groupSelection = useLabelStore((s) => s.groupSelection);
  const ungroup = useLabelStore((s) => s.ungroup);
  const { undo, redo } = useHistory();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Preview overlay freezes the design at activation time; every
      // shortcut here either edits the model or changes the selection
      // /page, both of which would visibly drift away from the frozen
      // snapshot. Block them wholesale.
      if (selectPreviewLocksEditor(useLabelStore.getState())) return;
      const inInput = isEditableTarget(e.target as HTMLElement);
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
        selectObjects(getCurrentObjects().map((o) => o.id));
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
      if (mod && e.code === "KeyL") {
        // Ctrl+L locks the current selection, Ctrl+Shift+L unlocks. No-op
        // for an empty selection so the browser's default address-bar
        // focus binding stays intact when nothing is selected.
        const ids = useLabelStore.getState().selectedIds;
        if (ids.length === 0) return;
        e.preventDefault();
        const locked = !e.shiftKey;
        updateObjects(ids.map((id) => ({ id, changes: { locked } })));
        return;
      }
      if (mod && e.code === "KeyG") {
        // Ctrl+G groups the current selection, Ctrl+Shift+G ungroups.
        // Listed before the bare-G grid toggle so the modifier wins.
        e.preventDefault();
        if (e.shiftKey) ungroup();
        else groupSelection();
        return;
      }
      if (e.code === "KeyG" && !mod) {
        e.preventDefault();
        setCanvasSettings({ showGrid: !useLabelStore.getState().canvasSettings.showGrid });
      }
      if (e.code === "KeyS") {
        e.preventDefault();
        setCanvasSettings({ snapEnabled: !useLabelStore.getState().canvasSettings.snapEnabled });
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        const current = useLabelStore.getState().canvasSettings.viewRotation;
        setCanvasSettings({ viewRotation: nextRotation(current) });
      }
      if (e.code === "PageUp") {
        e.preventDefault();
        const { currentPageIndex } = useLabelStore.getState();
        if (currentPageIndex > 0) setCurrentPage(currentPageIndex - 1);
      }
      if (e.code === "PageDown") {
        e.preventDefault();
        const { currentPageIndex, pages } = useLabelStore.getState();
        if (currentPageIndex < pages.length - 1) setCurrentPage(currentPageIndex + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, duplicateSelectedObjects, copySelectedObjects, pasteObjects, selectObjects, setCanvasSettings, setCurrentPage, updateObjects, groupSelection, ungroup]);
}
