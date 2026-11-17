// Headshot processing in the browser: centre-crop to a square, resize to 800x800, re-encode to WebP.
// Drawing through a canvas drops all EXIF data (including location).
export const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SIZE = 800;

export async function processHeadshot(file: File): Promise<Blob> {
  if (!TYPES.includes(file.type)) throw new Error('Use a JPEG, PNG or WebP image.');
  if (file.size > MAX_BYTES) throw new Error('The image is larger than 10 MB.');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  // The storage bucket accepts up to 1 MB; lower the quality if needed.
  for (const q of [0.86, 0.72, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', q));
    if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot save WebP images.');
    if (blob.size <= 1024 * 1024) return blob;
  }
  throw new Error('The image is still too large after resizing.');
}
