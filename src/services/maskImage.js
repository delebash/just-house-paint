// SPDX-License-Identifier: MIT
// Masks and pictures between the server and the canvas, in the browser: a part's mask PNG (8-bit
// grey, the display photo's size) → a Uint8Array and back, and an RGBA array → something Konva
// draws. Canvas 2D (developer.mozilla.org/docs/Web/API/CanvasRenderingContext2D).

const canvasOf = (width, height) => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
};

/** A Blob (a PNG or JPEG) → its RGBA pixels at `width` × `height`. */
export async function pixelsOf(blob, width, height) {
  const bitmap = await createImageBitmap(blob);
  const c = canvasOf(width, height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return ctx.getImageData(0, 0, width, height).data;
}

/** A mask PNG → a Uint8Array (its first channel). */
export async function maskOf(blob, width, height) {
  const rgba = await pixelsOf(blob, width, height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4];
  return mask;
}

/** A mask → a grey PNG Blob (what the server stores). */
export function pngOf(mask, width, height) {
  const c = canvasOf(width, height);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"));
}

/** Draw RGBA pixels into `canvas` (created when null) — what Konva shows. */
export function drawPixels(rgba, width, height, canvas = null) {
  const c = canvas || canvasOf(width, height);
  if (c.width !== width || c.height !== height) Object.assign(c, { width, height });
  c.getContext("2d").putImageData(new ImageData(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer), width, height), 0, 0);
  return c;
}
