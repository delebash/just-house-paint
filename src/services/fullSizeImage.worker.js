// SPDX-License-Identifier: MIT
// Save image's painting, off the page's thread (a module Web Worker, started by ./fullSizeImage.js):
// the original decoded at the size it is saved at, each part's outline scaled to that size, the same
// painter as the screen's (./painter.js) and the JPEG — on OffscreenCanvas, Canvas 2D in a worker
// (developer.mozilla.org/docs/Web/API/OffscreenCanvas). One message in, one answer out: { blob } or
// { error: { message } }.
import { createPainter } from "./painter.js";

/** The original (a Blob) at `width` × `height`: its RGBA pixels — decoded and scaled in one step
 *  (createImageBitmap's resize options, html.spec.whatwg.org — ImageBitmapOptions). */
async function pixelsAt(photo, width, height) {
  const bitmap = await createImageBitmap(photo, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
  const ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return ctx.getImageData(0, 0, width, height).data;
}

/** An outline (8-bit, `mw` × `mh`) scaled to `width` × `height` — drawn the way the screen's
 *  maskImage.js maskOf scales one (Canvas 2D's drawImage, smoothed edges). */
function scaleMask(mask, mw, mh, width, height) {
  const grey = new ImageData(mw, mh);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    grey.data[p] = mask[i];
    grey.data[p + 1] = mask[i];
    grey.data[p + 2] = mask[i];
    grey.data[p + 3] = 255;
  }
  const src = new OffscreenCanvas(mw, mh);
  src.getContext("2d").putImageData(grey, 0, 0);
  const ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}

/** The painted image as a JPEG Blob — what fullSizeImage.js paintFullSize documents. */
export async function paintImage({ photo, width, height, masks, maskWidth, maskHeight, colors, order, light = 1, current = {}, texture = 1, quality }) {
  const painter = createPainter({ rgba: await pixelsAt(photo, width, height), width, height });
  for (const { key, mask } of masks) painter.setMask(key, scaleMask(mask, maskWidth, maskHeight, width, height), texture);
  const { rgba } = painter.paint(colors, order, { light, current });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

/** The worker's one message: paint, answer, done. */
export async function onPaintMessage({ data }, post = (m) => globalThis.postMessage(m)) {
  try {
    post({ blob: await paintImage(data) });
  } catch (e) {
    post({ error: { message: String(e?.message || e) } });
  }
}

// only inside a worker (a test imports the functions above)
if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) globalThis.onmessage = (e) => onPaintMessage(e);
