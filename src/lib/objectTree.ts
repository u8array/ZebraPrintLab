/** Shape-erasing helpers for walking a persisted object tree without
 *  committing to a parsed type. Migrations and the JSON-import path
 *  both need to visit leaves before the schema is locked in, so the
 *  walkers must accept `unknown`. */

interface UnknownNode {
  type?: unknown;
  props?: unknown;
  children?: unknown;
}

/** Apply `visit` to every leaf (non-group) node found under `pages`.
 *  `pages` is treated permissively: any nested `objects`/`children`
 *  arrays are walked. Mutates leaves in-place via the visitor. */
export function visitLeavesInPages(pages: unknown, visit: (leaf: UnknownNode) => void): void {
  if (!Array.isArray(pages)) return;
  for (const page of pages) walkNode(page, visit);
}

function walkNode(node: unknown, visit: (leaf: UnknownNode) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as UnknownNode & { objects?: unknown };
  if (Array.isArray(n.objects)) {
    for (const child of n.objects) walkNode(child, visit);
    return;
  }
  if (Array.isArray(n.children)) {
    for (const child of n.children) walkNode(child, visit);
    return;
  }
  visit(n);
}
