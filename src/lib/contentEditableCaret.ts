/** DOM ↔ plain-text + caret roundtrip helpers for a contenteditable
 *  template-content editor.
 *
 *  The editor renders coloured marker spans inside a contenteditable
 *  div, but the canonical value remains a flat plain string (markers
 *  written as `«name»` / `«clock:Y»`). These helpers bridge between
 *  the two representations so the React render loop can stay declarative:
 *  parse value → render spans, then on input rebuild value from DOM and
 *  preserve the caret position across the re-render.
 *
 *  Conventions:
 *   - `<br>` counts as one `\n` character. Trailing `<br>` (Chrome's
 *     placeholder for empty last lines) does NOT add a character.
 *   - Span boundaries are transparent: walking children produces the
 *     same string regardless of marker tokenisation.
 *   - Offsets are character positions in the produced plain text. */

/** Concatenate every descendant text node of `root` into a single string,
 *  converting `<br>` elements to `\n`. A trailing `<br>` directly under
 *  `root` is treated as a Chrome contenteditable placeholder and
 *  skipped — Chrome appends one after `insertLineBreak` so the cursor
 *  has somewhere to land on the new empty line, but it doesn't
 *  represent a real character in the value. `segmentsToHTML` must
 *  emit the same trailing placeholder so the roundtrip is symmetric. */
export function domToPlainText(root: Node): string {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.nodeValue ?? "";
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    n.childNodes.forEach(walk);
  };
  const lastIdx = root.childNodes.length - 1;
  root.childNodes.forEach((c, i) => {
    if (i === lastIdx && c.nodeType === Node.ELEMENT_NODE && (c as Element).tagName === "BR") {
      // Placeholder BR — Chrome's caret target on a trailing empty line.
      return;
    }
    walk(c);
  });
  return out;
}

/** Character offset within `root`'s plain-text projection that the
 *  `(node, offset)` pair points to. Mirrors `domToPlainText`'s walk
 *  order so the two stay in sync. */
export function getCaretOffset(root: Node, node: Node, offset: number): number {
  let count = 0;
  let found = false;
  const visit = (n: Node) => {
    if (found) return;
    if (n === node) {
      // For element nodes, `offset` counts child positions; for text
      // nodes, it counts character positions. Both reduce to "advance
      // by offset units within this node's text projection".
      if (n.nodeType === Node.TEXT_NODE) {
        count += offset;
        found = true;
        return;
      }
      // Element node: count text from the first `offset` children, then stop.
      for (let i = 0; i < offset && i < n.childNodes.length; i += 1) {
        const child = n.childNodes[i];
        if (child) visit(child);
      }
      found = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      count += (n.nodeValue ?? "").length;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (el.tagName === "BR") {
      count += 1;
      return;
    }
    n.childNodes.forEach(visit);
  };
  visit(root);
  return count;
}

/** Inverse of `getCaretOffset`: given a target character offset, return
 *  the DOM `(node, offset)` pair to feed into `Range.setStart`/`setEnd`.
 *  Clamps to the end of the document when `target` exceeds the
 *  available text. */
export function findCaretPosition(
  root: Node,
  target: number,
): { node: Node; offset: number } {
  let remaining = target;
  let result: { node: Node; offset: number } | null = null;
  const visit = (n: Node) => {
    if (result) return;
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n.nodeValue ?? "").length;
      if (remaining <= len) {
        result = { node: n, offset: remaining };
        return;
      }
      remaining -= len;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (el.tagName === "BR") {
      if (remaining === 0) {
        // Caret right before the <br>: place it in the parent at the BR's index.
        const parent = el.parentNode;
        if (!parent) return;
        const idx = Array.prototype.indexOf.call(parent.childNodes, el);
        result = { node: parent, offset: idx };
        return;
      }
      remaining -= 1;
      if (remaining === 0) {
        // Caret right AFTER the <br>. A bare (parent, brIndex+1)
        // position confuses Chrome's caret algorithm — it snaps the
        // cursor back into the preceding text node. Prefer to land
        // inside the next sibling: text node → (textNode, 0); element
        // → (element, 0). Only fall back to the parent-index
        // position when the BR is the last child (Chrome handles
        // end-of-content reliably).
        const next = el.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          result = { node: next, offset: 0 };
          return;
        }
        if (next && next.nodeType === Node.ELEMENT_NODE) {
          result = { node: next, offset: 0 };
          return;
        }
        const parent = el.parentNode;
        if (!parent) return;
        const idx = Array.prototype.indexOf.call(parent.childNodes, el);
        result = { node: parent, offset: idx + 1 };
        return;
      }
      return;
    }
    n.childNodes.forEach(visit);
  };
  visit(root);
  if (result) return result;
  // Fell off the end: place caret at the end of root.
  return { node: root, offset: root.childNodes.length };
}
