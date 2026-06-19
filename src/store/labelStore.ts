import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ObjectChanges } from '../types/LabelObject';
import { PRINTER_PROFILE_FIELDS, printerProfileSchema } from '../types/PrinterProfile';
import { visitLeavesInPages } from '../lib/objectTree';
import { dropLegacyFontBindings } from '../lib/customFonts';
import type { CustomFontMapping } from '../types/LabelConfig';
import type { LabelObject } from '../types/Group';
import {
  createPrinterProfileSlice,
  type PrinterProfileSlice,
} from './slices/printerProfileSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';
import { createSelectionSlice, type SelectionSlice } from './slices/selectionSlice';
import { createPreviewSlice, type PreviewSlice } from './slices/previewSlice';
import { createCsvSlice, type CsvSlice } from './slices/csvSlice';
import { createVariablesSlice, type VariablesSlice } from './slices/variablesSlice';
import { createLabelConfigSlice, type LabelConfigSlice } from './slices/labelConfigSlice';
import { createObjectSlice, type ObjectSlice } from './slices/objectSlice';
import type { Variable, VariableInput } from '../types/Variable';

export { __resetPreviewCacheForTests } from './slices/previewSlice';
export type { ObjectChanges };
export type { Variable, VariableInput };

/** Composed store shape; intersection of every slice. */
export type LabelState =
  & ObjectSlice
  & PrinterProfileSlice
  & UiSlice
  & SelectionSlice
  & PreviewSlice
  & CsvSlice
  & VariablesSlice
  & LabelConfigSlice;

export {
  currentObjects,
  canCallLabelary,
  selectLabelaryNoticeRequired,
  selectPreviewLocksEditor,
  selectBatchInputs,
  selectCanBatchExport,
} from './labelStore.selectors';
import { currentObjects, selectPreviewLocksEditor } from './labelStore.selectors';

export function migrateLegacy(persistedState: unknown, version: number): unknown {
  if (!persistedState || typeof persistedState !== 'object') return persistedState;
  let s = persistedState as Record<string, unknown>;

  // v0→v1: top-level objects array → pages
  if (version < 1 && Array.isArray(s.objects) && !Array.isArray(s.pages)) {
    s = { ...s, pages: [{ objects: s.objects }], currentPageIndex: 0 };
  }

  // v1→v2: viewRotation was added after version 1 shipped; patch it if absent.
  if (version < 2) {
    const cs = s.canvasSettings;
    if (cs && typeof cs === 'object' && !('viewRotation' in cs)) {
      s = { ...s, canvasSettings: { ...(cs as Record<string, unknown>), viewRotation: 0 } };
    }
  }

  // v2→v3: `circle` was folded into `ellipse` with `lockAspect:true`. Old
  // saves still carry `type:'circle'` with `props.diameter`; rewrite them so
  // the rest of the app only ever sees the unified ellipse shape.
  if (version < 3) {
    s = { ...s, pages: migrateCirclesInPages(s.pages) };
  }

  // v3→v4: canvasSettings.csvRenderMode added for the schema/preview toggle.
  // Default to 'preview' so existing sessions keep showing data-substituted
  // canvas exactly as before.
  if (version < 4) {
    const cs = s.canvasSettings;
    if (cs && typeof cs === 'object' && !('csvRenderMode' in cs)) {
      s = { ...s, canvasSettings: { ...(cs as Record<string, unknown>), csvRenderMode: 'preview' } };
    }
  }

  // v4→v5: Setup-Script fields move out of labelConfig into a new
  // printerProfile slice (see PrinterProfile.ts). Extract any of the
  // 14 profile fields that lived on `label`, hoist them onto a fresh
  // `printerProfile`, and strip them from the label so the per-label
  // config no longer carries per-installation state.
  if (version < 5) {
    const label = s.label;
    if (label && typeof label === 'object') {
      const profileFields = new Set<string>(PRINTER_PROFILE_FIELDS);
      const profile: Record<string, unknown> = {};
      const nextLabel: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(label as Record<string, unknown>)) {
        if (profileFields.has(k)) profile[k] = v;
        else nextLabel[k] = v;
      }
      s = { ...s, label: nextLabel, printerProfile: profile };
    }
  }

  // Invariant: rehydrated state must carry `printerProfile`, else
  // every `s.printerProfile.foo` selector throws. Later migrations
  // assume this shape and don't re-seed it.
  if (!('printerProfile' in (s as Record<string, unknown>))) {
    s = { ...s, printerProfile: {} };
  }

  // v5→v6: gs1databar props.moduleWidth → props.magnification. The
  // value was always semantically the ^BR magnification multiplier
  // (1-10), not a dot quantity; the rename clarifies that.
  if (version < 6) {
    s = { ...s, pages: migrateGs1DatabarInPages(s.pages) };
  }

  // v6→v7: ^MA/^MI type codes corrected to match spec (R/C instead of
  // H/R). The legacy 'H' meant "head cleaning"; the spec letter is 'C'.
  // 'R' (replacement) was already correct.
  if (version < 7) {
    const pp = (s as Record<string, unknown>).printerProfile;
    if (pp && typeof pp === 'object') {
      s = { ...s, printerProfile: migrateMaintenanceTypeCodes(pp as Record<string, unknown>) };
    }
  }

  // v7→v8: drop path-less canvas-only font bindings left by the removed
  // built-in preview feature. They still resolve on canvas via alias but
  // only persist in saved JSON; scrub them so legacy sessions are clean.
  if (version < 8) {
    const label = s.label;
    if (label && typeof label === 'object') {
      const l = label as Record<string, unknown>;
      if (Array.isArray(l.customFonts)) {
        s = {
          ...s,
          label: {
            ...l,
            customFonts: dropLegacyFontBindings(l.customFonts as CustomFontMapping[]),
          },
        };
      }
    }
  }

  // Re-validate the rehydrated profile so a legacy snapshot that
  // violates the schema or a cross-field rule can't crash the slice's
  // safeParse on the next patch. Cross-field issues report a path
  // that may already be absent (clockMode='TOL' without
  // clockTolerance: path is ['clockTolerance']), so a single delete
  // pass is not enough. Fixpoint-loop until stable.
  const profile = (s as Record<string, unknown>).printerProfile;
  if (profile && typeof profile === 'object') {
    let next = { ...(profile as Record<string, unknown>) };
    for (let i = 0; i < 8; i++) {
      const validation = printerProfileSchema.safeParse(next);
      if (validation.success) break;
      const drop = new Set<string>();
      for (const issue of validation.error.issues) {
        const topKey = issue.path[0];
        if (typeof topKey === 'string' && topKey in next) drop.add(topKey);
      }
      // No present top-key to drop means the residual violation isn't
      // something the loop can resolve; bail to {} rather than spin.
      if (drop.size === 0) {
        next = {};
        break;
      }
      next = Object.fromEntries(Object.entries(next).filter(([k]) => !drop.has(k)));
    }
    s = { ...s, printerProfile: next };
  }

  return s;
}

function migrateMaintenanceTypeCodes(pp: Record<string, unknown>): Record<string, unknown> {
  const out = { ...pp };
  const remap = (obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    const o = obj as Record<string, unknown>;
    if (o.type === 'H') return { ...o, type: 'C' };
    return obj;
  };
  if (out.maintenanceAlert) out.maintenanceAlert = remap(out.maintenanceAlert);
  if (out.maintenanceMessage) out.maintenanceMessage = remap(out.maintenanceMessage);
  return out;
}

function migrateGs1DatabarInPages(pages: unknown): unknown {
  // Mutates in place via the shared leaf walker; pages is the persisted
  // payload not the live store, so mutation is safe.
  visitLeavesInPages(pages, (leaf) => {
    if (
      leaf.type !== 'gs1databar' ||
      !leaf.props ||
      typeof leaf.props !== 'object'
    ) return;
    const props = leaf.props as Record<string, unknown>;
    if (!('moduleWidth' in props) || 'magnification' in props) return;
    props.magnification = props.moduleWidth;
    delete props.moduleWidth;
  });
  return pages;
}

function migrateCirclesInPages(pages: unknown): unknown {
  if (!Array.isArray(pages)) return pages;
  return pages.map((page) => {
    if (!page || typeof page !== 'object') return page;
    const p = page as { objects?: unknown };
    if (!Array.isArray(p.objects)) return page;
    return { ...p, objects: p.objects.map(migrateCircleObject) };
  });
}

function migrateCircleObject(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const o = obj as { type?: unknown; props?: unknown; children?: unknown };
  if (Array.isArray(o.children)) {
    return { ...o, children: o.children.map(migrateCircleObject) };
  }
  if (o.type !== 'circle' || !o.props || typeof o.props !== 'object') return obj;
  const cp = o.props as { diameter?: number; thickness?: number; filled?: boolean; color?: 'B' | 'W' };
  const d = typeof cp.diameter === 'number' ? cp.diameter : 100;
  return {
    ...o,
    type: 'ellipse',
    props: {
      width: d,
      height: d,
      thickness: typeof cp.thickness === 'number' ? cp.thickness : 3,
      filled: cp.filled === true,
      color: cp.color === 'W' ? 'W' : 'B',
      lockAspect: true,
    },
  };
}

/** localStorage persist subset. `thirdParty` is intentionally OUT: the
 *  build-time env (VITE_THIRD_PARTY_*) is the single source of truth. */
export const persistPartialize = (state: LabelState) => ({
  label: state.label,
  printerProfile: state.printerProfile,
  pages: state.pages,
  currentPageIndex: state.currentPageIndex,
  locale: state.locale,
  theme: state.theme,
  labelaryNoticeAcknowledged: state.labelaryNoticeAcknowledged,
  canvasSettings: state.canvasSettings,
  paletteFavorites: state.paletteFavorites,
  showZplCommands: state.showZplCommands,
  variables: state.variables,
  csvMapping: state.csvMapping,
});

/** zundo undo-timeline subset; narrower than persist, only the
 *  document state (label/profile/pages/variables/csvMapping) is undoable. */
export const temporalPartialize = (state: LabelState) => ({
  label: state.label,
  printerProfile: state.printerProfile,
  pages: state.pages,
  currentPageIndex: state.currentPageIndex,
  variables: state.variables,
  csvMapping: state.csvMapping,
});

export const useLabelStore = create<LabelState>()(
  temporal(
    persist(
    (set, get, store) => ({
      ...createObjectSlice(set, get, store),
      ...createPrinterProfileSlice(set, get, store),
      ...createUiSlice(set, get, store),
      ...createSelectionSlice(set, get, store),
      ...createPreviewSlice(set, get, store),
      ...createCsvSlice(set, get, store),
      ...createVariablesSlice(set, get, store),
      ...createLabelConfigSlice(set, get, store),
    }),
    {
      name: 'zpl-designer-session',
      version: 8,
      migrate: (persistedState, version) => migrateLegacy(persistedState, version) as LabelState,
      storage: createJSONStorage(() => localStorage),
      partialize: persistPartialize,
    }
    ),
    {
      partialize: temporalPartialize,
    }
  )
);

export const useCurrentObjects = () => useLabelStore(currentObjects);

/** Non-reactive sibling of `useCurrentObjects` for use inside event handlers
 *  and callbacks where a one-time read is wanted. */
export const getCurrentObjects = (): LabelObject[] =>
  currentObjects(useLabelStore.getState());

// Wraps zundo so undo/redo become no-ops under the preview lock;
// `canUndo`/`canRedo` still reflect real history for button state.
const noopHistoryAction = () => {
  /* preview lock active */
};
export const useHistory = () => {
  const history = useStore(useLabelStore.temporal);
  const locked = useLabelStore(selectPreviewLocksEditor);
  if (!locked) return history;
  return { ...history, undo: noopHistoryAction, redo: noopHistoryAction };
};
