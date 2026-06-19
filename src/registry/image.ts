import type { ObjectTypeCore } from '../types/ObjectType';
import { fieldPos } from './zplHelpers';
import { getImage } from '../lib/imageCache';
import { formatStoragePath } from '../lib/storagePath';

export interface ImageProps {
  /** ID into the image cache */
  imageId: string;
  /** Target width in dots (height derived from aspect ratio when a cached
   *  PNG is available; falls back to `heightDots` for recall-only
   *  placeholders). */
  widthDots: number;
  /** Override height for placeholder/recall-only images that have no
   *  cached bytes; without it the box would snap to a fixed default
   *  and ignore the user's drag. Only consulted when `imageId` does
   *  not resolve to a cached image. */
  heightDots?: number;
  /** Luminance threshold for mono conversion (0–255) */
  threshold: number;
  /** Cached GFA ZPL string; regenerated when image/width/threshold changes */
  _gfaCache?: string;
  /** Verbatim `^GF` for graphics we can't decode into an editable bitmap
   *  (binary B, compressed C, `:Z64:`, ACS run-length); re-emitted as-is to
   *  round-trip. Mutually exclusive with a cached `imageId`. */
  rawGf?: string;
  /** When set, the image is uploaded once via `~DY` (preamble) and referenced
   *  per-instance via `^XG`. Set by the parser when a ZPL stream uses the
   *  upload+recall pattern, preserved on re-export. Without this the image
   *  emits inline `^GF` as before. */
  storedAs?: {
    /** Storage device prefix without trailing colon: "R", "E", "B", or "A". */
    device: string;
    /** Filename stem (no extension); paired with `.GRF` for graphics. */
    name: string;
    /** Ship the bitmap bytes via `~DY` alongside the `^XG` reference.
     *  Default true on first toggle so a single-job ZPL is self-contained.
     *  False = recall-only: assume the file is already on printer storage,
     *  emit only `^XG`. Mirrors the customFonts `embedInZpl` pattern. */
    embedInZpl?: boolean;
  };
}

/** Synchronously generate ^GFA using a blocking canvas (for toZPL). */
function gfaSync(dataUrl: string, widthDots: number, threshold: number): string {
  const img = new Image();
  // data-URL loads are synchronous on a freshly-created Image.
  img.src = dataUrl;
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

export const image: ObjectTypeCore<ImageProps> = {
  label: 'Image',
  icon: 'img',
  zplCmd: '^GF',
  group: 'shape',
  defaultProps: {
    imageId: '',
    widthDots: 200,
    threshold: 128,
  },
  defaultSize: { width: 200, height: 200 },

  // Resize via canvas-handle:
  //  - With cached PNG → aspect locked, height re-derives from widthDots.
  //    Pick the dominant scale (largest deviation from 1) so all eight
  //    handles work for both grow and shrink. Math.max would mis-handle
  //    inward single-axis drags (sx=0.5, sy=1 → max=1 → no change).
  //  - Without cache (recall-only placeholder) → free-form. widthDots
  //    and heightDots scale independently so the user can shape the
  //    placeholder box for layout purposes.
  // _gfaCache always cleared; for cached images the hex needs regen at
  // the new width; for placeholders it's empty anyway.
  commitTransform: (obj, ctx) => {
    // Opaque verbatim graphics carry fixed bytes we can't re-encode, so the
    // box size is locked; ignore the resize.
    if (obj.props.rawGf) return {};
    const { sx, sy, snap } = ctx;
    const cached = getImage(obj.props.imageId);
    const widthDots = (scale: number): number =>
      Math.max(8, snap(Math.round(obj.props.widthDots * scale)));
    if (cached) {
      const dominant = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
      return { widthDots: widthDots(dominant), _gfaCache: undefined };
    }
    // First-resize fallback for heightDots: use the current widthDots so
    // the implicit default (square placeholder) matches what the canvas
    // renders before the user has dragged. Drifting from that (e.g. a
    // hard-coded 200) would mean the first drag visibly snaps the box.
    const baseHeight = obj.props.heightDots ?? obj.props.widthDots;
    return {
      widthDots: widthDots(sx),
      heightDots: Math.max(8, snap(Math.round(baseHeight * sy))),
      _gfaCache: undefined,
    };
  },

  toZPL: (obj) => {
    const p = obj.props;
    // Opaque graphic: re-emit the original ^GF verbatim at the (possibly moved)
    // field position. The bytes were never decoded, so there's nothing to regen.
    if (p.rawGf) return `${fieldPos(obj)}${p.rawGf}^FS`;
    // Recall path: upload happened in the preamble; here we just reference
    // it via ^XG. The `.GRF` extension is implicit on `~DY{path},A,G,…`;
    // Zebra firmware persists the file as `path.GRF` and `^XG` resolves
    // the dot-suffixed form.
    if (p.storedAs) {
      return `${fieldPos(obj)}^XG${formatStoragePath(p.storedAs, true)},1,1^FS`;
    }
    const cached = getImage(p.imageId);
    if (!cached) return `${fieldPos(obj)}^FD^FS`;
    // Use cached GFA if available, otherwise generate synchronously
    const gfa = p._gfaCache || gfaSync(cached.dataUrl, p.widthDots, p.threshold);
    return `${fieldPos(obj)}${gfa}^FS`;
  },
};
