import { useRef, useState, useCallback, type FocusEvent } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/16/solid';
import { getAllFonts, loadFontFile, removeFont } from '../../lib/fontCache';
import { useFontCacheVersion } from '../../hooks/useFontCacheVersion';
import { useLabelStore } from '../../store/labelStore';
import { useT } from '../../lib/useT';
import {
  DEFAULT_FONT_DRIVE,
  ZPL_DRIVE_PREFIXES,
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

  // Partition customFonts: mappings whose path resolves to an uploaded
  // font are reflected inline on that font row; the rest live in the
  // printer-resident sub-section. Aliases are namespaced globally per
  // label, so duplicate detection runs across both lists.
  const aliasByPath = new Map<string, string>();
  const manualMappings: CustomFontMapping[] = [];
  for (const m of customFonts ?? []) {
    aliasByPath.set(m.path, m.alias);
    const isUploadedPath =
      m.path.startsWith(DEFAULT_FONT_DRIVE) &&
      uploadedNames.has(m.path.slice(DEFAULT_FONT_DRIVE.length));
    if (!isUploadedPath) manualMappings.push(m);
  }

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
    replaceList(
      upsertCustomFontMapping(customFonts, path, normalizeAlias(rawAlias)),
    );
  };

  const updateManualAt = (path: string, patch: Partial<CustomFontMapping>) => {
    const list = customFonts ?? [];
    replaceList(
      list.map((m) =>
        m.path === path
          ? {
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

  const removeByPath = (path: string) => {
    replaceList((customFonts ?? []).filter((m) => m.path !== path));
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
          return (
            <FontEntry
              key={font.name}
              name={font.name}
              alias={alias}
              duplicate={isDuplicateAlias(alias)}
              onAliasChange={(v) => setAliasForPath(path, v)}
              onRequestDelete={() => setPendingDelete(font.name)}
            />
          );
        })}
      </div>

      {adding ? (
        <AddFontForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className={addBtnCls} onClick={() => setAdding(true)}>
          <span className="text-accent">+</span>
          {t.fonts.addFont}
        </button>
      )}

      <CollapsibleSection
        id="fonts-printer-resident"
        title={t.fonts.manualMappingsHeading}
        defaultOpen={false}
      >
        <ManualMappingsSection
          mappings={manualMappings}
          hint={t.fonts.manualMappingsHint}
          addLabel={t.fonts.addManualMapping}
          isDuplicateAlias={isDuplicateAlias}
          onUpdate={updateManualAt}
          onRemove={removeByPath}
          onAdd={addManual}
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
  onAliasChange: (next: string) => void;
  onRequestDelete: () => void;
}

function FontEntry({
  name,
  alias,
  duplicate,
  onAliasChange,
  onRequestDelete,
}: FontEntryProps) {
  const t = useT();

  return (
    <div className="group grid grid-cols-[1fr_3rem_auto] items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border-2 hover:bg-surface-2 transition-colors">
      <span
        className="font-mono text-xs text-text truncate"
        title={name}
      >
        {name}
      </span>
      <input
        type="text"
        className={`${inputCls} text-center ${duplicate ? 'border-red-500' : ''}`}
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
      <button
        type="button"
        onClick={onRequestDelete}
        className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-muted hover:text-red-400 transition-all px-1"
        title={t.fonts.delete}
        aria-label={t.fonts.delete}
      >
        ×
      </button>
    </div>
  );
}

// ── ManualMappingsSection ──────────────────────────────────────────────────────

interface ManualMappingsSectionProps {
  mappings: CustomFontMapping[];
  hint: string;
  addLabel: string;
  isDuplicateAlias: (alias: string) => boolean;
  onUpdate: (currentPath: string, patch: Partial<CustomFontMapping>) => void;
  onRemove: (path: string) => void;
  onAdd: () => void;
}

function ManualMappingsSection({
  mappings,
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
    path: string,
    alias: string,
  ) => {
    const row = e.currentTarget;
    requestAnimationFrame(() => {
      if (!alias && !path && !row.contains(document.activeElement)) {
        onRemove(path);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted px-1 leading-relaxed">{hint}</p>
      {mappings.map((m) => {
        const dup = isDuplicateAlias(m.alias);
        // Key: stable across edits as long as alias and path don't
        // change at the same time. For fresh empty rows the auto-
        // assigned alias from nextFreeAlias is unique per row, which
        // gives a stable identity until the user types a path.
        const rowKey = m.path || `__alias__${m.alias}`;
        return (
          <div
            key={rowKey}
            className="grid grid-cols-[3rem_1fr_auto] gap-2 items-center"
            onBlur={(e) => handleBlur(e, m.path, m.alias)}
          >
            <input
              type="text"
              className={`${inputCls} text-center ${dup ? 'border-red-500' : ''}`}
              maxLength={1}
              placeholder="A-Z"
              title={
                dup
                  ? t.label.customFontsDuplicateAlias
                  : t.label.customFontsAliasHint
              }
              aria-invalid={dup || undefined}
              value={m.alias}
              onChange={(e) => onUpdate(m.path, { alias: e.target.value })}
            />
            <input
              type="text"
              className={inputCls}
              list={PATHS_DATALIST_ID}
              placeholder={t.label.customFontsPath}
              value={m.path}
              onChange={(e) => onUpdate(m.path, { path: e.target.value })}
            />
            <button
              type="button"
              className="p-1 text-muted hover:text-text"
              onClick={() => onRemove(m.path)}
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
  onDone: () => void;
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
      onDone();
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
          onClick={onDone}
          disabled={uploading}
        >
          {t.fonts.cancel}
        </button>
      </div>
    </div>
  );
}
