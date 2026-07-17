import { createElement, type ComponentType, type SVGProps } from 'react';
import { loadImage } from '@zplab/core/lib/loadImage';

/** Rasterizes an SVG icon to RGBA bytes for the native OS menu, which takes
 *  bitmaps not SVG. `color` replaces `currentColor` so the caller can match the
 *  OS theme. Browser-only (canvas + react-dom/server). */
export async function rasterizeIcon(
  Icon: ComponentType<SVGProps<SVGSVGElement>>,
  color: string,
  size: number,
): Promise<Uint8Array | null> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const markup = renderToStaticMarkup(createElement(Icon));
  // A blob-loaded SVG is a standalone document and needs the xmlns
  // declaration; inline-JSX icons (e.g. GitHubIcon) legitimately omit it.
  const ns = markup.includes('xmlns=') ? '' : 'xmlns="http://www.w3.org/2000/svg" ';
  const svg = markup
    .replace('<svg ', `<svg ${ns}width="${size}" height="${size}" `)
    .replaceAll('currentColor', color);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url, 'svg rasterize failed');
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    return new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer);
  } finally {
    URL.revokeObjectURL(url);
  }
}
