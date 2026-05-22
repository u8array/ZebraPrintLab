import type { LabelObject } from "../types/Group";
import type { Variable } from "../types/Variable";

/**
 * Resolve an object's `variableId` against the variable list and return
 * the bound Variable, or `undefined` when the object is unbound or its
 * binding points at a variable that no longer exists (orphan).
 */
export function lookupBoundVariable(
  obj: LabelObject,
  variables: readonly Variable[],
): Variable | undefined {
  if (!obj.variableId) return undefined;
  return variables.find((v) => v.id === obj.variableId);
}

/**
 * Return `obj` with `props.content` swapped for the bound Variable's
 * `defaultValue`, so canvas renderers preview what the printer will
 * actually print absent a runtime `^FV` override. Identity-preserving:
 * returns the same reference when the object isn't bound or already
 * carries the resolved value, so React's referential-equality
 * optimisations stay effective.
 *
 * Every bindable type today exposes `props.content` (text + 8 barcode
 * types; see `bindable: true` in the registry). Non-bindable types
 * never have a `variableId`, so the early return covers them.
 */
export function applyBindingToObject<T extends LabelObject>(
  obj: T,
  variables: readonly Variable[],
): T {
  const variable = lookupBoundVariable(obj, variables);
  if (!variable) return obj;
  const props = (obj as { props?: { content?: unknown } }).props;
  if (!props || typeof props.content !== "string") return obj;
  if (props.content === variable.defaultValue) return obj;
  // The discriminated union doesn't narrow through a spread, so we cast
  // back to T. Runtime shape preserves the original variant; only
  // `props.content` changes.
  return {
    ...obj,
    props: { ...props, content: variable.defaultValue },
  } as unknown as T;
}
