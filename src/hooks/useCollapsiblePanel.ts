import { useState } from "react";

/** Collapsed flag for a layout panel, persisted to localStorage so the choice
 *  survives reloads. Mirrors useOutputPanel's storage approach. */
export function useCollapsiblePanel(lsKey: string, initial = false) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(lsKey);
      return v === null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  const set = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(lsKey, v ? "1" : "0");
    } catch {
      // storage blocked (private browsing); in-memory state still works
    }
  };
  return {
    collapsed,
    collapse: () => set(true),
    expand: () => set(false),
  };
}
