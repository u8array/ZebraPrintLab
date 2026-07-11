import { useEffect, useRef } from 'react';
import { rasterizeMono, monoRasterToRgba } from '../../lib/imageToZpl';
import { loadImage } from '../../lib/loadImage';

/** Mono-thresholded print-result thumbnail (WYSIWYG). Draws straight to a
 *  canvas (no toDataURL / React state per frame) so threshold-slider drags stay
 *  cheap; clears on a source change so no stale frame sits next to the new
 *  caption, and keeps the last frame across a re-raster so drags don't flicker. */
export function MonoThumbnail({ dataUrl, name, widthDots, threshold }: {
  dataUrl: string;
  name: string;
  widthDots: number;
  threshold: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevDataUrl = useRef(dataUrl);
  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    // Source changed: clear at once so the previous image doesn't linger next
    // to the new caption while the new raster loads.
    if (canvas && prevDataUrl.current !== dataUrl) {
      prevDataUrl.current = dataUrl;
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    void loadImage(dataUrl).then((img) => {
      const c = canvasRef.current;
      if (!active || !c) return;
      const raster = rasterizeMono(img, widthDots, threshold);
      if (!raster) return;
      c.width = raster.widthDots;
      c.height = raster.heightDots;
      c.getContext('2d')?.putImageData(
        new ImageData(monoRasterToRgba(raster), raster.widthDots, raster.heightDots),
        0,
        0,
      );
    }).catch(() => {
      // A thumbnail that fails to decode just stays blank (as before).
    });
    return () => {
      active = false;
    };
  }, [dataUrl, widthDots, threshold]);
  return (
    <canvas
      ref={canvasRef}
      aria-label={name}
      className="max-w-full max-h-20 object-contain rounded border border-border bg-white"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
