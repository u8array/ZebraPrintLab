import { useEffect, useRef, useState } from 'react';
import { buttonCls } from './formStyles';

interface Props {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/** Destructive action with a two-step inline confirm: the button arms in place
 *  ("confirm / cancel") instead of opening a dialog. Avoids modal-on-modal
 *  stacking when used inside another modal, and stays pure DOM so it behaves the
 *  same in the browser and a Tauri build (no native dialog branch). */
export function DangerConfirmButton({ label, confirmLabel, cancelLabel, onConfirm }: Props) {
  const [armed, setArmed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);

  // Disarming unmounts the focused confirm/cancel button; hand focus back to the
  // trigger so it stays inside an enclosing modal's focus trap (else it falls to
  // <body> and Escape/Tab stop working). Skip the initial mount.
  useEffect(() => {
    if (!armed && wasArmed.current) triggerRef.current?.focus();
    wasArmed.current = armed;
  }, [armed]);

  if (!armed) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setArmed(true)}
        className="self-start px-3 py-1.5 rounded text-xs font-mono border border-error/60 text-error hover:bg-error/10 transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        autoFocus
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
        className="px-3 py-1.5 rounded text-xs font-mono bg-error text-white hover:bg-error/90 transition-colors"
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className={buttonCls}>
        {cancelLabel}
      </button>
    </span>
  );
}
