// SPDX-License-Identifier: MIT
// Save image, from the page's side: the painted photo at full size — the original scaled down to at
// most the `photos.fullSizeMaxMegapixels` setting (Settings → General; a 48 MP photo painted whole
// took 47 s and 4.2 GB, measured) — painted in a Web Worker (./fullSizeImage.worker.js, Vite's
// standard worker import: vite.dev/guide/features#web-workers), so the page stays responsive while
// it works.
import { i18n } from "../i18n/index.js";

/** The size the image is saved at: the original's, or — over `maxMegapixels` — scaled down to it,
 *  the same shape. No limit when the setting has no positive number. */
export function exportSize(width, height, maxMegapixels) {
  const max = Number(maxMegapixels) * 1e6;
  if (!(max > 0) || width * height <= max) return { width, height };
  const k = Math.sqrt(max / (width * height));
  return { width: Math.max(1, Math.floor(width * k)), height: Math.max(1, Math.floor(height * k)) };
}

/**
 * Paint the image in a worker; resolves its JPEG Blob. `photo`: the original (a Blob); `width` ×
 * `height`: the size to paint at (exportSize); `masks`: [{ key, mask }] — the parts' outlines at
 * `maskWidth` × `maskHeight` (the display photo's), copied: the copies move to the worker, the page
 * keeps its own; `colors`, `order`, `light`, `current`, `texture`: as the screen paints them;
 * `quality`: the JPEG's (0–1).
 */
export function paintFullSize({ masks, ...rest }) {
  const copies = masks.map(({ key, mask }) => ({ key, mask: mask.slice() }));
  const worker = new Worker(new URL("./fullSizeImage.worker.js", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const failed = (message) => new Error(message || i18n.global.t("house.export.failed"));
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data?.error) reject(failed(data.error.message));
      else resolve(data.blob);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(failed(e?.message));
    };
    worker.postMessage(
      { ...rest, masks: copies },
      copies.map((c) => c.mask.buffer),
    );
  });
}
