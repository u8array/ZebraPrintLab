import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** Shared so SectionCard persists section open-state under the same keys
 *  as CollapsibleSection (a section's state survives either renderer). */
export const SECTION_LS_PREFIX = 'zpl:section:';

function readStored(id: string, fallback: boolean): boolean {
  const saved = localStorage.getItem(SECTION_LS_PREFIX + id);
  return saved === null ? fallback : saved === '1';
}

/**
 * Open/closed state persisted per `id` in localStorage. Shared by
 * CollapsibleSection and the Properties-panel SectionCard so the latter can
 * render its own card chrome while keeping identical persistence (keys +
 * re-sync-on-id-change).
 */
export function useCollapsibleState(
  id: string,
  defaultOpen: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(() => readStored(id, defaultOpen));

  // Re-sync open state when `id` changes so the hook can be reused for a
  // different section without leaking the previous open state into the new
  // id's storage slot. React's blessed pattern for deriving state from
  // props: setState during render under a prev-vs-current guard.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setOpen(readStored(id, defaultOpen));
  }

  useEffect(() => {
    localStorage.setItem(SECTION_LS_PREFIX + id, open ? '1' : '0');
  }, [id, open]);

  return [open, setOpen];
}
