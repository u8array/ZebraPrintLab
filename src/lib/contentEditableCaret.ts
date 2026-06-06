// DOM <-> plain-text + caret roundtrip. <br> = \n; trailing <br> is
// Chrome's empty-line placeholder and is dropped (segmentsToHTML emits one).

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
      return;
    }
    walk(c);
  });
  return out;
}

/** Mirrors domToPlainText walk order. */
export function getCaretOffset(root: Node, node: Node, offset: number): number {
  let count = 0;
  let found = false;
  const visit = (n: Node) => {
    if (found) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) {
        count += offset;
        found = true;
        return;
      }
      // Element offset counts child positions.
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

/** Inverse of getCaretOffset; clamps to end when overshooting. */
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
        const parent = el.parentNode;
        if (!parent) return;
        const idx = Array.prototype.indexOf.call(parent.childNodes, el);
        result = { node: parent, offset: idx };
        return;
      }
      remaining -= 1;
      if (remaining === 0) {
        // Land inside next sibling: Chrome snaps (parent, brIndex+1) back into prev text.
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
  return { node: root, offset: root.childNodes.length };
}
