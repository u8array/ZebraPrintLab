import { useState } from "react";

/** Gap between an anchor element and a menu opened below it. */
const ANCHOR_GAP_PX = 4;

/** Open/close state for a ContextMenu plus the two positioning idioms every
 *  consumer used to re-implement: at the pointer (right-click) or below an
 *  anchor element (a menu button). `data` snapshots whatever the consumer
 *  needs to render the menu (typically its sections) at open time; callers
 *  handle preventDefault themselves (the pointer source differs per host,
 *  React vs Konva). */
export function useContextMenu<T>() {
  const [menu, setMenu] = useState<{ x: number; y: number; data: T } | null>(null);
  const openAtPointer = (pos: { clientX: number; clientY: number }, data: T) =>
    setMenu({ x: pos.clientX, y: pos.clientY, data });
  const openBelowAnchor = (el: Element, data: T) => {
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + ANCHOR_GAP_PX, data });
  };
  const close = () => setMenu(null);
  return { menu, openAtPointer, openBelowAnchor, close };
}
