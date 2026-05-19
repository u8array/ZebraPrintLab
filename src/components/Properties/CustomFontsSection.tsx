import {
  InformationCircleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { useT } from "../../lib/useT";
import { getAllFonts } from "../../lib/fontCache";
import { useFontCacheVersion } from "../../hooks/useFontCacheVersion";
import { normalizeAlias, DEFAULT_FONT_DRIVE } from "../../lib/customFonts";
import { inputCls } from "./styles";
import type { CustomFontMapping } from "../../types/ObjectType";

const PATHS_DATALIST_ID = "zpl-custom-font-paths";

/** Standard Zebra storage drive prefixes. Surfaced as datalist hints so
 *  users new to ZPL discover the path syntax without reading the spec.
 *  E = flash, R = volatile RAM, A = removable (PCMCIA/CF), B = optional
 *  on-board flash. */
const ZPL_DRIVE_PREFIXES = ["E:", "R:", "A:", "B:"] as const;

/** Editor for the ^CW alias→path mapping list. The alias input restricts
 *  to [A-Z0-9] to match the schema regex; empty aliases or paths survive
 *  in state so users can type at their own pace, but rows that stay empty
 *  through a blur are auto-removed and the generator skips any that slip
 *  through at emit time. */
export function CustomFontsSection({
  mappings,
  onChange,
}: {
  mappings: CustomFontMapping[];
  onChange: (next: CustomFontMapping[]) => void;
}) {
  const t = useT();
  // useFontCacheVersion triggers a re-render whenever the font cache
  // changes; the React Compiler handles memoisation downstream.
  useFontCacheVersion();
  const uploadedPaths = getAllFonts().map(
    (f) => `${DEFAULT_FONT_DRIVE}${f.name}`,
  );

  // Count alias occurrences so duplicates can be flagged inline. Empty
  // aliases never count as duplicates of each other.
  const aliasCounts = new Map<string, number>();
  for (const m of mappings) {
    if (m.alias) aliasCounts.set(m.alias, (aliasCounts.get(m.alias) ?? 0) + 1);
  }
  const isDuplicateAlias = (alias: string) =>
    !!alias && (aliasCounts.get(alias) ?? 0) > 1;

  const updateAt = (i: number, patch: Partial<CustomFontMapping>) => {
    onChange(mappings.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  const removeAt = (i: number) => {
    onChange(mappings.filter((_, idx) => idx !== i));
  };
  const add = () => {
    onChange([...mappings, { alias: "", path: "" }]);
  };
  // Auto-remove a row when focus leaves it and both fields are blank.
  // Keeps the editor tidy without an explicit "discard" interaction.
  const handleRowBlur = (i: number) => {
    // Defer to next tick so focus can land on the sibling input first;
    // otherwise tabbing alias → path would delete the row mid-traversal.
    requestAnimationFrame(() => {
      const row = mappings[i];
      if (row && !row.alias && !row.path) removeAt(i);
    });
  };

  return (
    <CollapsibleSection
      id="label-custom-fonts"
      title={
        <span className="inline-flex items-center gap-1">
          {t.label.customFontsHeading}
          <InformationCircleIcon
            className="w-3.5 h-3.5 text-muted"
            title={t.label.customFontsHint}
          />
        </span>
      }
      defaultOpen={false}
    >
      <div className="flex flex-col gap-2">
        {mappings.map((m, i) => {
          const dup = isDuplicateAlias(m.alias);
          return (
            <div
              key={i}
              className="grid grid-cols-[2.5rem_1fr_auto] gap-2 items-center"
              onBlur={() => handleRowBlur(i)}
            >
              <input
                type="text"
                className={`${inputCls} ${dup ? "border-red-500" : ""}`}
                maxLength={1}
                placeholder={t.label.customFontsAlias}
                title={
                  dup
                    ? t.label.customFontsDuplicateAlias
                    : t.label.customFontsAliasHint
                }
                aria-invalid={dup || undefined}
                value={m.alias}
                onChange={(e) =>
                  updateAt(i, { alias: normalizeAlias(e.target.value) })
                }
              />
              <input
                type="text"
                className={inputCls}
                list={PATHS_DATALIST_ID}
                placeholder={t.label.customFontsPath}
                value={m.path}
                onChange={(e) => updateAt(i, { path: e.target.value })}
              />
              <button
                type="button"
                className="p-1 text-muted hover:text-text"
                onClick={() => removeAt(i)}
                aria-label={t.label.customFontsRemove}
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted hover:text-text self-start"
          onClick={add}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {t.label.customFontsAdd}
        </button>
        <datalist id={PATHS_DATALIST_ID}>
          {ZPL_DRIVE_PREFIXES.map((p) => (
            <option key={p} value={p} />
          ))}
          {uploadedPaths.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
    </CollapsibleSection>
  );
}
