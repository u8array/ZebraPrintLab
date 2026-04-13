import { useState, useRef, useCallback } from 'react';
import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';
import { loadImageFile, getImage, getAllImages } from '../lib/imageCache';
import { imageToGFA } from '../lib/imageToZpl';

export interface ImageProps {
  /** ID into the image cache */
  imageId: string;
  /** Target width in dots (height derived from aspect ratio) */
  widthDots: number;
  /** Luminance threshold for mono conversion (0–255) */
  threshold: number;
  /** Cached GFA ZPL string — regenerated when image/width/threshold changes */
  _gfaCache?: string;
}

/** Synchronously generate ^GFA using a blocking canvas (for toZPL). */
function gfaSync(dataUrl: string, widthDots: number, threshold: number): string {
  const img = new Image();
  // data-URL loads synchronously when set on an already-created Image
  img.src = dataUrl;
  // In some browsers this might not be immediate for large images,
  // but for data-URLs it's synchronous.
  if (!img.complete || !img.naturalWidth) return '';

  const aspect = img.naturalHeight / img.naturalWidth;
  const heightDots = Math.max(1, Math.round(widthDots * aspect));
  const bytesPerRow = Math.ceil(widthDots / 8);
  const paddedWidth = bytesPerRow * 8;

  const canvas = document.createElement('canvas');
  canvas.width = paddedWidth;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, paddedWidth, heightDots);
  ctx.drawImage(img, 0, 0, widthDots, heightDots);

  const pixels = ctx.getImageData(0, 0, paddedWidth, heightDots).data;
  const totalBytes = bytesPerRow * heightDots;
  const hexChars: string[] = [];

  for (let row = 0; row < heightDots; row++) {
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const px = byteIdx * 8 + bit;
        const idx = (row * paddedWidth + px) * 4;
        const lum = 0.299 * (pixels[idx] ?? 255) + 0.587 * (pixels[idx + 1] ?? 255) + 0.114 * (pixels[idx + 2] ?? 255);
        if (lum < threshold) byte |= (0x80 >> bit);
      }
      hexChars.push(byte.toString(16).toUpperCase().padStart(2, '0'));
    }
  }

  return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexChars.join('')}`;
}

export const image: ObjectTypeDefinition<ImageProps> = {
  label: 'Image',
  icon: 'img',
  group: 'shape',
  defaultProps: {
    imageId: '',
    widthDots: 200,
    threshold: 128,
  },
  defaultSize: { width: 200, height: 200 },

  toZPL: (obj) => {
    const p = obj.props;
    const cached = getImage(p.imageId);
    if (!cached) return `${fieldPos(obj)}^FD^FS`;

    // Use cached GFA if available, otherwise generate synchronously
    const gfa = p._gfaCache || gfaSync(cached.dataUrl, p.widthDots, p.threshold);
    return `${fieldPos(obj)}${gfa}^FS`;
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const cached = getImage(p.imageId);
    const allImages = getAllImages();

    const handleUpload = useCallback(async (file: File) => {
      setUploading(true);
      try {
        const entry = await loadImageFile(file);
        // Pre-generate GFA cache
        const result = await imageToGFA(entry.dataUrl, p.widthDots, p.threshold);
        onChange({ imageId: entry.id, _gfaCache: result.zpl });
      } finally {
        setUploading(false);
      }
    }, [onChange, p.widthDots, p.threshold]);

    const handleImageSelect = useCallback(async (imageId: string) => {
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

    return (
      <div className="flex flex-col gap-3">
        {/* Image select / upload */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.image.source}</label>
          {allImages.length > 0 && (
            <select
              className={inputCls}
              value={p.imageId}
              onChange={(e) => handleImageSelect(e.target.value)}
            >
              <option value="">{t.registry.image.selectImage}</option>
              {allImages.map((img) => (
                <option key={img.id} value={img.id}>{img.name}</option>
              ))}
            </select>
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
            className="px-3 py-1.5 rounded text-xs font-mono bg-surface-2 border border-border text-text hover:bg-border transition-colors"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? t.registry.image.uploading : t.registry.image.upload}
          </button>
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
      </div>
    );
  },
};
