import { useState, useRef, useCallback } from 'react';
import { InformationCircleIcon, TrashIcon } from '@heroicons/react/16/solid';
import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { buttonCls, inputCls, labelCls } from '../components/Properties/styles';
import { loadImageFile, getImage, getAllImages, removeImage } from '../lib/imageCache';
import { imageToGFA } from '../lib/imageToZpl';
import {
  defaultStorageName,
  formatStoragePath,
  MAX_STORAGE_NAME_LEN,
  STORAGE_DEVICES,
  STORAGE_NAME_FILTER_RE,
  type StorageDevice,
} from '../lib/storagePath';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ImageProps } from './image';

export const imagePanel: ObjectTypeUi<ImageProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadFailed, setUploadFailed] = useState(false);
    const [pendingCacheDelete, setPendingCacheDelete] = useState(false);

    const cached = getImage(p.imageId);
    const allImages = getAllImages();

    const handleUpload = useCallback(async (file: File) => {
      setUploading(true);
      setUploadFailed(false);
      try {
        const entry = await loadImageFile(file);
        // Pre-generate GFA cache
        const result = await imageToGFA(entry.dataUrl, p.widthDots, p.threshold);
        onChange({ imageId: entry.id, _gfaCache: result.zpl });
      } catch {
        // Surface the failure inline (non-image MIME, oversized, decode error).
        setUploadFailed(true);
      } finally {
        setUploading(false);
      }
    }, [onChange, p.widthDots, p.threshold]);

    const handleImageSelect = useCallback(async (imageId: string) => {
      // Empty selection = "no image bytes". Legitimate when the user is
      // setting up a recall-only reference (storedAs without a local
      // preview image). Clear the cache pointer + ^GFA cache so the
      // ZPL emitter doesn't carry stale bytes from the previous source.
      if (!imageId) {
        onChange({ imageId: '', _gfaCache: undefined });
        return;
      }
      const img = getImage(imageId);
      if (!img) return;
      const result = await imageToGFA(img.dataUrl, p.widthDots, p.threshold);
      onChange({ imageId, _gfaCache: result.zpl });
    }, [onChange, p.widthDots, p.threshold]);

    const handleWidthChange = useCallback(async (widthDots: number) => {
      const img = getImage(p.imageId);
      if (!img) { onChange({ widthDots }); return; }
      const result = await imageToGFA(img.dataUrl, widthDots, p.threshold);
      onChange({ widthDots, _gfaCache: result.zpl });
    }, [onChange, p.imageId, p.threshold]);

    const handleThresholdChange = useCallback(async (threshold: number) => {
      const img = getImage(p.imageId);
      if (!img) { onChange({ threshold }); return; }
      const result = await imageToGFA(img.dataUrl, p.widthDots, threshold);
      onChange({ threshold, _gfaCache: result.zpl });
    }, [onChange, p.imageId, p.widthDots]);

    // Lifted local const so the storage-section closures get a narrowed
    // reference that survives into onChange callbacks. Without it TS
    // re-widens `p.storedAs` to `... | undefined` inside the handlers
    // and we'd need `?.`-fallbacks for every field access.
    const storedAs = p.storedAs;

    return (
      <div className="flex flex-col gap-3">
        {/* Image select / upload */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.image.source}</label>
          {allImages.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                className={`${inputCls} flex-1`}
                value={p.imageId}
                onChange={(e) => handleImageSelect(e.target.value)}
              >
                <option value="">{t.registry.image.selectImage}</option>
                {allImages.map((img) => (
                  <option key={img.id} value={img.id}>{img.name}</option>
                ))}
              </select>
              {/* Delete the *cached* file (data-URL) from imageCache +
                  localStorage. Different from removing the image-object
                  via Del: this clears the bytes shared across all
                  objects referencing the same imageId. Skip when the
                  current image-object has no source selected. */}
              {p.imageId && (
                <button
                  type="button"
                  className="p-1.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
                  title={t.registry.image.removeFromCache}
                  onClick={() => setPendingCacheDelete(true)}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className={buttonCls}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? t.registry.image.uploading : t.registry.image.upload}
          </button>
          {uploadFailed && (
            <p className="text-[10px] font-mono text-red-400">{t.registry.image.uploadError}</p>
          )}
        </div>

        {/* Preview thumbnail */}
        {cached && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.image.preview}</label>
            <img
              src={cached.dataUrl}
              alt={cached.name}
              className="max-w-full max-h-20 object-contain rounded border border-border bg-white"
            />
            <span className="text-[10px] text-muted font-mono">
              {cached.width} × {cached.height} px
            </span>
          </div>
        )}

        {/* Width in dots */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.image.widthDots}</label>
          <input
            type="number"
            className={inputCls}
            value={p.widthDots}
            min={8}
            step={8}
            onChange={(e) => handleWidthChange(Number(e.target.value))}
          />
        </div>

        {/* Mono threshold */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.image.threshold}</label>
          <input
            type="range"
            min={1}
            max={255}
            value={p.threshold}
            onChange={(e) => handleThresholdChange(Number(e.target.value))}
            className="accent-accent"
          />
          <span className="text-[10px] text-muted font-mono text-right">{p.threshold}</span>
        </div>

        {/* Printer storage (~DY + ^XG). Section label + info icon are
            always visible so the feature is discoverable in both states;
            the body switches between an Activate-button (off) and the
            device/name editor (on). Border-top separates it visually
            from the rendering properties above. */}
        <div className="flex flex-col gap-1 mt-1 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <label className={labelCls}>{t.registry.image.storage}</label>
            <InformationCircleIcon
              className="w-3 h-3 text-muted/60 cursor-help shrink-0"
              title={t.registry.image.storeOnPrinterHint}
            />
          </div>
          {storedAs ? (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <select
                  className={inputCls}
                  value={storedAs.device}
                  onChange={(e) =>
                    onChange({
                      storedAs: {
                        ...storedAs,
                        device: e.target.value as StorageDevice,
                      },
                    })
                  }
                >
                  {STORAGE_DEVICES.map((d) => (
                    <option key={d} value={d}>{d}:</option>
                  ))}
                </select>
                <input
                  className={inputCls}
                  value={storedAs.name}
                  maxLength={MAX_STORAGE_NAME_LEN}
                  onChange={(e) => {
                    const next = e.target.value
                      .toUpperCase()
                      .replace(STORAGE_NAME_FILTER_RE, '')
                      .slice(0, MAX_STORAGE_NAME_LEN);
                    // Silently ignore keystrokes that would empty the name:
                    // an empty stem produces broken ZPL (`~DYR:,A,G,...`),
                    // and a controlled-component "refuses-to-delete-last-char"
                    // is a clearer constraint signal than a tooltip.
                    if (!next) return;
                    onChange({
                      storedAs: { ...storedAs, name: next },
                    });
                  }}
                />
              </div>
              <span className="text-[10px] text-muted font-mono">
                {formatStoragePath(storedAs, true)}
              </span>
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={storedAs.embedInZpl !== false}
                  onChange={(e) =>
                    onChange({
                      storedAs: { ...storedAs, embedInZpl: e.target.checked },
                    })
                  }
                />
                <span className={labelCls}>{t.registry.image.embedInZpl}</span>
                <InformationCircleIcon
                  className="w-3.5 h-3.5 text-muted/60 cursor-help shrink-0"
                  title={t.registry.image.embedInZplHint}
                />
              </label>
              <button
                type="button"
                className={buttonCls}
                onClick={() => onChange({ storedAs: undefined })}
              >
                {t.registry.image.storeInline}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={buttonCls}
              onClick={() =>
                onChange({ storedAs: { device: 'R', name: defaultStorageName() } })
              }
            >
              {t.registry.image.storeOnPrinter}
            </button>
          )}
        </div>
        {pendingCacheDelete && (
          <ConfirmDialog
            message={t.registry.image.removeFromCacheConfirm}
            confirmLabel={t.registry.image.removeFromCache}
            cancelLabel={t.app.cancel}
            destructive
            onConfirm={() => {
              removeImage(p.imageId);
              onChange({ imageId: '', _gfaCache: undefined });
              setPendingCacheDelete(false);
            }}
            onCancel={() => setPendingCacheDelete(false)}
          />
        )}
      </div>
    );
  },
};
