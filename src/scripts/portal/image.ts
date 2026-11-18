// Headshot processing in the browser: crop to a square (the member can move the frame), shrink to at most
// 1200x1200 and re-encode.
// Drawing through a canvas drops all EXIF data (including location).
// Output is WebP where the browser can write it, and JPEG in Safari (iPhone, iPad, Mac), which cannot.
export const MAX_BYTES = 50 * 1024 * 1024; // largest photo a member may pick
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const SIZE = 1200; // stored edge length: sharp on high-density phone screens
const MAX_OUT = 1024 * 1024; // the storage bucket accepts up to 1 MB
const MAX_CANVAS = 4096; // stays inside every browser's canvas limit

function draw(source: CanvasImageSource, x: number, y: number, side: number, target: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  // White behind transparent photos, so a JPEG copy never turns the background black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target, target);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x, y, side, side, 0, 0, target, target);
  return canvas;
}

export type Shape = 'portrait' | 'landscape' | 'square';
// Where the square is taken from: 0 = top (or left), 0.5 = middle, 1 = bottom (or right).
// Tall photos start at the top, because that is where the head is; wide photos start in the middle.
export const defaultPosition = (shape: Shape) => (shape === 'portrait' ? 0 : 0.5);

export async function processHeadshot(file: File, position?: number): Promise<{ blob: Blob; shape: Shape }> {
  const type = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : '');
  if (!TYPES.includes(type)) throw new Error('Use a JPEG, PNG, WebP or HEIC image.');
  if (file.size > MAX_BYTES) throw new Error('The image is larger than 50 MB.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser cannot read that photo. Save it as a JPEG and try again.');
  }
  const side = Math.min(bmp.width, bmp.height);
  const shape: Shape = bmp.height > bmp.width ? 'portrait' : bmp.width > bmp.height ? 'landscape' : 'square';
  const pos = Math.min(1, Math.max(0, position ?? defaultPosition(shape)));
  const sx = shape === 'landscape' ? (bmp.width - side) * pos : 0;
  const sy = shape === 'portrait' ? (bmp.height - side) * pos : 0;
  const out = Math.min(SIZE, side); // never enlarge a small photo
  // Shrink in halving steps: one big jump from a very large photo looks soft in some browsers.
  let canvas = draw(bmp, sx, sy, side, side > out * 2 ? Math.min(MAX_CANVAS, Math.round(side / 2)) : out);
  bmp.close();
  while (canvas.width > out) canvas = draw(canvas, 0, 0, canvas.width, canvas.width > out * 2 ? Math.round(canvas.width / 2) : out);
  // Keep the best quality that fits the storage limit. Safari hands back a PNG when asked for WebP,
  // so if the result is not the type we asked for, move on to JPEG.
  for (const want of ['image/webp', 'image/jpeg']) {
    for (const q of [0.92, 0.86, 0.78, 0.68, 0.55, 0.42]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, want, q));
      if (!blob || blob.type !== want) break;
      if (blob.size <= MAX_OUT) return { blob, shape };
    }
  }
  throw new Error('The image is still too large after resizing.');
}
