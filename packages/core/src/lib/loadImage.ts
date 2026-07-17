/** Load an image from a URL or data-URL. Rejects with `message` on failure.
 *  Centralises the new Image() + onload/onerror decode boilerplate. */
export function loadImage(src: string, message = 'Failed to load image'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(message));
    img.src = src;
  });
}
