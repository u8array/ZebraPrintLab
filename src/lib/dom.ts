/** Returns `true` when `el` is a text-input surface that should
 *  intercept keyboard events the global shortcuts and canvas
 *  handlers would otherwise act on (Backspace → delete object,
 *  Ctrl+A → select all objects, etc.). */
export function isEditableTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
