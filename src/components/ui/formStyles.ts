/** Neutral form-control style primitives shared across feature
 *  modules. Originally lived under `components/Properties/styles.ts`,
 *  moved here so reusable modules (PrinterSettings, future modals)
 *  do not need to reach into a sibling feature module for visual
 *  primitives. `components/Properties/styles.ts` re-exports these
 *  for backwards compatibility with existing call sites. */
export const inputCls = 'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs font-mono text-text focus:border-accent focus:outline-none';
export const labelCls = 'font-mono text-[10px] text-muted uppercase tracking-wider';
/** Secondary-action button: file upload, toggle row, etc. Matches the
 *  surface-2 + border styling used by `inputCls` so buttons sit naturally
 *  next to form fields without dominating the visual hierarchy. */
export const buttonCls = 'px-3 py-1.5 rounded text-xs font-mono bg-surface-2 border border-border text-text hover:bg-border transition-colors';
