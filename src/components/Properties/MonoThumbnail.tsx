import { useState, useEffect } from 'react';
import { monoPreviewCanvas } from '../../lib/imageToZpl';

/** Mono-thresholded print-result thumbnail (WYSIWYG). Keeps the last frame
 *  while a new threshold/width rasterizes so slider drags don't flicker. */
export function MonoThumbnail({ dataUrl, name, widthDots, threshold }: {
  dataUrl: string;
  name: string;
  widthDots: number;
  threshold: number;
}) {
  // Tag the rendered frame with its source url so a frame from a previous
  // image is discarded the instant a different image is selected (no stale
  // thumbnail next to the new caption), while threshold tweaks keep showing
  // the old frame until the re-raster lands.
  const [frame, setFrame] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      const canvas = monoPreviewCanvas(img, widthDots, threshold);
      if (canvas) setFrame({ url: dataUrl, src: canvas.toDataURL() });
    };
    img.src = dataUrl;
    return () => {
      active = false;
    };
  }, [dataUrl, widthDots, threshold]);
  const src = frame && frame.url === dataUrl ? frame.src : null;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={name}
      className="max-w-full max-h-20 object-contain rounded border border-border bg-white"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
