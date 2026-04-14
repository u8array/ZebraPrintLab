/**
 * Convert a raster image to ZPL ^GFA (Graphic Field ASCII hex) command.
 *
 * Process:
 * 1. Draw image into a canvas at the target dot resolution
 * 2. Convert to 1-bit monochrome (threshold)
 * 3. Encode as hex bytes (MSB first, left-to-right)
 * 4. Emit ^GFA,{totalBytes},{totalBytes},{bytesPerRow},{hexData}
 */

export interface GfaResult {
  /** Complete ^GFA command string */
  zpl: string;
  /** Width in dots */
  widthDots: number;
  /** Height in dots */
  heightDots: number;
}

/**
 * @param dataUrl   The image as a data-URL
 * @param widthDots Target width in dots (height derived from aspect ratio)
 * @param threshold Luminance threshold 0–255 for black (default 128)
 */
export function imageToGFA(
  dataUrl: string,
  widthDots: number,
  threshold = 128,
): Promise<GfaResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalHeight / img.naturalWidth;
      const heightDots = Math.max(1, Math.round(widthDots * aspect));

      // bytesPerRow must be a whole number (width padded to 8-bit boundary)
      const bytesPerRow = Math.ceil(widthDots / 8);
      const paddedWidth = bytesPerRow * 8;

      const canvas = document.createElement('canvas');
      canvas.width = paddedWidth;
      canvas.height = heightDots;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context');

      // White background (ZPL: 0 = white)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedWidth, heightDots);

      // Draw image scaled to target size
      ctx.drawImage(img, 0, 0, widthDots, heightDots);

      const imageData = ctx.getImageData(0, 0, paddedWidth, heightDots);
      const pixels = imageData.data; // RGBA

      const totalBytes = bytesPerRow * heightDots;
      const hexChars: string[] = [];

      for (let row = 0; row < heightDots; row++) {
        for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const px = byteIdx * 8 + bit;
            const idx = (row * paddedWidth + px) * 4;
            const r = pixels[idx]!;
            const g = pixels[idx + 1]!;
            const b = pixels[idx + 2]!;
            // Luminance (BT.601)
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // In ZPL: 1 = black dot, 0 = white
            if (lum < threshold) {
              byte |= (0x80 >> bit);
            }
          }
          hexChars.push(byte.toString(16).toUpperCase().padStart(2, '0'));
        }
      }

      const hexData = hexChars.join('');
      const zpl = `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}`;

      resolve({ zpl, widthDots: paddedWidth, heightDots });
    };
    img.onerror = () => reject(new Error('Failed to load image for GFA conversion'));
    img.src = dataUrl;
  });
}
