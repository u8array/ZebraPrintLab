import { useRef, useState, useCallback } from 'react';
import { getAllFonts, loadFontFile, removeFont } from '../../lib/fontCache';
import { useFontCacheVersion } from '../../hooks/useFontCacheVersion';
import { useT } from '../../lib/useT';
import { inputCls, labelCls } from '../Properties/styles';

export function FontManager() {
  const t = useT();
  useFontCacheVersion();

  const fonts = getAllFonts();
  const [adding, setAdding] = useState(false);

  return (
    <div className="p-3 flex flex-col gap-3">
      <p className="font-mono text-[10px] font-medium text-muted uppercase tracking-widest px-1 pt-1">
        {t.fonts.heading}
      </p>

      {fonts.length === 0 && !adding && (
        <p className="text-xs text-muted px-1">{t.fonts.noFonts}</p>
      )}

      <div className="flex flex-col gap-1">
        {fonts.map((font) => (
          <FontEntry key={font.name} name={font.name} />
        ))}
      </div>

      {adding ? (
        <AddFontForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors"
          onClick={() => setAdding(true)}
        >
          <span className="text-accent">+</span>
          {t.fonts.addFont}
        </button>
      )}
    </div>
  );
}

// ── FontEntry ──────────────────────────────────────────────────────────────────

interface FontEntryProps {
  name: string;
}

function FontEntry({ name }: FontEntryProps) {
  const t = useT();

  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border-2 hover:bg-surface-2 transition-colors">
      <span className="font-mono text-[11px] text-accent w-4 text-center shrink-0">F</span>
      <span className="flex-1 font-mono text-xs text-text truncate">{name}</span>
      <button
        type="button"
        onClick={() => removeFont(name)}
        className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-muted hover:text-red-400 transition-all px-1"
        title={t.fonts.delete}
      >
        ×
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
    const printerName = name.trim() || file.name;
    setUploading(true);
    setUploadFailed(false);
    try {
      await loadFontFile(file, printerName);
      onDone();
    } catch {
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
