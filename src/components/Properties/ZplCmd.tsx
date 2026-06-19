import type { ReactNode } from 'react';
import { useLabelStore } from '../../store/labelStore';
import { labelCls, zplCommandTagCls } from '../ui/formStyles';

/**
 * Read-only ZPL command tag for a properties field (e.g. `^A`). Renders only
 * when the power-user `showZplCommands` preference is on. The mapping is a
 * static field→command reference (what this field emits), not a live
 * "currently in output" signal, so it is never gated on the field's own
 * enabled/disabled state.
 */
export function ZplCmd({ cmd }: { cmd?: string }) {
  const show = useLabelStore((s) => s.showZplCommands);
  if (!show || !cmd) return null;
  return <span className={zplCommandTagCls}>{cmd}</span>;
}

/**
 * Field label row with an optional command tag pushed to the right. Drop-in
 * for the `<label className={labelCls}>…</label>` rows in registry panels;
 * collapses to a plain label when the tag is hidden or absent.
 */
export function FieldLabel({
  children,
  cmd,
  htmlFor,
}: {
  children: ReactNode;
  cmd?: string;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className={labelCls}>
        {children}
      </label>
      <ZplCmd cmd={cmd} />
    </div>
  );
}
