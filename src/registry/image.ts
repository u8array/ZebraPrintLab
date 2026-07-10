import type { ObjectTypeCore } from '../types/ObjectType';
import { graphicFieldPos } from './zplHelpers';
import { getImage } from '../lib/imageCache';
import { formatStoragePath } from '../lib/storagePath';
import { rasterToGfa } from '../lib/imageToZpl';
import { isAxisSwapped, objectRotation, type ZplRotation } from './rotation';

/** ^GF rows are byte-packed, so the emitted (and re-parsed) width is the next
 *  multiple of 8. Shared by the emitter and the home-shift drop check so a
 *  right-justified ^FT image keys its anchor off the same width. */
export function gfByteWidth(widthDots: number): number {
  return Math.ceil(widthDots / 8) * 8;
}

/** Emitted image height in dots. A cached image scales widthDots by the natural
 *  aspect (resize keeps only widthDots in sync, so heightDots can be stale);
 *  placeholders/opaque graphics fall back to the stored heightDots. Shared by
 *  the emitter and the home-shift drop check so the ^FT bottom anchor agrees. */
export function imageEmitHeight(p: ImageProps): number {
  const cached = getImage(p.imageId);
  // max(1,…) mirrors rasterToGfa's clamp so the anchor footprint can't diverge
  // from the emitted GRF at an extreme aspect (widthDots*aspect rounding to 0).
  return cached
    ? Math.max(1, Math.round(p.widthDots * (cached.height / cached.width)))
    : p.heightDots ?? p.widthDots;
}

/** An image rotates only when it's an inline cached bitmap: ^XG recall and
 *  opaque rawGf can't be re-encoded. The single predicate for "this instance
 *  turns", so the rotate button, emit footprint, and canvas can't disagree. */
export function isImageRotatable(p: ImageProps): boolean {
  return !!getImage(p.imageId) && !p.storedAs && !p.rawGf;
}

/** Emitted (byte-padded) footprint of the image field, axes swapped on a baked
 *  R/B rotation. Shared by toZPL and the generator's home-shift drop check so
 *  the two can't disagree on the anchor footprint. */
export function imageEmitDims(p: ImageProps): { width: number; height: number } {
  if (isImageRotatable(p) && isAxisSwapped(objectRotation(p))) {
    return { width: gfByteWidth(imageEmitHeight(p)), height: p.widthDots };
  }
  return { width: gfByteWidth(p.widthDots), height: imageEmitHeight(p) };
}

export interface ImageProps {
  /** ID into the image cache */
  imageId: string;
  /** 90-degree orientation. `^GF` has no orientation letter, so a non-N
   *  rotation is baked into the emitted bitmap (see toZPL); the canvas shows it
   *  via rotatedGroupTransform. Only cached (editable) images honour it.
   *  Optional: designs saved before image rotation existed omit it (read as
   *  'N' via objectRotation). New images seed it from defaultProps. */
  rotation?: ZplRotation;
  /** Target width in dots (height derived from aspect ratio when a cached
   *  PNG is available; falls back to `heightDots` for recall-only
   *  placeholders). */
  widthDots: number;
  /** Override height for placeholder/recall-only images that have no
   *  cached bytes; without it the box would snap to a fixed default
   *  and ignore the user's drag. Only consulted when `imageId` does
   *  not resolve to a cached image. */
  heightDots?: number;
  /** Luminance threshold for mono conversion (0-255) */
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

/** Synchronously generate ^GFA using a blocking canvas (for toZPL), rotation
 *  baked in. Shares the encoder with the async panel path via rasterToGfa. */
function gfaSync(dataUrl: string, widthDots: number, threshold: number, rotation: ZplRotation): string {
  const img = new Image();
  // data-URL loads are synchronous on a freshly-created Image.
  img.src = dataUrl;
  if (!img.complete || !img.naturalWidth) return '';
  return rasterToGfa(img, widthDots, threshold, rotation).zpl;
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
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 200 },

  // No resolvable bytes (no opaque ^GF, no recall path, nothing cached) emits a
  // blank ^FD^FS, so flag the silent empty graphic. Pure (mirrors toZPL), so it
  // also covers exportable-but-hidden images the canvas never renders.
  preflight: (obj) => {
    const p = obj.props;
    const resolvable = !!p.rawGf || !!p.storedAs || !!getImage(p.imageId);
    return resolvable ? [] : [{ kind: 'imageMissing' }];
  },

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
    const cached = getImage(p.imageId);
    // ^FT anchors the graphic's bottom-left (spec p.205); right-justified ^FT
    // keys its x off the byte-padded ^GF width. imageEmitDims applies the R/B
    // axis swap (cached only), and the same helper feeds the home-shift drop
    // check so the two agree. ^FO ignores the footprint.
    const d = imageEmitDims(p);
    const anchor = graphicFieldPos(obj, d.width, d.height);
    // Opaque graphic: re-emit the original ^GF verbatim at the (possibly moved)
    // field position. The bytes were never decoded, so there's nothing to regen.
    if (p.rawGf) return `${anchor}${p.rawGf}^FS`;
    // Recall path: upload happened in the preamble; here we just reference
    // it via ^XG. The `.GRF` extension is implicit on `~DY{path},A,G,…`;
    // Zebra firmware persists the file as `path.GRF` and `^XG` resolves
    // the dot-suffixed form.
    if (p.storedAs) {
      return `${anchor}^XG${formatStoragePath(p.storedAs, true)},1,1^FS`;
    }
    if (!cached) return `${anchor}^FD^FS`;
    // Cached: bake the rotation into the bytes (^GF has no orientation letter).
    // The cache is always upright, so a rotated field regenerates fresh here.
    const rot = objectRotation(p);
    const gfa = rot === 'N'
      ? (p._gfaCache || gfaSync(cached.dataUrl, p.widthDots, p.threshold, 'N'))
      : gfaSync(cached.dataUrl, p.widthDots, p.threshold, rot);
    return `${anchor}${gfa}^FS`;
  },
};
