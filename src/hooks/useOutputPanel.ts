import { useRef, useState } from "react";

const OUTPUT_MIN_H = 80;
const OUTPUT_MAX_H = 600;
export const OUTPUT_DEFAULT_H = 208;

export function useOutputPanel(defaultH = OUTPUT_DEFAULT_H) {
  const [height, setHeight] = useState(defaultH);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      startY: e.clientY,
      startH: collapsed ? OUTPUT_MIN_H : height,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const next = Math.min(
        OUTPUT_MAX_H,
        Math.max(OUTPUT_MIN_H, dragRef.current.startH + delta),
      );
      if (next <= OUTPUT_MIN_H) {
        setCollapsed(true);
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        return;
      }
      setCollapsed(false);
      setHeight(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const collapse = () => setCollapsed(true);
  const expand = () => {
    setHeight(OUTPUT_DEFAULT_H);
    setCollapsed(false);
  };

  return { height, collapsed, onMouseDown, collapse, expand };
}
