import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/** Ctrl/Cmd bypass flag as a ref so 60Hz drag ticks don't re-render. Shared by
 *  all snap consumers (the Transformer's boundBoxFunc gets no native event).
 *  Blur clears it so the modifier can't stick after Cmd+Tab. */
export function useSnapBypassRef(): RefObject<boolean> {
  const bypassRef = useRef(false);

  useEffect(() => {
    // Exclude AltGr (Ctrl+Alt on Windows/EU layouts) and any Alt-held gesture,
    // which has its own canvas meaning; only plain Ctrl or Cmd bypasses.
    const update = (e: KeyboardEvent) => {
      bypassRef.current = (e.ctrlKey && !e.altKey) || e.metaKey;
    };
    const clear = () => {
      bypassRef.current = false;
    };
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return bypassRef;
}
