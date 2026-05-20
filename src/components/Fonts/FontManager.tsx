import { useRef, useState, useCallback, type FocusEvent } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/16/solid';
import { getAllFonts, loadFontFile, removeFont } from '../../lib/fontCache';
import { useFontCacheVersion } from '../../hooks/useFontCacheVersion';
import { useLabelStore } from '../../store/labelStore';
import { useT } from '../../lib/useT';
import {
  DEFAULT_FONT_DRIVE,
  ZPL_BUILTIN_FONT_IDS,
  ZPL_DRIVE_PREFIXES,
  isBuiltinFontId,
  nextFreeAlias,
  normalizeAlias,
  uploadedFontPath,
  upsertCustomFontMapping,
} from '../../lib/customFonts';
import { inputCls, labelCls } from '../Properties/styles';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { CustomFontMapping } from '../../types/ObjectType';

const PATHS_DATALIST_ID = 'zpl-custom-font-paths';

const addBtnCls =
  'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors';

export function FontManager() {
  const t = useT();
  useFontCacheVersion();
  const customFonts = useLabelStore((s) => s.label.customFonts);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);

  const fonts = getAllFonts();
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const uploadedNames = new Set(fonts.map((f) => f.name));

  // Partition customFonts into three buckets matched to the three UI
  // sections. Discriminator is the *presence* of the `path` property
  // (m.path === undefined), not its truthiness — a manual mapping
  // freshly added carries an empty-string path while the user types,
  // and we must keep that row in the manual section instead of
  // mis-routing it into the built-in-preview bucket. We also remember
  // each manual entry's index in the full `customFonts` array so the
  // section's update / remove handlers can target a specific row even
  // when two rows transiently share the same (empty) path.
  const aliasByPath = new Map<string, string>();
  const manualMappings: { entry: CustomFontMapping; index: number }[] = [];
  const builtinPreviews: CustomFontMapping[] = [];
  (customFonts ?? []).forEach((m, index) => {
    if (m.path === undefined) {
      builtinPreviews.push(m);
      return;
    }
    if (m.path) aliasByPath.set(m.path, m.alias);
    const isUploadedPath =
      m.path.startsWith(DEFAULT_FONT_DRIVE) &&
      uploadedNames.has(m.path.slice(DEFAULT_FONT_DRIVE.length));
    if (!isUploadedPath) manualMappings.push({ entry: m, index });
  });

  const aliasCounts = new Map<string, number>();
  for (const m of customFonts ?? []) {
    if (m.alias) aliasCounts.set(m.alias, (aliasCounts.get(m.alias) ?? 0) + 1);
  }
  const isDuplicateAlias = (alias: string) =>
    !!alias && (aliasCounts.get(alias) ?? 0) > 1;

  const replaceList = (next: CustomFontMapping[]) => {
    setLabelConfig({ customFonts: next.length > 0 ? next : undefined });
  };

  const setAliasForPath = (path: string, rawAlias: string) => {
    // For uploaded fonts the entry should also bind the local TTF for
    // canvas preview: derive `previewFontName` from the path so the
    // generator / parser / renderer all share one source of truth.
    // upsertCustomFontMapping already handles the alias upsert; we
    // augment the resulting entry with the preview-binding here.
    const alias = normalizeAlias(rawAlias);
    const next = upsertCustomFontMapping(customFonts, path, alias);
    if (alias) {
      const entry = next.find((m) => m.path === path);
      if (entry && uploadedNames.has(path.slice(DEFAULT_FONT_DRIVE.length))) {
        entry.previewFontName = path.slice(DEFAULT_FONT_DRIVE.length);
      }
    }
    replaceList(next);
  };

  const toggleEmbedForPath = (path: string, embed: boolean) => {
    const list = customFonts ?? [];
    replaceList(
      list.map((m) =>
        m.path === path
          ? embed
            ? {
                ...m,
                embedInZpl: true,
                // ~DY needs the TTF bytes from fontCache; the upload
                // row implies the binding, so pin previewFontName too
                // (idempotent when already set).
                previewFontName:
                  m.previewFontName ?? path.slice(DEFAULT_FONT_DRIVE.length),
              }
            : { ...m, embedInZpl: undefined }
          : m,
      ),
    );
  };

  const updateManualAt = (
    index: number,
    patch: Partial<CustomFontMapping>,
  ) => {
    const list = customFonts ?? [];
    replaceList(
      list.map((m, i) =>
        i === index
          ? {
              ...m,
              alias:
                patch.alias !== undefined
                  ? normalizeAlias(patch.alias)
                  : m.alias,
              path: patch.path ?? m.path,
            }
          : m,
      ),
    );
  };

  const removeAt = (index: number) => {
    replaceList((customFonts ?? []).filter((_, i) => i !== index));
  };

  const addManual = () => {
    // Suggest the next free letter from the I-Z 1-9 range so the user
    // does not accidentally override a built-in Zebra font letter. They
    // can still type any letter manually if they want the override.
    const taken = (customFonts ?? []).map((m) => m.alias).filter(Boolean);
    replaceList([
      ...(customFonts ?? []),
      { alias: nextFreeAlias(taken), path: '' },
    ]);
  };

  const addBuiltinPreview = () => {
    // Pick the first built-in id that does not already have a binding
    // so the new row lands on a usable default. If every built-in is
    // already bound, fall back to "0" — the user can edit it.
    const takenAliases = new Set(
      (customFonts ?? [])
        .filter((m) => m.path === undefined)
        .map((m) => m.alias),
    );
    const next =
      ZPL_BUILTIN_FONT_IDS.find((id) => !takenAliases.has(id)) ?? '0';
    replaceList([...(customFonts ?? []), { alias: next, previewFontName: '' }]);
  };

  // Built-in-preview rows are keyed by alias (one binding per ID).
  // Patch is applied via spread so an explicit `undefined` actually
  // clears the field — the previous `?? m.previewFontName` fallback
  // turned "Pick a font…" into a no-op because Nullish-coalescing
  // ignores undefined patches.
  const updateBuiltinPreview = (
    currentAlias: string,
    patch: Partial<CustomFontMapping>,
  ) => {
    const list = customFonts ?? [];
    replaceList(
      list.map((m) => {
        if (m.alias !== currentAlias || m.path !== undefined) return m;
        const next: CustomFontMapping = { ...m, ...patch };
        if (patch.alias !== undefined) {
          next.alias = normalizeAlias(patch.alias) || m.alias;
        }
        return next;
      }),
    );
  };

  const removeBuiltinPreview = (alias: string) => {
    replaceList(
      (customFonts ?? []).filter(
        (m) => !(m.alias === alias && m.path === undefined),
      ),
    );
  };

  const uploadedPaths = fonts.map((f) => uploadedFontPath(f.name));

  return (
    <div className="p-3 flex flex-col gap-3">
      <p className="font-mono text-[10px] font-medium text-muted uppercase tracking-widest px-1 pt-1">
        {t.fonts.heading}
      </p>

      {fonts.length === 0 && !adding && (
        <p className="text-xs text-muted px-1">{t.fonts.noFonts}</p>
      )}

      <div className="flex flex-col gap-1">
        {fonts.map((font) => {
          const path = uploadedFontPath(font.name);
          const alias = aliasByPath.get(path) ?? '';
          const entry = (customFonts ?? []).find((m) => m.path === path);
          // Cross-section visibility: list every built-in alias that
          // pins this TTF as a preview binding. Lets the user see why
          // the file is "important" before they hit delete.
          const previewAliases = builtinPreviews
            .filter((m) => m.previewFontName === font.name)
            .map((m) => m.alias);
          return (
            <FontEntry
              key={font.name}
              name={font.name}
              alias={alias}
              duplicate={isDuplicateAlias(alias)}
              embedInZpl={entry?.embedInZpl ?? false}
              previewAliases={previewAliases}
              onAliasChange={(v) => setAliasForPath(path, v)}
              onEmbedChange={(v) => toggleEmbedForPath(path, v)}
              onRequestDelete={() => setPendingDelete(font.name)}
            />
          );
        })}
      </div>

      {adding ? (
        <AddFontForm
          onDone={(uploadedName) => {
            // Auto-assign the next free alias when the upload succeeds.
            // Closes the "what now?" gap between the upload finishing
            // and the embed toggle becoming usable: the user lands on
            // a row that is already wired through to ^CW + canvas, with
            // an editable alias if they want to override the default.
            if (uploadedName) {
              const path = uploadedFontPath(uploadedName);
              const taken = (customFonts ?? [])
                .map((m) => m.alias)
                .filter(Boolean);
              const alias = nextFreeAlias(taken);
              if (alias) setAliasForPath(path, alias);
            }
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" className={addBtnCls} onClick={() => setAdding(true)}>
          <span className="text-accent">+</span>
          {t.fonts.addFont}
        </button>
      )}

      <CollapsibleSection
        id="fonts-printer-resident"
        title={t.fonts.manualMappingsHeading}
        defaultOpen={manualMappings.length > 0}
      >
        <ManualMappingsSection
          rows={manualMappings}
          hint={t.fonts.manualMappingsHint}
          addLabel={t.fonts.addManualMapping}
          isDuplicateAlias={isDuplicateAlias}
          onUpdate={updateManualAt}
          onRemove={removeAt}
          onAdd={addManual}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="fonts-builtin-previews"
        title={t.fonts.builtinPreviewsHeading}
        defaultOpen={builtinPreviews.length > 0}
      >
        <BuiltinPreviewSection
          mappings={builtinPreviews}
          uploadedFonts={fonts.map((f) => f.name)}
          hint={t.fonts.builtinPreviewsHint}
          addLabel={t.fonts.addBuiltinPreview}
          isDuplicateAlias={isDuplicateAlias}
          onUpdate={updateBuiltinPreview}
          onRemove={removeBuiltinPreview}
          onAdd={addBuiltinPreview}
        />
      </CollapsibleSection>

      <datalist id={PATHS_DATALIST_ID}>
        {ZPL_DRIVE_PREFIXES.map((p) => (
          <option key={p} value={p} />
        ))}
        {uploadedPaths.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {pendingDelete !== null && (
        <ConfirmDialog
          message={t.fonts.deleteConfirm}
          confirmLabel={t.fonts.delete}
          cancelLabel={t.app.cancel}
          destructive
          onConfirm={() => {
            removeFont(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ── FontEntry ──────────────────────────────────────────────────────────────────

interface FontEntryProps {
  name: string;
  alias: string;
  duplicate: boolean;
  embedInZpl: boolean;
  /** Built-in font IDs that map to this TTF as a preview binding. */
  previewAliases: string[];
  onAliasChange: (next: string) => void;
  onEmbedChange: (next: boolean) => void;
  onRequestDelete: () => void;
}

function FontEntry({
  name,
  alias,
  duplicate,
  embedInZpl,
  previewAliases,
  onAliasChange,
  onEmbedChange,
  onRequestDelete,
}: FontEntryProps) {
  const t = useT();
  // The embed toggle is only meaningful once an alias is in place —
  // ~DY without a matching ^CW would dump bytes onto the printer that
  // no field can reference. Disable + tooltip when alias is empty so
  // the constraint is visible instead of silently failing at emit.
  const embedDisabled = !alias;
  // Heads-up when the user picks a built-in letter (0, A-H): ^CW with
  // a built-in alias overrides the factory font on the printer, which
  // is rarely what the user wants — the "Built-in font previews"
  // section is the right place for an editor-only binding.
  const overridesBuiltin = isBuiltinFontId(alias);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-transparent hover:border-border-2 hover:bg-surface-2 transition-colors">
      <div className="grid grid-cols-[1fr_3rem_auto_auto] items-center gap-2">
        <span
          className="font-mono text-xs text-text truncate"
          title={name}
        >
          {name}
        </span>
        <input
          type="text"
          className={`${inputCls} text-center ${
            duplicate
              ? '!border-red-500'
              : overridesBuiltin
                ? '!border-amber-500'
                : ''
          }`}
          maxLength={1}
          placeholder="A-Z"
          title={
            duplicate
              ? t.label.customFontsDuplicateAlias
              : alias
                ? t.fonts.aliasAssigned
                : t.fonts.aliasHint
          }
          aria-invalid={duplicate || undefined}
          value={alias}
          onChange={(e) => onAliasChange(e.target.value)}
        />
        <label
          className={`flex items-center gap-1 text-[10px] font-mono ${
            embedDisabled
              ? 'text-muted opacity-40 cursor-not-allowed'
              : 'text-muted hover:text-text cursor-pointer'
          }`}
          title={t.fonts.embedInZplHint}
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={embedInZpl && !embedDisabled}
            disabled={embedDisabled}
            onChange={(e) => onEmbedChange(e.target.checked)}
          />
          {t.fonts.embedInZpl}
        </label>
        <button
          type="button"
          onClick={onRequestDelete}
          className="p-1 text-muted hover:text-red-400 transition-colors"
          title={t.fonts.delete}
          aria-label={t.fonts.delete}
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {overridesBuiltin && (
        <p className="text-[10px] text-amber-500 leading-snug pl-1">
          {t.fonts.builtinAliasWarning}
        </p>
      )}
      {previewAliases.length > 0 && (
        <p
          className="text-[10px] text-muted leading-snug pl-1"
          title={t.fonts.builtinPreviewsHeading}
        >
          {t.fonts.usedAsPreview}{' '}
          <span className="font-mono">{previewAliases.join(', ')}</span>
        </p>
      )}
    </div>
  );
}

// ── ManualMappingsSection ──────────────────────────────────────────────────────

interface ManualMappingsSectionProps {
  rows: { entry: CustomFontMapping; index: number }[];
  hint: string;
  addLabel: string;
  isDuplicateAlias: (alias: string) => boolean;
  /** `index` refers to the row's position in the full `customFonts`
   *  list (not in this section's subset) so the parent updates the
   *  correct entry even when two rows transiently share an empty path. */
  onUpdate: (index: number, patch: Partial<CustomFontMapping>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

function ManualMappingsSection({
  rows,
  hint,
  addLabel,
  isDuplicateAlias,
  onUpdate,
  onRemove,
  onAdd,
}: ManualMappingsSectionProps) {
  const t = useT();
  // Auto-remove rows whose alias AND path are both empty when focus
  // actually leaves the row container. requestAnimationFrame defers
  // the check until the new focus has landed, then we confirm the row
  // no longer contains it — tabbing between the row's own inputs does
  // not count as "leaving".
  const handleBlur = (
    e: FocusEvent<HTMLDivElement>,
    index: number,
    path: string,
    alias: string,
  ) => {
    const row = e.currentTarget;
    requestAnimationFrame(() => {
      if (!alias && !path && !row.contains(document.activeElement)) {
        onRemove(index);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted px-1 leading-relaxed">{hint}</p>
      {rows.map(({ entry: m, index }) => {
        const dup = isDuplicateAlias(m.alias);
        const path = m.path ?? '';
        return (
          <div
            key={index}
            className="grid grid-cols-[3rem_1fr_auto] gap-2 items-center"
            onBlur={(e) => handleBlur(e, index, path, m.alias)}
          >
            <input
              type="text"
              className={`${inputCls} text-center ${dup ? '!border-red-500' : ''}`}
              maxLength={1}
              placeholder="A-Z"
              title={
                dup
                  ? t.label.customFontsDuplicateAlias
                  : t.label.customFontsAliasHint
              }
              aria-invalid={dup || undefined}
              value={m.alias}
              onChange={(e) => onUpdate(index, { alias: e.target.value })}
            />
            <input
              type="text"
              className={inputCls}
              list={PATHS_DATALIST_ID}
              placeholder={t.label.customFontsPath}
              value={path}
              onChange={(e) => onUpdate(index, { path: e.target.value })}
            />
            <button
              type="button"
              className="p-1 text-muted hover:text-text"
              onClick={() => onRemove(index)}
              aria-label={t.label.customFontsRemove}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      <button type="button" className={addBtnCls} onClick={onAdd}>
        <PlusIcon className="w-3 h-3 text-accent" />
        {addLabel}
      </button>
    </div>
  );
}

// ── BuiltinPreviewSection ─────────────────────────────────────────────────────

interface BuiltinPreviewSectionProps {
  mappings: CustomFontMapping[];
  uploadedFonts: string[];
  hint: string;
  addLabel: string;
  isDuplicateAlias: (alias: string) => boolean;
  onUpdate: (currentAlias: string, patch: Partial<CustomFontMapping>) => void;
  onRemove: (alias: string) => void;
  onAdd: () => void;
}

function BuiltinPreviewSection({
  mappings,
  uploadedFonts,
  hint,
  addLabel,
  isDuplicateAlias,
  onUpdate,
  onRemove,
  onAdd,
}: BuiltinPreviewSectionProps) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted px-1 leading-relaxed">{hint}</p>
      {mappings.map((m) => {
        const dup = isDuplicateAlias(m.alias);
        return (
          <div
            key={m.alias}
            className="grid grid-cols-[4rem_1fr_auto] gap-2 items-center"
          >
            <select
              className={`${inputCls} ${dup ? '!border-red-500' : ''}`}
              aria-invalid={dup || undefined}
              value={m.alias}
              onChange={(e) =>
                onUpdate(m.alias, { alias: e.target.value })
              }
            >
              {ZPL_BUILTIN_FONT_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={m.previewFontName ?? ''}
              onChange={(e) =>
                onUpdate(m.alias, {
                  previewFontName: e.target.value || undefined,
                })
              }
            >
              <option value="">{t.fonts.noPreviewFont}</option>
              {uploadedFonts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {/* If a previously-saved binding references a font that
                  was since removed, surface it so the user can see /
                  re-bind it instead of silently dropping the entry. */}
              {m.previewFontName && !uploadedFonts.includes(m.previewFontName) && (
                <option value={m.previewFontName}>{m.previewFontName}</option>
              )}
            </select>
            <button
              type="button"
              className="p-1 text-muted hover:text-text"
              onClick={() => onRemove(m.alias)}
              aria-label={t.label.customFontsRemove}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      <button type="button" className={addBtnCls} onClick={onAdd}>
        <PlusIcon className="w-3 h-3 text-accent" />
        {addLabel}
      </button>
    </div>
  );
}

// ── AddFontForm ────────────────────────────────────────────────────────────────

interface AddFontFormProps {
  /** Called when the form closes. `uploadedName` is the printer-storage
   *  name of the freshly-loaded font when the upload succeeded, or
   *  undefined for cancel / upload-failed. */
  onDone: (uploadedName?: string) => void;
}

function AddFontForm({ onDone }: AddFontFormProps) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  const handleFileChange = useCallback(async (file: File) => {
    // Default to the source filename uppercased — Zebra printer storage
    // conventionally uses uppercase ALL.TTF style identifiers, and a
    // freshly-picked file is almost always the user's intended name.
    const printerName = name.trim() || file.name.toUpperCase();
    setUploading(true);
    setUploadFailed(false);
    try {
      await loadFontFile(file, printerName);
      onDone(printerName);
    } catch {
      // Inline hint is the only signal (non-TTF/OTF, oversized, FileReader
      // failure). Codebase has no production logging path; specific causes
      // are debugged with a devtools breakpoint on this catch.
      setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  }, [name, onDone]);

  return (
    <div className="flex flex-col gap-2 p-2 rounded border border-border bg-surface-2">
      <div className="flex flex-col gap-1">
        <label className={labelCls}>{t.fonts.printerFilename}</label>
        <input
          className={inputCls}
          value={name}
          placeholder={t.fonts.printerFilenamePlaceholder}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,.TTF,.OTF"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileChange(file);
          e.target.value = '';
        }}
      />

      {uploadFailed && (
        <p className="text-[10px] font-mono text-red-400">{t.fonts.uploadError}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 px-2 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 disabled:opacity-40 transition-opacity"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '…' : t.fonts.upload}
        </button>
        <button
          type="button"
          className="px-2 py-1.5 rounded text-xs font-mono border border-border text-muted hover:text-text transition-colors"
          onClick={() => onDone()}
          disabled={uploading}
        >
          {t.fonts.cancel}
        </button>
      </div>
    </div>
  );
}
