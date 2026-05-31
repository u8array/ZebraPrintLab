import type { StateCreator } from 'zustand';
import {
  nextFreeFnNumber,
  validateVariablesUnique,
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  type Variable,
  type VariableInput,
} from '../../types/Variable';
import { stripVariableIdFromObjects } from '../../types/Group';
import { rewriteTemplateMarkers } from '../labelStore.internals';
import { selectPreviewLocksEditor } from '../labelStore.selectors';
import type { LabelState } from '../labelStore';

export interface VariablesSlice {
  /** Document-level template variables. Fields reference them via
   *  `variableId`; export emits `^FN{fnNumber}^FD{defaultValue}^FS`.
   *  Order is user-controlled and surfaces in the Variables panel. */
  variables: Variable[];

  /** Create a new variable. Returns the id, or null when all 99 slots
   *  are taken or the supplied fnNumber is out of range / already used. */
  addVariable: (input: VariableInput) => string | null;
  /** Patch fields on an existing variable. Validates name + fnNumber
   *  uniqueness; rejects silently (no-op) on conflict. */
  updateVariable: (id: string, changes: Partial<Omit<Variable, 'id'>>) => void;
  /** Delete a variable and unbind every field that referenced it
   *  across every page. */
  removeVariable: (id: string) => void;
  /** Bulk-replace the variables list. Used by the mapping-modal Apply
   *  path so add-variable-inline commits atomically with the new
   *  mapping. Cleanup of bindings still goes through `removeVariable`. */
  setVariables: (variables: Variable[]) => void;
}

export const createVariablesSlice: StateCreator<LabelState, [], [], VariablesSlice> = (set, get) => ({
  variables: [],

  addVariable: (input) => {
    const state = get();
    if (selectPreviewLocksEditor(state)) return null;
    const trimmedName = input.name.trim();
    if (trimmedName === '') return null;
    if (state.variables.some((v) => v.name === trimmedName)) return null;

    let fnNumber: number;
    if (input.fnNumber !== undefined) {
      if (input.fnNumber < FN_NUMBER_MIN || input.fnNumber > FN_NUMBER_MAX) return null;
      if (state.variables.some((v) => v.fnNumber === input.fnNumber)) return null;
      fnNumber = input.fnNumber;
    } else {
      const next = nextFreeFnNumber(state.variables.map((v) => v.fnNumber));
      if (next === null) return null;
      fnNumber = next;
    }

    const variable: Variable = {
      id: crypto.randomUUID(),
      name: trimmedName,
      fnNumber,
      defaultValue: input.defaultValue ?? '',
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    };
    set((s) => ({ variables: [...s.variables, variable] }));
    return variable.id;
  },

  updateVariable: (id, changes) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const existing = state.variables.find((v) => v.id === id);
      if (!existing) return {};

      let patched = changes;
      if (changes.name !== undefined) {
        const trimmed = changes.name.trim();
        if (trimmed === '') return {};
        if (state.variables.some((v) => v.id !== id && v.name === trimmed)) return {};
        patched = { ...patched, name: trimmed };
      }
      if (changes.fnNumber !== undefined) {
        if (changes.fnNumber < FN_NUMBER_MIN || changes.fnNumber > FN_NUMBER_MAX) return {};
        if (state.variables.some((v) => v.id !== id && v.fnNumber === changes.fnNumber)) return {};
      }

      const next: Partial<LabelState> = {
        variables: state.variables.map((v) => (v.id === id ? { ...v, ...patched } : v)),
      };
      // Rename ripple: every `«oldName»` marker in any object's content
      // needs to point at the new name, otherwise the templates dangle.
      if (patched.name !== undefined && patched.name !== existing.name) {
        const oldName = existing.name;
        const newName = patched.name;
        next.pages = state.pages.map((page) => ({
          ...page,
          objects: rewriteTemplateMarkers(page.objects, oldName, newName),
        }));
      }
      return next;
    }),

  setVariables: (variables) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (!validateVariablesUnique(variables)) return {};
      return { variables };
    }),

  removeVariable: (id) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (!state.variables.some((v) => v.id === id)) return {};
      let pagesChanged = false;
      const nextPages = state.pages.map((p) => {
        const stripped = stripVariableIdFromObjects(p.objects, id);
        if (stripped === p.objects) return p;
        pagesChanged = true;
        return { ...p, objects: stripped };
      });
      // Drop any csvMapping binding pointing at the deleted variable so
      // the design file doesn't carry orphan references.
      let nextMapping = state.csvMapping;
      if (state.csvMapping && id in state.csvMapping.bindings) {
        const { [id]: _drop, ...rest } = state.csvMapping.bindings;
        void _drop;
        nextMapping = { ...state.csvMapping, bindings: rest };
      }
      return {
        variables: state.variables.filter((v) => v.id !== id),
        ...(pagesChanged ? { pages: nextPages } : {}),
        ...(nextMapping !== state.csvMapping ? { csvMapping: nextMapping } : {}),
      };
    }),
});
