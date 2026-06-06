/** Horizontal pixels per nesting level in the layers panel. Used by the
 *  row renderer to size the indent spacers and by the drag hook to
 *  quantise cursor-X into a target depth; both have to agree on the
 *  same step so the insertion line lines up with where the drop will
 *  actually land. Single home for that invariant. */
export const INDENT_STEP = 16;
