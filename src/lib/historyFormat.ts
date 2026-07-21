import { getEntry } from '@zplab/core/registry';
import { formatTemplate } from './formatTemplate';
import type { Translations } from '../locales';
import type { HistoryStepDescriptor } from './historyStep';
import type { HistorySubmenu } from './menuModel';

/** Steps shown around the current one in the desktop History submenu; a native
 *  menu can't scroll a long timeline. */
const HISTORY_WINDOW = 12;

/** Minimal timeline entry shape (a store HistoryEntry), kept structural so this
 *  pure module does not depend on the store layer. */
interface HistoryEntryLike {
  descriptor: HistoryStepDescriptor;
  isCurrent: boolean;
}

/** The current step is disabled (a 0-step jump would only toggle its
 *  checkmark), and everything is inert under a preview lock. Pure so the
 *  window/index math is testable, like buildMenuModel. */
export function buildHistorySubmenu(
  t: Translations,
  entries: HistoryEntryLike[],
  currentIndex: number,
  locked: boolean,
  canClear: boolean,
): HistorySubmenu {
  const start = Math.max(0, currentIndex - HISTORY_WINDOW);
  const windowed = entries.length > 1 ? entries.slice(start, currentIndex + HISTORY_WINDOW + 1) : [];
  return {
    label: t.history.title,
    clearLabel: t.history.clear,
    canClear: !locked && canClear,
    items: windowed.map((entry, i) => ({
      index: start + i,
      label: formatStep(t, entry.descriptor),
      current: entry.isCurrent,
      enabled: !locked && !entry.isCurrent,
    })),
  };
}

/** Human label for a history step, shared by the DOM popover and the desktop
 *  native submenu so both surfaces label steps identically. An object step's
 *  `name` is a custom name or a registry type id; the id resolves to its
 *  label, custom names pass through (as do variable names). */
export function formatStep(t: Translations, d: HistoryStepDescriptor): string {
  const h = t.history;
  const typeName = (name: string) => getEntry(name)?.label ?? name;
  const count = String(d.count ?? 0);
  switch (d.kind) {
    case 'initial':
      return h.initial;
    case 'load':
      return h.load;
    case 'add':
      return d.name
        ? formatTemplate(h.addOneFmt, { name: typeName(d.name) })
        : formatTemplate(h.addManyFmt, { count });
    case 'remove':
      return d.name
        ? formatTemplate(h.removeOneFmt, { name: typeName(d.name) })
        : formatTemplate(h.removeManyFmt, { count });
    case 'move':
      return d.name
        ? formatTemplate(h.moveOneFmt, { name: typeName(d.name) })
        : formatTemplate(h.moveManyFmt, { count });
    case 'resize':
      return d.name
        ? formatTemplate(h.resizeOneFmt, { name: typeName(d.name) })
        : formatTemplate(h.resizeManyFmt, { count });
    case 'edit':
      return d.name
        ? formatTemplate(h.editOneFmt, { name: typeName(d.name) })
        : formatTemplate(h.editManyFmt, { count });
    case 'group':
      return h.group;
    case 'reorder':
      return h.reorder;
    case 'variable':
      return d.name ? formatTemplate(h.variableFmt, { name: d.name }) : h.variableGeneric;
    case 'dataset':
      return h.dataset;
    case 'label':
      return h.label;
    case 'page':
      return h.page;
    case 'mixed':
      return h.mixed;
  }
}
