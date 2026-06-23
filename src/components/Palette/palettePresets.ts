import { ObjectRegistry, getEntry } from '../../registry';
import type { ObjectGroup } from '../../types/LabelObject';
import type { ObjectTypeDefinition } from '../../types/ObjectType';
import type { Translations } from '../../locales';

/** A palette / context-menu entry that spawns an object. `id` is the stable
 *  identity (registry type, or a preset id like `line-diagonal`); `type` is the
 *  registry type to instantiate, `propsOverride` the preset's prop seed. Single
 *  source so the palette, the "add here" context menu, and favorites stay in
 *  sync instead of each rebuilding from raw registry types. */
export interface AddableEntry {
  id: string;
  type: string;
  icon: string;
  zplCmd?: string;
  label: string;
  defaultSize: ObjectTypeDefinition['defaultSize'];
  propsOverride?: object;
}

/** Extra entries that spawn an existing type in a preset mode (diagonal line,
 *  filled box, text ^FB/^TB). The badge shows the mode-specific command. */
interface PalettePreset {
  id: string;
  group: ObjectGroup;
  type: string;
  icon: string;
  zplCmd: string;
  label: (t: Translations) => string;
  propsOverride: object;
  defaultSize: { width: number; height: number };
}

const PALETTE_PRESETS: PalettePreset[] = [
  { id: 'line-diagonal', group: 'shape', type: 'line', icon: '╱', zplCmd: '^GD',
    label: (t) => t.types.lineDiagonal, propsOverride: { angle: 45 }, defaultSize: { width: 140, height: 140 } },
  { id: 'box-filled', group: 'shape', type: 'box', icon: '■', zplCmd: '^GB',
    label: (t) => t.types.boxFilled, propsOverride: { filled: true }, defaultSize: { width: 200, height: 100 } },
  { id: 'text-fb', group: 'text', type: 'text', icon: '¶', zplCmd: '^FB',
    label: (t) => t.registry.text.modeFieldBlock, propsOverride: { blockWidth: 400, blockLines: 3 }, defaultSize: { width: 400, height: 90 } },
  { id: 'text-tb', group: 'text', type: 'text', icon: '▭', zplCmd: '^TB',
    label: (t) => t.registry.text.modeTextBlock, propsOverride: { textMode: 'tb', blockWidth: 400, blockHeight: 120 }, defaultSize: { width: 400, height: 120 } },
];

const PRESET_BY_ID = new Map(PALETTE_PRESETS.map((p) => [p.id, p]));

function presetEntry(p: PalettePreset, t: Translations): AddableEntry {
  return { id: p.id, type: p.type, icon: p.icon, zplCmd: p.zplCmd, label: p.label(t), defaultSize: p.defaultSize, propsOverride: p.propsOverride };
}

function registryEntry(type: string, t: Translations): AddableEntry | null {
  const def = getEntry(type);
  if (!def) return null;
  return { id: type, type, icon: def.icon, zplCmd: def.zplCmd, label: (t.types as Record<string, string>)[type] ?? def.label, defaultSize: def.defaultSize };
}

/** Resolve an entry by id (registry type or preset id); null if unknown. Used
 *  by favorites, which store ids. */
export function resolveAddable(id: string, t: Translations): AddableEntry | null {
  const preset = PRESET_BY_ID.get(id);
  return preset ? presetEntry(preset, t) : registryEntry(id, t);
}

/** Addable entries for a group: registry types in registry order, then presets. */
export function addablesInGroup(group: ObjectGroup, t: Translations): AddableEntry[] {
  const base = Object.entries(ObjectRegistry)
    .filter(([, def]) => def.group === group)
    .map(([type]) => registryEntry(type, t))
    .filter((e): e is AddableEntry => e !== null);
  const presets = PALETTE_PRESETS.filter((p) => p.group === group).map((p) => presetEntry(p, t));
  return [...base, ...presets];
}
