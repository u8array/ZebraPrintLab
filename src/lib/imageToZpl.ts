/**
 * Convert a raster image to ZPL ^GFA (Graphic Field ASCII hex) command.
 *
 * Process:
 * 1. Draw image into a canvas at the target dot resolution (rotation baked in)
 * 2. Convert to 1-bit monochrome (threshold)
 * 3. Encode as hex bytes (MSB first, left-to-right)
 * 4. Emit ^GFA,{totalBytes},{totalBytes},{bytesPerRow},{hexData}
 */
import { isAxisSwapped, type ZplRotation } from '../registry/rotation';

export interface GfaResult {
  /** Complete ^GFA command string */
  zpl: string;
  /** Emitted (byte-padded) width in dots */
  widthDots: number;
  /** Emitted height in dots */
  heightDots: number;
}

/** Draw a loaded raster into a mono ^GFA. The single encoder shared by the sync
 *  (toZPL) and async (panel) paths so their pixel/threshold/packing logic can't
 *  drift. `^GF` has no orientation letter, so a rotated image ships rotated
 *  bytes: the draw is turned into a canvas whose axes swap on R/B, matching the
 *  Konva rotatedGroupTransform the canvas shows. */
export function rasterToGfa(
  img: CanvasImageSource & { naturalWidth: number; naturalHeight: number },
  widthDots: number,
  threshold: number,
  rotation: ZplRotation = 'N',
): GfaResult {
  const aspect = img.naturalHeight / img.naturalWidth;
  const uprightH = Math.max(1, Math.round(widthDots * aspect));
  const swap = isAxisSwapped(rotation);
  const outW = swap ? uprightH : widthDots;
  const outH = swap ? widthDots : uprightH;

  const bytesPerRow = Math.ceil(outW / 8);
  const paddedWidth = bytesPerRow * 8;

  const canvas = document.createElement('canvas');
  canvas.width = paddedWidth;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, paddedWidth, outH);

  ctx.save();
  switch (rotation) {
    case 'R': ctx.translate(uprightH, 0); ctx.rotate(Math.PI / 2); break;
    case 'I': ctx.translate(widthDots, uprightH); ctx.rotate(Math.PI); break;
    case 'B': ctx.translate(0, widthDots); ctx.rotate(-Math.PI / 2); break;
  }
  ctx.drawImage(img, 0, 0, widthDots, uprightH);
  ctx.restore();

  const pixels = ctx.getImageData(0, 0, paddedWidth, outH).data;
  const totalBytes = bytesPerRow * outH;
  const hexChars: string[] = [];
  for (let row = 0; row < outH; row++) {
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const px = byteIdx * 8 + bit;
        const idx = (row * paddedWidth + px) * 4;
        // Luminance (BT.601); 1 = black dot in ZPL. Padding stays white.
        const lum = 0.299 * (pixels[idx] ?? 255) + 0.587 * (pixels[idx + 1] ?? 255) + 0.114 * (pixels[idx + 2] ?? 255);
        if (lum < threshold) byte |= 0x80 >> bit;
      }
      hexChars.push(byte.toString(16).toUpperCase().padStart(2, '0'));
    }
  }

  return {
    zpl: `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexChars.join('')}`,
    widthDots: paddedWidth,
    heightDots: outH,
  };
}

/**
 * @param dataUrl   The image as a data-URL
 * @param widthDots Target width in dots (height derived from aspect ratio)
 * @param threshold Luminance threshold 0-255 for black (default 128)
 * @param rotation  Baked-in orientation (default 'N')
 */
export function imageToGFA(
  dataUrl: string,
  widthDots: number,
  threshold = 128,
  rotation: ZplRotation = 'N',
): Promise<GfaResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // A 0-dimension decode that still fires onload would make aspect NaN and
      // blow up the canvas; treat it like a load failure (gfaSync guards too).
      if (!img.naturalWidth) { reject(new Error('Image decoded with zero width')); return; }
      resolve(rasterToGfa(img, widthDots, threshold, rotation));
    };
    img.onerror = () => reject(new Error('Failed to load image for GFA conversion'));
    img.src = dataUrl;
  });
}
